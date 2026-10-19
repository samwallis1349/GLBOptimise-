/** Small DOM and formatting helpers shared by the workshop panels. */

export const $ = (id) => document.getElementById(id);

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}

export function formatBytes(n) {
  if (!(n >= 0)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(2)} MB`;
}

export function formatSeconds(s) {
  return `${(s || 0).toFixed(2)}`;
}

export function statusLabel(status) {
  return status === 'pass' ? 'PASS' : status === 'warn' ? 'WARNING' : status === 'fail' ? 'FAIL' : status.toUpperCase();
}

export function statusPill(status) {
  return el('span', { class: `pill ${status}`, text: statusLabel(status) });
}

export function statRows(container, rows) {
  container.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));
}

let toastTimer = 0;
/** Brief status message at the bottom of the viewport. kind: 'ok' | 'error' | 'info'. */
export function toast(message, kind = 'info') {
  let box = document.getElementById('toast');
  if (!box) return;
  box.textContent = message;
  box.dataset.kind = kind;
  box.hidden = false;
  box.classList.remove('is-out');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.classList.add('is-out'); toastTimer = setTimeout(() => { box.hidden = true; }, 250); }, kind === 'error' ? 5200 : 2600);
}

export const ICONS = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z"/></svg>',
  loop: '<svg viewBox="0 0 24 24"><path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"/></svg>',
};
