/**
 * Tool usage counts, used to rank the tool grids by popularity.
 *
 * Every tool open is reported to the Worker (/api/usage), which keeps one
 * site-wide counter per tool in KV. To keep KV writes low, a browser reports
 * each tool at most once per day. Reads come back as { [toolId]: count }.
 *
 * This browser also keeps its own counts. They stand in when the Worker
 * can't be reached (offline, or `vite dev`, which has no Worker), so the
 * ranking still works locally — it just reflects this browser only.
 */

const USAGE_API = '/api/usage';
const LOCAL_KEY = 'assetbench_usage_v1';
const SENT_KEY = 'assetbench_usage_sent_v1';
const CACHE_KEY = 'assetbench_usage_cache_v1';

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? {};
  } catch {
    return {};
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage disabled — counts just don't persist in this browser */
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Records that a tool was opened. Fire-and-forget. */
export function recordToolOpen(toolId) {
  const local = read(LOCAL_KEY);
  local[toolId] = (local[toolId] ?? 0) + 1;
  write(LOCAL_KEY, local);

  const sent = read(SENT_KEY);
  if (sent[toolId] === today()) return;
  fetch(USAGE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool: toolId }),
    keepalive: true,
  })
    .then((response) => {
      if (response.ok) write(SENT_KEY, { ...read(SENT_KEY), [toolId]: today() });
    })
    .catch(() => {});
}

/** The last counts seen, available synchronously so grids render ranked at once. */
export function cachedUsageCounts() {
  const cached = read(CACHE_KEY);
  return Object.keys(cached).length ? cached : read(LOCAL_KEY);
}

/** Fetches site-wide counts; falls back to this browser's own counts. */
export async function fetchUsageCounts() {
  try {
    const response = await fetch(USAGE_API);
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    if (!data?.counts || typeof data.counts !== 'object') throw new Error('bad payload');
    write(CACHE_KEY, data.counts);
    return data.counts;
  } catch {
    return read(LOCAL_KEY);
  }
}

/**
 * Moves one tool to the first slot of a given grid row, so it holds that
 * spot however the rest are ranked. `span` gives each tool's column width
 * (the wide featured card takes 2), and a card too wide for what's left of a
 * row wraps, just as CSS grid places it. Sized for the desktop grid's
 * `columns`; narrower grids simply show it a little further down.
 */
export function placeAtRowStart(tools, id, { row = 2, columns = 4, span = () => 1 } = {}) {
  const target = tools.find((tool) => tool.id === id);
  if (!target) return tools;
  const rest = tools.filter((tool) => tool !== target);
  let used = 0;
  for (let i = 0; i < rest.length; i++) {
    if (used >= (row - 1) * columns) return [...rest.slice(0, i), target, ...rest.slice(i)];
    const width = Math.min(span(rest[i]), columns);
    const left = columns - (used % columns);
    used += width > left ? left + width : width;
  }
  return [...rest, target];
}

/**
 * Orders tools by count, highest first. `pinned` ids lead in the order given;
 * ties keep the incoming order, so the caller's default ordering is the tiebreak.
 */
export function rankByUsage(tools, counts, pinned = []) {
  const pinRank = (tool) => {
    const i = pinned.indexOf(tool.id);
    return i === -1 ? pinned.length : i;
  };
  return tools
    .map((tool, i) => ({ tool, i }))
    .sort((a, b) =>
      pinRank(a.tool) - pinRank(b.tool) ||
      (counts[b.tool.id] ?? 0) - (counts[a.tool.id] ?? 0) ||
      a.i - b.i,
    )
    .map(({ tool }) => tool);
}
