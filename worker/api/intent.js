import { TARGETS } from './glb.js';

/**
 * Turns a plain-English target ("Roblox on a low-end Android phone",
 * "Shopify product viewer", "under 5k tris, 512px textures") into concrete
 * optimisation settings. Deterministic keyword rules, no model call: the
 * same sentence always compiles to the same flags, and it costs nothing.
 * `explanation` lists every rule that fired so callers can see why.
 */

const TARGET_RULES = [
  ['quest', /\b(vr|quest|headset|oculus|xr|vision ?pro)\b/],
  ['web', /\b(web|browser|shopify|three\.?js|model[- ]viewer|product|safari|chrome|e-?commerce|website|ar|webxr)\b/],
  ['scene', /\b(scene|level|environment|map|world|terrain)\b/],
  ['character', /\b(character|hero|avatar|enemy|npc|rigged|skinned|player|creature)\b/],
  ['prop', /\b(prop|item|object|pickup|weapon|furniture|asset|icon)\b/],
];
const LOW_END = /\b(low[- ]?end|budget|old|cheap|entry[- ]level|roblox|no lag|without lag|lag|battery|android go|60 ?fps)\b/;
const HIGH_END = /\b(high[- ]?end|flagship|pro max|latest iphone)\b/;

function parseCount(text) {
  const m = /(\d+(?:\.\d+)?)\s*(k|m)?\s*(?:tris|triangles|polys|polygons|faces)\b/.exec(text);
  if (!m) return null;
  const mult = m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1;
  return Math.round(Number(m[1]) * mult);
}

function parseTextureSize(text) {
  const m = /\b(256|512|1024|2048|4096)\s*(?:px|pixels?)?\s*(?:textures?|maps?|max)?\b|\b([1248])k\s*textures?\b/.exec(text);
  if (!m) return null;
  if (m[2]) return Number(m[2]) * 1024;
  return /(px|pixel|texture|map|max)/.test(m[0]) ? Number(m[1]) : null;
}

/** @returns {{target:string, triangleBudget:number, maxTextureSize:number, compress:boolean, lockBorder:boolean, explanation:string[]}} */
export function compileIntent(input) {
  const text = String(input ?? '').toLowerCase().trim();
  const explanation = [];

  let target = TARGETS[text] ? text : null;
  if (target) explanation.push(`"${text}" is a built-in target.`);
  for (const [id, re] of TARGET_RULES) {
    if (target) break;
    const m = re.exec(text);
    if (m) { target = id; explanation.push(`"${m[0]}" → ${TARGETS[id].name} budget.`); }
  }
  if (!target) { target = 'prop'; explanation.push('No specific use found, so the strictest mobile budget (mobile game prop) is used.'); }

  const T = TARGETS[target];
  let triangleBudget = T.tris;
  let maxTextureSize = T.texMax;

  const low = LOW_END.exec(text);
  if (low) {
    triangleBudget = Math.round(triangleBudget * 0.6);
    maxTextureSize = Math.max(512, maxTextureSize / 2);
    explanation.push(`"${low[0]}" → low-end devices: 60% of the triangle budget, textures capped at ${maxTextureSize}px.`);
  } else {
    const high = HIGH_END.exec(text);
    if (high) {
      triangleBudget = Math.round(triangleBudget * 1.5);
      explanation.push(`"${high[0]}" → high-end devices: 150% of the triangle budget.`);
    }
  }

  const count = parseCount(text);
  if (count) { triangleBudget = count; explanation.push(`Explicit limit: ${count.toLocaleString('en-GB')} triangles.`); }
  const tex = parseTextureSize(text);
  if (tex) { maxTextureSize = tex; explanation.push(`Explicit texture cap: ${tex}px.`); }

  const compress = !/\b(no|without|skip) (compression|meshopt)\b/.test(text);
  if (!compress) explanation.push('Compression turned off on request.');
  // Locking open borders keeps UV seams and mesh edges from tearing; always on.
  const lockBorder = true;

  return { target, triangleBudget, maxTextureSize, compress, lockBorder, explanation };
}
