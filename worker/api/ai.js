/**
 * Cheap AI on Cloudflare Workers AI (27 Oct, user: "what could AI do for our website, think cheap" -> a fix plan after
 * a check, and plain-English tool search). Both run on the free daily Workers AI allowance, are cached in KV and
 * capped per visitor per day, and never see anyone's file: only the numbers a check already shows on screen.
 *
 *   POST /api/ai/fixplan <- { tool, target, score, problems: [{ name, value, budget, state, tools: [slug] }] }
 *        -> { ok, steps: [{ text, tool, toolName }], ai } - ai: false = the rule-based plan (AI off, over the cap or failed)
 *   POST /api/ai/route   <- { q } -> { ok, tools: [{ id, name, route, score }] } - the tools that best match what you typed
 */
import { TOOLS } from '../../src/shared/config/tools.js';

const PLAN_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const EMBED_MODEL = '@cf/baai/bge-small-en-v1.5';
const DAILY_CAP = 40; // AI calls per visitor per day (cached answers don't count)
const CACHE_TTL = 7 * 86400;
const TOOL_BY_SLUG = new Map(TOOLS.map((t) => [t.route?.replace(/^\//, '') ?? t.id, t]));
const toolName = (slug) => TOOL_BY_SLUG.get(slug)?.name ?? slug;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const sha = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const clip = (v, n) => String(v ?? '').slice(0, n);

/** True when this visitor still has AI calls left today (counted per hashed IP; no KV = no cap, e.g. tests). */
async function underCap(request, env) {
  if (!env.TRIALS) return true;
  const day = new Date().toISOString().slice(0, 10);
  const who = await sha(`${request.headers.get('CF-Connecting-IP') || 'local'}|${env.TRIAL_SALT || 'ab'}`);
  const key = `ai:cap:${day}:${who.slice(0, 24)}`;
  const n = Number(await env.TRIALS.get(key)) || 0;
  if (n >= DAILY_CAP) return false;
  await env.TRIALS.put(key, String(n + 1), { expirationTtl: 2 * 86400 });
  return true;
}

/** Problems as the check sent them, cleaned: only known tool slugs, at most 12. */
function cleanProblems(list) {
  return (Array.isArray(list) ? list : []).slice(0, 12).map((p) => ({
    name: clip(p.name, 60), value: clip(p.value, 40), budget: clip(p.budget, 40),
    state: ['bad', 'warn'].includes(p.state) ? p.state : 'warn',
    tools: (Array.isArray(p.tools) ? p.tools : []).map(String).filter((s) => TOOL_BY_SLUG.has(s)).slice(0, 3),
  })).filter((p) => p.name && p.tools.length);
}

/** The plan with no AI: the worst problems first, one step each, with their first fixing tool (deduped). */
export function rulePlan(problems) {
  const seen = new Set();
  const steps = [];
  for (const p of [...problems].sort((a, b) => (a.state === 'bad' ? 0 : 1) - (b.state === 'bad' ? 0 : 1))) {
    const slug = p.tools.find((s) => !seen.has(s));
    if (!slug) continue;
    seen.add(slug);
    steps.push({ text: `${p.name} is ${p.value}${p.budget ? `, over the ${p.budget} budget` : ''}${p.state === 'warn' ? ' (close to the limit)' : ''}: fix it with ${toolName(slug)}.`, tool: slug, toolName: toolName(slug) });
    if (steps.length === 4) break;
  }
  return steps;
}

export async function fixPlan(request, env) {
  const body = await request.json().catch(() => ({}));
  const problems = cleanProblems(body.problems);
  const target = clip(body.target, 60);
  if (!problems.length) return json({ ok: true, steps: [], ai: false });
  const fallback = rulePlan(problems);
  const key = `ai:plan:v3:${await sha(JSON.stringify({ target, problems }))}`;
  const cached = env.TRIALS && (await env.TRIALS.get(key, 'json'));
  if (cached) return json({ ok: true, steps: cached, ai: true, cached: true });
  if (!env.AI || !(await underCap(request, env))) return json({ ok: true, steps: fallback, ai: false });
  const allowed = [...new Set(problems.flatMap((p) => p.tools))];
  try {
    const out = await env.AI.run(PLAN_MODEL, {
      messages: [
        { role: 'system', content: 'You help game and app developers make a 3D model fit a performance budget. Write a short fix plan: 2 to 4 steps, most important first. Each step is one plain sentence (max 20 words) saying what to change, quoting only the numbers given, in the pattern: Bring <problem> down from <value> to under <budget>. If a problem has no budget, give no target number at all (say what to do instead). Never calculate percentages or invent numbers. Do not mention tool names or slugs in the sentence (a button shows the tool); put the slug in the tool field, from the allowed list only. British English, no hype.' },
        { role: 'user', content: `Target: ${target || 'a realtime 3D app'}\nProblems:\n${problems.map((p) => `- ${p.name}: ${p.value} (budget ${p.budget || 'n/a'}, ${p.state === 'bad' ? 'over' : 'close'}) - tools: ${p.tools.join(', ')}`).join('\n')}\nAllowed tool slugs: ${allowed.join(', ')}` },
      ],
      response_format: { type: 'json_schema', json_schema: { type: 'object', properties: { steps: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, tool: { type: 'string' } }, required: ['text', 'tool'] } } }, required: ['steps'] } },
      max_tokens: 400,
    });
    const raw = typeof out?.response === 'string' ? JSON.parse(out.response) : out?.response;
    const steps = (raw?.steps ?? []).filter((s) => allowed.includes(s.tool) && s.text).slice(0, 4).map((s) => ({ text: clip(s.text, 220), tool: s.tool, toolName: toolName(s.tool) }));
    if (steps.length < 1) return json({ ok: true, steps: fallback, ai: false });
    if (env.TRIALS) await env.TRIALS.put(key, JSON.stringify(steps), { expirationTtl: CACHE_TTL });
    return json({ ok: true, steps, ai: true });
  } catch {
    return json({ ok: true, steps: fallback, ai: false });
  }
}

// ---- plain-English tool search: one embedding per tool (made once, kept in KV), then cosine similarity
const toolText = (t) => `${t.name}. ${t.description ?? ''} ${(t.keywords ?? []).join(', ')}`.slice(0, 500);
const cosine = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / (Math.sqrt(x * y) || 1); };

async function toolVectors(env) {
  const list = TOOLS.filter((t) => t.route);
  const key = `ai:tools:${(await sha(list.map(toolText).join('|'))).slice(0, 16)}`; // new tools or wording = new vectors
  const cached = env.TRIALS && (await env.TRIALS.get(key, 'json'));
  if (cached) return cached;
  const out = await env.AI.run(EMBED_MODEL, { text: list.map(toolText) });
  const vectors = list.map((t, i) => ({ id: t.id, name: t.name, route: t.route, v: out.data[i] }));
  if (env.TRIALS) await env.TRIALS.put(key, JSON.stringify(vectors), { expirationTtl: 30 * 86400 });
  return vectors;
}

export async function routeQuery(request, env) {
  const body = await request.json().catch(() => ({}));
  const q = clip(body.q, 200).trim().toLowerCase();
  if (q.length < 3) return json({ ok: true, tools: [] });
  const key = `ai:route:v2:${await sha(q)}`;
  const cached = env.TRIALS && (await env.TRIALS.get(key, 'json'));
  if (cached) return json({ ok: true, tools: cached, cached: true });
  if (!env.AI || !(await underCap(request, env))) return json({ ok: true, tools: [], ai: false });
  try {
    const [vectors, out] = await Promise.all([toolVectors(env), env.AI.run(EMBED_MODEL, { text: [q] })]);
    const qv = out.data[0];
    const tools = vectors.map((t) => ({ id: t.id, name: t.name, route: t.route, score: +cosine(qv, t.v).toFixed(3) }))
      .sort((a, b) => b.score - a.score).filter((t, i) => i < 3 && t.score >= 0.5);
    if (env.TRIALS && tools.length) await env.TRIALS.put(key, JSON.stringify(tools), { expirationTtl: CACHE_TTL }); // nothing found is never cached
    return json({ ok: true, tools });
  } catch {
    return json({ ok: true, tools: [], ai: false });
  }
}
