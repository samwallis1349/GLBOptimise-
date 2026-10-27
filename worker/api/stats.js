/**
 * Launch metrics for the Cloud API: plain daily counters, no identifiers.
 *
 *   apistat:<YYYY-MM-DD>:<metric>  -> '' with metadata { count }
 *
 * Metrics: key_issued, mcp:<metric> (an op/error that came through assetbench-mcp), op:<operation> (a successful run = a delivered
 * download or report), batch_files, error:<code>, plus page events sent by
 * the site (popup_shown, popup_click, popup_dismiss, docs_view, panel_open, vscode_copy, mcp_shown, mcp_click, mcp_dismiss, mcp_copy, tripo_tool_click, tripo_guide_click, tripo_banner_click, ext_spot_shown, ext_spot_click, tripo_blocked; tripo_go is counted by /go/tripo itself). The
 * read-modify-write can drop a count under a race; fine for trends.
 */

const PREFIX = 'apistat:';
export const PAGE_EVENTS = new Set(['popup_shown', 'popup_click', 'popup_dismiss', 'docs_view', 'panel_open', 'vscode_copy', 'mcp_shown', 'mcp_click', 'mcp_dismiss', 'mcp_copy', 'tripo_tool_click', 'tripo_guide_click', 'tripo_banner_click', 'ext_spot_shown', 'ext_spot_click', 'tripo_blocked', 'partner_join_click', 'fixplan_shown', 'fixplan_click', 'aisearch_click']);

const today = () => new Date().toISOString().slice(0, 10);

export async function bump(env, metric, by = 1) {
  if (!env.TRIALS || !by) return;
  const key = `${PREFIX}${today()}:${metric}`;
  try {
    const { metadata } = await env.TRIALS.getWithMetadata(key);
    // Counters older than 400 days are dropped automatically.
    await env.TRIALS.put(key, '', { metadata: { count: (Number(metadata?.count) || 0) + by }, expirationTtl: 400 * 86400 });
  } catch {
    // Metrics must never break a request.
  }
}

/** Last `days` days of counters, plus totals over that window. */
export async function readStats(env, days = 30) {
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const byDay = new Map();
  const totals = {};
  let cursor;
  do {
    const page = await env.TRIALS.list({ prefix: PREFIX, cursor });
    for (const { name, metadata } of page.keys) {
      const [, date, ...rest] = name.split(':');
      if (date < since) continue;
      const metric = rest.join(':');
      const count = Number(metadata?.count) || 0;
      const day = byDay.get(date) || {};
      day[metric] = count;
      byDay.set(date, day);
      totals[metric] = (totals[metric] || 0) + count;
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  const shown = totals.popup_shown || 0;
  return {
    days,
    totals,
    popupClickRate: shown ? Number(((totals.popup_click || 0) / shown).toFixed(3)) : null,
    downloads: Object.entries(totals).filter(([m]) => m.startsWith('op:') && m !== 'op:audit').reduce((t, [, c]) => t + c, 0),
    byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, metrics]) => ({ date, ...metrics })),
  };
}
