import { getToolById, TOOLS } from '../config/tools.js';
import { iconSvg } from '../utils/icons.js';
import { navigate, onRouteChange } from '../../app/router.js';

const CHANNEL_NAME = 'assetbench:widget';

export const WIDGET_SIZES = {
  s: { id: 's', label: 'S', title: 'Compact (360×520)', width: 360, height: 520 },
  m: { id: 'm', label: 'M', title: 'Standard (430×650)', width: 430, height: 650 },
  l: { id: 'l', label: 'L', title: 'Wide (620×760)', width: 620, height: 760 },
  xl: { id: 'xl', label: 'XL', title: 'Split 2-Column (880×780)', width: 880, height: 780 },
};

let activeDock = null;
let activeTool = null;
let popupWin = null;
let channel = null;
let heartbeatTimer = 0;
let lifecycleBound = false;
let openedOnPath = null;
let currentSizeKey = 'm';
let suppressNextRouteClose = false;
const statusListeners = new Set();

/**
 * Returns true when the current browser window/frame is itself a popped-out or embedded widget instance
 * for a tool route (e.g. `/optimise-glb?widget=1&popout=1`).
 */
export function isWidgetWindowMode() {
  if (typeof location === 'undefined') return false;
  const params = new URLSearchParams(location.search);
  return params.get('widget') === '1' && (params.get('popout') === '1' || params.get('embedded') === '1');
}

function getChannel() {
  if (!channel && typeof BroadcastChannel === 'function') {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener('message', (event) => {
      if (event.data?.type === 'assetbench:widget-closed') {
        popupWin = null;
        notifyStatus();
      } else if (event.data?.type === 'assetbench:widget-dock-back' && event.data.route) {
        suppressNextRouteClose = true;
        closeToolWidget();
        navigate(event.data.route);
      } else if (event.data?.type === 'assetbench:widget-resize-preset' && event.data.size) {
        resizeToolWidget(event.data.size);
      }
    });
  }
  return channel;
}

function widgetUrlForTool(tool, { popout = false, size = currentSizeKey } = {}) {
  const base =
    tool.id === 'line-studio'
      ? `/tools/line-studio/index.html?standalone=true&widget=1&wsize=${encodeURIComponent(size)}`
      : `${tool.route}?widget=1&wsize=${encodeURIComponent(size)}`;
  return popout ? `${base}&popout=1` : `${base}&embedded=1`;
}

function notifyStatus() {
  const open = isToolWidgetOpen();
  for (const fn of statusListeners) {
    try {
      fn({
        open,
        tool: activeTool,
        detached: Boolean(popupWin && !popupWin.closed),
        size: currentSizeKey,
      });
    } catch {
      /* ignore listener errors */
    }
  }
}

export function onToolWidgetChange(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export function isToolWidgetOpen(toolId) {
  const hasDock = Boolean(activeDock && activeDock.isConnected);
  const hasPopup = Boolean(popupWin && !popupWin.closed);
  if (!hasDock && !hasPopup) return false;
  return toolId ? activeTool?.id === toolId : true;
}

function bindHomepageLifecycle() {
  if (lifecycleBound || typeof window === 'undefined') return;
  lifecycleBound = true;

  const closeAllOnLeave = () => {
    try {
      getChannel()?.postMessage({ type: 'assetbench:homepage-closed', ts: Date.now() });
    } catch {
      /* ignore */
    }
    try {
      if (popupWin && !popupWin.closed) popupWin.close();
    } catch {
      /* ignore */
    }
    if (activeDock) {
      activeDock.remove();
      activeDock = null;
    }
    popupWin = null;
  };

  window.addEventListener('pagehide', closeAllOnLeave);
  window.addEventListener('beforeunload', closeAllOnLeave);
  window.addEventListener('unload', closeAllOnLeave);

  // Close widget when the webpage route is left
  onRouteChange((nextPath) => {
    if (suppressNextRouteClose) {
      suppressNextRouteClose = false;
      openedOnPath = nextPath;
      return;
    }
    if (openedOnPath && nextPath !== openedOnPath && isToolWidgetOpen()) {
      closeToolWidget();
    }
  });

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'assetbench:widget-toggle') {
      const tool = getToolById(data.toolId) || TOOLS[0];
      if (tool) {
        const detach = data.detach !== false;
        openToolWidget(tool, { detach, size: data.size || currentSizeKey });
      }
    } else if (data.type === 'assetbench:widget-resize') {
      if (data.size && WIDGET_SIZES[data.size]) {
        resizeToolWidget(data.size);
      } else if (data.width && data.height) {
        resizeToolWidgetCustom(Number(data.width), Number(data.height));
      }
    } else if (data.type === 'assetbench:widget-close') {
      closeToolWidget();
    } else if (data.type === 'assetbench:widget-expand') {
      const route = data.route || activeTool?.route || '/line-studio';
      suppressNextRouteClose = true;
      closeToolWidget();
      navigate(route);
    }
  });
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  getChannel();
  heartbeatTimer = window.setInterval(() => {
    if (popupWin && popupWin.closed) {
      popupWin = null;
      notifyStatus();
    }
    if (!isToolWidgetOpen()) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = 0;
      return;
    }
    try {
      getChannel()?.postMessage({
        type: 'assetbench:homepage-ping',
        path: location.pathname,
        ts: Date.now(),
      });
    } catch {
      /* ignore */
    }
  }, 400);
}

/**
 * Resizes the active widget (both standalone OS window outside the browser and/or docked widget)
 * to one of the preset sizes: 's' | 'm' | 'l' | 'xl'.
 */
export function resizeToolWidget(sizeKey = 'm') {
  const preset = WIDGET_SIZES[sizeKey] || WIDGET_SIZES.m;
  currentSizeKey = preset.id;
  resizeToolWidgetCustom(preset.width, preset.height, preset.id);
}

export function resizeToolWidgetCustom(width, height, presetId = null) {
  const w = Math.max(320, Math.min(1200, Math.round(width)));
  const h = Math.max(420, Math.min(1000, Math.round(height)));

  if (popupWin && !popupWin.closed) {
    try {
      popupWin.resizeTo(w, h);
      popupWin.focus();
    } catch {
      /* ignore */
    }
  }

  try {
    getChannel()?.postMessage({
      type: 'assetbench:widget-set-size',
      width: w,
      height: h,
      size: presetId,
    });
  } catch {
    /* ignore */
  }

  if (activeDock && activeDock.isConnected) {
    activeDock.classList.remove('is-minimized');
    activeDock.style.width = `min(${w}px, calc(100vw - 20px))`;
    activeDock.style.height = `min(${h}px, calc(100vh - 24px))`;
    if (presetId) activeDock.dataset.wsize = presetId;
    const dimLabel = activeDock.querySelector('.tool-widget-dock__dims');
    if (dimLabel) dimLabel.textContent = `${w}×${h}`;
    activeDock.querySelectorAll('[data-wsize-btn]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.wsizeBtn === presetId));
    });
    const frame = activeDock.querySelector('.tool-widget-dock__frame');
    frame?.contentWindow?.postMessage(
      { type: 'assetbench:widget-set-size', width: w, height: h, size: presetId },
      '*',
    );
  }
  notifyStatus();
}

/**
 * Opens a standalone OS-level desktop widget window outside the browser,
 * using the frameless Document Picture-in-Picture API (`documentPictureInPicture.requestWindow`)
 * when available (no URL bar, always-on-top, auto-closes when webpage is left),
 * with automatic fallback to `window.open(..., 'popup=yes')`.
 */
export function popoutNativeWindow(tool = activeTool || getToolById('line-studio'), { size = currentSizeKey } = {}) {
  if (!tool) return null;
  bindHomepageLifecycle();
  activeTool = tool;
  openedOnPath = location.pathname;
  const preset = WIDGET_SIZES[size] || WIDGET_SIZES.m;
  currentSizeKey = preset.id;

  const url = widgetUrlForTool(tool, { popout: true, size: preset.id });
  const width = preset.width;
  const height = preset.height;
  const left = Math.max(20, (window.screen?.availWidth || 1280) - width - 36);
  const top = Math.max(40, ((window.screen?.availHeight || 800) - height) / 2);

  // 1. Frameless Always-On-Top Document Picture-in-Picture API (Chrome / Edge 116+)
  if (
    typeof window !== 'undefined' &&
    'documentPictureInPicture' in window &&
    typeof window.documentPictureInPicture?.requestWindow === 'function'
  ) {
    window.documentPictureInPicture
      .requestWindow({ width, height })
      .then((pipWin) => {
        popupWin = pipWin;
        pipWin.document.title = `${tool.name} — Asset Bench`;
        pipWin.document.documentElement.style.cssText = 'height:100%;margin:0;background:#08090c;color-scheme:dark;';
        pipWin.document.body.style.cssText = 'height:100%;margin:0;overflow:hidden;background:#08090c;display:flex;flex-direction:column;';
        const frame = pipWin.document.createElement('iframe');
        frame.src = url;
        frame.title = `${tool.name} — Asset Bench Widget`;
        frame.style.cssText = 'width:100%;height:100%;border:0;flex:1;display:block;background:#08090c;';
        frame.setAttribute('allow', 'clipboard-write; clipboard-read');
        pipWin.document.body.appendChild(frame);
        pipWin.addEventListener('pagehide', () => {
          if (popupWin === pipWin) {
            popupWin = null;
            notifyStatus();
          }
        });
        startHeartbeat();
        notifyStatus();
      })
      .catch(() => {
        openFallbackPopupWindow(tool, url, width, height, left, top);
      });
    return popupWin || { closed: false };
  }

  return openFallbackPopupWindow(tool, url, width, height, left, top);
}

function openFallbackPopupWindow(tool, url, width, height, left, top) {
  try {
    if (popupWin && !popupWin.closed) {
      if (popupWin.name === `assetbench_widget_${tool.id}`) {
        try {
          popupWin.resizeTo(width, height);
          popupWin.focus();
        } catch {
          /* ignore */
        }
        startHeartbeat();
        notifyStatus();
        return popupWin;
      }
      try {
        popupWin.close();
      } catch {
        /* ignore */
      }
    }
    const features = `popup=yes,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`;
    const win = window.open(url, `assetbench_widget_${tool.id}`, features);
    if (win) {
      popupWin = win;
      startHeartbeat();
      notifyStatus();
      return win;
    }
  } catch {
    /* fallback to in-browser dock if popup blocked */
  }
  return null;
}

/**
 * Pops out the tool into a resizable compact desktop widget.
 * By default (`detach = true`), attempts to launch as an OS-level desktop window outside the browser
 * (which closes automatically when the webpage is left), and also supports a resizable floating widget dock.
 */
export function openToolWidget(toolOrId = 'line-studio', { detach = true, size = currentSizeKey, forceDock = false } = {}) {
  bindHomepageLifecycle();
  const tool = typeof toolOrId === 'string' ? getToolById(toolOrId) : toolOrId;
  if (!tool) return null;
  activeTool = tool;
  openedOnPath = location.pathname;
  const preset = WIDGET_SIZES[size] || WIDGET_SIZES.m;
  currentSizeKey = preset.id;

  if (detach && !forceDock) {
    const win = popoutNativeWindow(tool, { size: preset.id });
    if (win) {
      if (activeDock) {
        activeDock.remove();
        activeDock = null;
      }
      return win;
    }
  }

  if (activeDock && activeDock.isConnected) {
    const frame = activeDock.querySelector('.tool-widget-dock__frame');
    const targetUrl = widgetUrlForTool(tool, { popout: false, size: preset.id });
    if (frame && frame.dataset.toolId !== tool.id) {
      frame.src = targetUrl;
      frame.dataset.toolId = tool.id;
    }
    activeDock.dataset.toolId = tool.id;
    const titleEl = activeDock.querySelector('.tool-widget-dock__name');
    if (titleEl) titleEl.textContent = tool.name;
    resizeToolWidget(preset.id);
    startHeartbeat();
    notifyStatus();
    return activeDock;
  }

  const dock = document.createElement('aside');
  dock.className = 'tool-widget-dock';
  dock.dataset.toolId = tool.id;
  dock.dataset.wsize = preset.id;
  dock.style.width = `min(${preset.width}px, calc(100vw - 20px))`;
  dock.style.height = `min(${preset.height}px, calc(100vh - 24px))`;
  dock.setAttribute('role', 'dialog');
  dock.setAttribute('aria-label', `${tool.name} compact desktop widget`);

  dock.innerHTML = `
    <header class="tool-widget-dock__bar" title="Drag to move widget">
      <div class="tool-widget-dock__identity">
        <img class="tool-widget-dock__logo" src="/branding/asset-bench-logo.png" width="18" height="18" alt="Asset Bench">
        <span class="tool-widget-dock__brand">Asset Bench</span>
        <span class="tool-widget-dock__sep" aria-hidden="true">·</span>
        <strong class="tool-widget-dock__name">${tool.name}</strong>
        <span class="tool-widget-dock__dims">${preset.width}×${preset.height}</span>
      </div>
      <div class="tool-widget-dock__controls">
        <div class="tool-widget-dock__sizes" role="group" aria-label="Resize widget window">
          ${Object.values(WIDGET_SIZES)
            .map(
              (s) =>
                `<button type="button" class="tool-widget-dock__size-btn" data-wsize-btn="${s.id}" title="${s.title}" aria-pressed="${s.id === preset.id}">${s.label}</button>`,
            )
            .join('')}
        </div>
        <button type="button" class="tool-widget-dock__btn tool-widget-dock__detach" title="Pop out outside browser as standalone OS desktop window (closes when webpage is left)" aria-label="Pop out outside browser">
          ${iconSvg('popout')}
        </button>
        <button type="button" class="tool-widget-dock__btn tool-widget-dock__min" title="Minimize widget" aria-label="Minimize widget">—</button>
        <button type="button" class="tool-widget-dock__btn tool-widget-dock__full" title="Expand to full page" aria-label="Expand to full page">⤢</button>
        <button type="button" class="tool-widget-dock__btn tool-widget-dock__close" title="Close widget" aria-label="Close widget">✕</button>
      </div>
    </header>
    <div class="tool-widget-dock__body">
      <iframe
        class="tool-widget-dock__frame"
        data-tool-id="${tool.id}"
        src="${widgetUrlForTool(tool, { popout: false, size: preset.id })}"
        title="${tool.name} Compact Desktop Widget"
        sandbox="allow-scripts allow-same-origin allow-downloads allow-forms allow-popups"
        loading="eager"
      ></iframe>
      <div class="tool-widget-dock__resize" title="Drag to resize widget window" aria-label="Resize widget"></div>
    </div>
  `;

  // Dragging support on the widget header bar
  const bar = dock.querySelector('.tool-widget-dock__bar');
  let dragState = null;
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const rect = dock.getBoundingClientRect();
    bar.setPointerCapture(e.pointerId);
    dragState = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top,
      width: rect.width,
      height: rect.height,
    };
    dock.classList.add('is-dragging');
  });

  bar.addEventListener('pointermove', (e) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const maxLeft = Math.max(8, window.innerWidth - dragState.width - 8);
    const maxTop = Math.max(8, window.innerHeight - 56);
    const nextLeft = Math.min(maxLeft, Math.max(8, dragState.origLeft + dx));
    const nextTop = Math.min(maxTop, Math.max(8, dragState.origTop + dy));
    dock.style.left = `${Math.round(nextLeft)}px`;
    dock.style.top = `${Math.round(nextTop)}px`;
    dock.style.right = 'auto';
    dock.style.bottom = 'auto';
  });

  const endDrag = () => {
    if (!dragState) return;
    dragState = null;
    dock.classList.remove('is-dragging');
  };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  // Corner drag-to-resize support
  const resizeGrip = dock.querySelector('.tool-widget-dock__resize');
  let resizeState = null;
  resizeGrip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const rect = dock.getBoundingClientRect();
    resizeGrip.setPointerCapture(e.pointerId);
    resizeState = {
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.width,
      startH: rect.height,
    };
    dock.classList.add('is-dragging');
  });

  resizeGrip.addEventListener('pointermove', (e) => {
    if (!resizeState) return;
    const nextW = resizeState.startW + (e.clientX - resizeState.startX);
    const nextH = resizeState.startH + (e.clientY - resizeState.startY);
    resizeToolWidgetCustom(nextW, nextH, null);
  });

  const endResize = () => {
    if (!resizeState) return;
    resizeState = null;
    dock.classList.remove('is-dragging');
  };
  resizeGrip.addEventListener('pointerup', endResize);
  resizeGrip.addEventListener('pointercancel', endResize);

  // Preset size buttons (S / M / L / XL)
  dock.querySelectorAll('[data-wsize-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      resizeToolWidget(btn.dataset.wsizeBtn);
    });
  });

  dock.querySelector('.tool-widget-dock__detach').addEventListener('click', () => {
    const win = popoutNativeWindow(tool, { size: currentSizeKey });
    if (win) {
      dock.remove();
      activeDock = null;
      notifyStatus();
    }
  });

  dock.querySelector('.tool-widget-dock__min').addEventListener('click', () => {
    dock.classList.toggle('is-minimized');
  });

  dock.querySelector('.tool-widget-dock__full').addEventListener('click', () => {
    const route = tool.route;
    suppressNextRouteClose = true;
    closeToolWidget();
    navigate(route);
  });

  dock.querySelector('.tool-widget-dock__close').addEventListener('click', () => {
    closeToolWidget();
  });

  document.body.appendChild(dock);
  activeDock = dock;
  startHeartbeat();
  notifyStatus();
  return dock;
}

export function closeToolWidget() {
  try {
    getChannel()?.postMessage({ type: 'assetbench:homepage-closed', ts: Date.now() });
  } catch {
    /* ignore */
  }
  if (activeDock) {
    activeDock.remove();
    activeDock = null;
  }
  if (popupWin && !popupWin.closed) {
    try {
      popupWin.close();
    } catch {
      /* ignore */
    }
  }
  popupWin = null;
  notifyStatus();
}

/**
 * In-page popout & window-size bar shown at the top of every tool page (routes.js mountTool).
 */
export function ToolWidgetBar(tool) {
  if (!tool || isWidgetWindowMode()) return null;
  const bar = document.createElement('div');
  bar.className = 'tool-widget-bar container';
  bar.innerHTML = `
    <div class="tool-widget-bar__info">
      <span class="tool-widget-bar__dot" aria-hidden="true"></span>
      <span class="tool-widget-bar__text">Need <strong>${tool.name}</strong> beside your editor or browser? Pop it out as a resizable desktop widget (closes when you leave this page).</span>
    </div>
    <div class="tool-widget-bar__actions">
      <div class="winner-card__sizes" role="group" aria-label="Widget window size">
        ${Object.values(WIDGET_SIZES)
          .map(
            (s) =>
              `<button type="button" class="winner-card__size-btn" data-wsize="${s.id}" title="Resize widget window: ${s.title}" aria-pressed="${s.id === currentSizeKey}">${s.label}</button>`,
          )
          .join('')}
      </div>
      <button type="button" class="btn btn--secondary winner-card__popout tool-widget-bar__btn" aria-pressed="${isToolWidgetOpen(tool.id)}">
        ${iconSvg('popout', { class: 'winner-card__popout-icon' })}
        <span class="tool-widget-bar__label">${isToolWidgetOpen(tool.id) ? 'Widget active' : 'Pop out widget'}</span>
      </button>
    </div>
  `;

  let selectedSize = currentSizeKey;
  const popBtn = bar.querySelector('.tool-widget-bar__btn');
  const popLabel = bar.querySelector('.tool-widget-bar__label');

  popBtn.addEventListener('click', () => {
    openToolWidget(tool, { detach: true, size: selectedSize });
  });

  bar.querySelectorAll('.winner-card__size-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedSize = btn.dataset.wsize || 'm';
      bar.querySelectorAll('.winner-card__size-btn').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.wsize === selectedSize));
      });
      if (isToolWidgetOpen(tool.id)) {
        resizeToolWidget(selectedSize);
      } else {
        openToolWidget(tool, { detach: true, size: selectedSize });
      }
    });
  });

  onToolWidgetChange(({ open, tool: active, detached, size }) => {
    if (!bar.isConnected) return;
    const isThisOpen = open && active?.id === tool.id;
    popBtn.setAttribute('aria-pressed', String(isThisOpen));
    popLabel.textContent = isThisOpen ? (detached ? 'External widget active' : 'Widget active') : 'Pop out widget';
    if (size) {
      selectedSize = size;
      bar.querySelectorAll('.winner-card__size-btn').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.wsize === size));
      });
    }
  });

  return bar;
}

/**
 * Header chrome + resize controls + leave-page auto-close watchdog rendered inside
 * any tool window when running in standalone/embedded widget mode (`?widget=1&popout=1`).
 */
export function WidgetWindowChrome(tool) {
  const params = new URLSearchParams(location.search);
  const isPopoutWin = params.get('popout') === '1';
  const isEmbedded = params.get('embedded') === '1';
  const initialSize = params.get('wsize') || 'm';
  const preset = WIDGET_SIZES[initialSize] || WIDGET_SIZES.m;

  document.body.classList.add('is-tool-widget');
  if (isEmbedded) document.body.classList.add('is-embedded-tool-widget');
  document.body.dataset.wsize = preset.id;

  const chrome = document.createElement('header');
  chrome.className = 'tool-widget-window-chrome';
  chrome.innerHTML = `
    <div class="tool-widget-window-chrome__id">
      <img class="tool-widget-dock__logo" src="/branding/asset-bench-logo.png" width="18" height="18" alt="Asset Bench">
      <span class="tool-widget-dock__brand">Asset Bench</span>
      <span class="tool-widget-dock__sep" aria-hidden="true">·</span>
      <strong class="tool-widget-dock__name">${tool.name}</strong>
      <span class="tool-widget-dock__dims" id="twWindowDims">${preset.width}×${preset.height}</span>
    </div>
    <div class="tool-widget-window-chrome__actions">
      <div class="tool-widget-dock__sizes" role="group" aria-label="Resize widget window">
        ${Object.values(WIDGET_SIZES)
          .map(
            (s) =>
              `<button type="button" class="tool-widget-dock__size-btn" data-wsize-win="${s.id}" title="${s.title}" aria-pressed="${s.id === preset.id}">${s.label}</button>`,
          )
          .join('')}
      </div>
      <button type="button" class="tool-widget-dock__btn" id="twWindowFull" title="Return to full tool view">⤢</button>
    </div>
    <div class="tool-widget-window-grip" id="twWindowGrip" title="Drag to resize window"></div>
  `;

  const dimsEl = chrome.querySelector('#twWindowDims');
  const applySize = (sizeKey, resizeOS = true) => {
    const p = WIDGET_SIZES[sizeKey] || WIDGET_SIZES.m;
    document.body.dataset.wsize = p.id;
    chrome.querySelectorAll('[data-wsize-win]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.wsizeWin === p.id));
    });
    if (dimsEl) dimsEl.textContent = `${p.width}×${p.height}`;
    if (resizeOS) {
      try {
        window.resizeTo(p.width, p.height);
      } catch {
        /* ignore */
      }
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'assetbench:widget-resize', size: p.id, width: p.width, height: p.height }, '*');
      }
    }
  };

  chrome.querySelectorAll('[data-wsize-win]').forEach((btn) => {
    btn.addEventListener('click', () => applySize(btn.dataset.wsizeWin, true));
  });

  window.addEventListener('resize', () => {
    const w = window.outerWidth || window.innerWidth;
    const h = window.outerHeight || window.innerHeight;
    if (dimsEl) dimsEl.textContent = `${Math.round(w)}×${Math.round(h)}`;
  });

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'assetbench:widget-set-size') {
      if (e.data.size) applySize(e.data.size, false);
      else if (e.data.width && e.data.height && dimsEl) {
        dimsEl.textContent = `${Math.round(e.data.width)}×${Math.round(e.data.height)}`;
      }
    }
  });

  // Drag-to-resize corner grip
  const grip = chrome.querySelector('#twWindowGrip');
  let gripDrag = null;
  grip?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    gripDrag = {
      sx: e.screenX,
      sy: e.screenY,
      sw: window.outerWidth || window.innerWidth,
      sh: window.outerHeight || window.innerHeight,
    };
  });
  grip?.addEventListener('pointermove', (e) => {
    if (!gripDrag) return;
    const nw = Math.max(330, Math.min(1200, gripDrag.sw + (e.screenX - gripDrag.sx)));
    const nh = Math.max(440, Math.min(1000, gripDrag.sh + (e.screenY - gripDrag.sy)));
    if (dimsEl) dimsEl.textContent = `${Math.round(nw)}×${Math.round(nh)}`;
    try {
      window.resizeTo(nw, nh);
    } catch {
      /* ignore */
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'assetbench:widget-resize', width: nw, height: nh }, '*');
    }
  });
  grip?.addEventListener('pointerup', () => {
    gripDrag = null;
  });

  chrome.querySelector('#twWindowFull')?.addEventListener('click', () => {
    if (isPopoutWin && typeof BroadcastChannel === 'function') {
      const bc = new BroadcastChannel(CHANNEL_NAME);
      bc.postMessage({ type: 'assetbench:widget-dock-back', route: tool.route });
      window.close();
      return;
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'assetbench:widget-expand', route: tool.route }, '*');
    } else {
      location.href = tool.route;
    }
  });

  // Auto-close when the opener webpage is left or closed
  let lastPing = Date.now();
  let hadPing = false;
  let openerStartPath = null;
  try {
    if (window.opener && !window.opener.closed) {
      openerStartPath = window.opener.location.pathname;
    }
  } catch {
    /* ignore */
  }
  const closeNow = () => {
    try {
      window.close();
    } catch {
      /* ignore */
    }
    if (!window.closed && isPopoutWin) {
      document.body.innerHTML =
        '<div style="display:grid;place-items:center;height:100vh;text-align:center;padding:24px;color:#8c8a86;font:600 13px Inter,sans-serif"><div><strong style="color:#f3efe6;display:block;font-size:15px;margin-bottom:6px">Webpage left — Widget closed</strong>This external desktop widget automatically closes when the Asset Bench webpage is left.</div></div>';
    }
  };

  if (typeof BroadcastChannel === 'function') {
    const bc = new BroadcastChannel(CHANNEL_NAME);
    bc.addEventListener('message', (ev) => {
      if (ev.data?.type === 'assetbench:homepage-closed') closeNow();
      else if (ev.data?.type === 'assetbench:homepage-ping') {
        lastPing = Date.now();
        hadPing = true;
      } else if (ev.data?.type === 'assetbench:widget-set-size' && ev.data.size) {
        applySize(ev.data.size, false);
      }
    });
    window.addEventListener('pagehide', () => {
      try {
        bc.postMessage({ type: 'assetbench:widget-closed', toolId: tool.id });
      } catch {
        /* ignore */
      }
    });
  }

  if (isPopoutWin) {
    const inPiPFrame = window.parent && window.parent !== window;
    setInterval(() => {
      if (window.opener && window.opener.closed) {
        closeNow();
        return;
      }
      if (!inPiPFrame && window.opener) {
        try {
          if (openerStartPath && window.opener.location.pathname !== openerStartPath) {
            closeNow();
            return;
          }
        } catch {
          closeNow();
          return;
        }
      }
      if (hadPing && Date.now() - lastPing > 1200) {
        closeNow();
      }
    }, 300);
  }

  return chrome;
}

const POPOUT_LAUNCH_STORAGE_KEY = 'assetbench_popout_launch_v1';

export function initToolWidgetListener() {
  bindHomepageLifecycle();
  if (typeof location !== 'undefined' && !isWidgetWindowMode()) {
    const params = new URLSearchParams(location.search);
    const widgetParam = params.get('widget');
    const sizeParam = params.get('wsize') || 'm';
    if (widgetParam) {
      const toolId = widgetParam === '1' || widgetParam === 'true' ? 'line-studio' : widgetParam;
      const tool = getToolById(toolId) || getToolById('line-studio');
      if (tool) setTimeout(() => openToolWidget(tool, { detach: false, forceDock: true, size: sizeParam }), 80);
    }
    if (params.get('preview-popout') === '1') {
      setTimeout(() => openPopoutPreviewModal(), 120);
      return;
    }
    // Automatically show the new Popout Feature launch popup once per session on desktop
    if (!widgetParam && window.innerWidth >= 700 && !location.pathname.startsWith('/docs')) {
      let alreadySeen = false;
      try {
        alreadySeen = Boolean(sessionStorage.getItem(POPOUT_LAUNCH_STORAGE_KEY));
      } catch {
        /* ignore */
      }
      if (!alreadySeen) {
        setTimeout(() => {
          if (document.querySelector('.welcome-modal-overlay, .modal-overlay')) return;
          openPopoutPreviewModal();
        }, 1400);
      }
    }
  }
}

/**
 * Interactive preview popup modal for the Popout Desktop Widget feature.
 * Lets the user choose any of the 22 tools, preview S / M / L / XL window sizes live,
 * and launch it as a standalone OS desktop widget or docked floating widget.
 */
export function openPopoutPreviewModal(initialToolId = 'line-studio') {
  document.querySelector('.popout-preview-overlay')?.remove();

  const availableTools = TOOLS.filter((t) => t.status === 'available' || t.status === 'beta');
  let selectedTool = getToolById(initialToolId) || availableTools[0];
  let selectedSize = currentSizeKey || 'm';
  const preset = WIDGET_SIZES[selectedSize] || WIDGET_SIZES.m;
  const returnTo = document.activeElement;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay popout-preview-overlay';
  overlay.innerHTML = `
    <div class="popout-preview-modal" role="dialog" aria-modal="true" aria-labelledby="popout-preview-title">
      <header class="popout-preview-modal__head">
        <div class="popout-preview-modal__identity">
          <span class="popout-preview-modal__badge">${iconSvg('popout')} NEW · DESKTOP WIDGET</span>
          <h2 class="popout-preview-modal__title" id="popout-preview-title">Pop Out Any Tool Into a Resizable Desktop Widget</h2>
          <p class="popout-preview-modal__sub">Operates outside your browser as a compact floating OS window, resizes to <b>S · M · L · XL</b> or custom drag dimensions, and closes automatically when you leave the webpage.</p>
        </div>
        <button type="button" class="popout-preview-modal__close" aria-label="Close preview">✕</button>
      </header>

      <div class="popout-preview-modal__toolbar">
        <label class="popout-preview-modal__field">
          <span>Tool (${availableTools.length} available)</span>
          <select class="popout-preview-modal__select" id="ppmToolSelect">
            ${availableTools
              .map(
                (t) =>
                  `<option value="${t.id}" ${t.id === selectedTool.id ? 'selected' : ''}>${t.name} (${t.dimension || 'Tool'})</option>`,
              )
              .join('')}
          </select>
        </label>

        <div class="popout-preview-modal__field">
          <span>Window Size Preset</span>
          <div class="winner-card__sizes" role="group" aria-label="Select widget window size">
            ${Object.values(WIDGET_SIZES)
              .map(
                (s) =>
                  `<button type="button" class="winner-card__size-btn" data-ppm-size="${s.id}" title="${s.title}" aria-pressed="${s.id === selectedSize}">${s.label} <small style="opacity:.7;font-weight:600">${s.width}×${s.height}</small></button>`,
              )
              .join('')}
          </div>
        </div>

        <div class="popout-preview-modal__actions">
          <button type="button" class="btn btn--primary popout-preview-modal__launch" id="ppmLaunchExternal">
            ${iconSvg('popout')} Pop Out External Window
          </button>
          <button type="button" class="btn btn--secondary" id="ppmLaunchDock">
            Dock in Corner
          </button>
        </div>
      </div>

      <div class="popout-preview-modal__stage">
        <div class="popout-preview-modal__sim" id="ppmSimWindow" style="width:${preset.width}px;height:${Math.min(preset.height, 480)}px">
          <div class="tool-widget-dock__bar" style="cursor:default">
            <div class="tool-widget-dock__identity">
              <img class="tool-widget-dock__logo" src="/branding/asset-bench-logo.png" width="18" height="18" alt="Asset Bench">
              <span class="tool-widget-dock__brand">Asset Bench</span>
              <span class="tool-widget-dock__sep" aria-hidden="true">·</span>
              <strong class="tool-widget-dock__name" id="ppmSimName">${selectedTool.name}</strong>
              <span class="tool-widget-dock__dims" id="ppmSimDims">${preset.width}×${preset.height}</span>
            </div>
            <div class="tool-widget-dock__controls">
              <span class="popout-preview-modal__auto-pill">Frameless PiP · Auto-close</span>
            </div>
          </div>
          <div class="popout-preview-modal__frame-wrap">
            <iframe class="popout-preview-modal__iframe" id="ppmIframe" src="${widgetUrlForTool(selectedTool, { popout: false, size: selectedSize })}" title="${selectedTool.name} widget preview" sandbox="allow-scripts allow-same-origin allow-downloads allow-forms allow-modals"></iframe>
          </div>
          <div class="tool-widget-dock__resize" id="ppmSimResize" title="Drag to resize widget preview"></div>
        </div>
      </div>
    </div>
  `;

  const simWin = overlay.querySelector('#ppmSimWindow');
  const simIcon = overlay.querySelector('#ppmSimIcon');
  const simName = overlay.querySelector('#ppmSimName');
  const simDims = overlay.querySelector('#ppmSimDims');
  const iframe = overlay.querySelector('#ppmIframe');
  const select = overlay.querySelector('#ppmToolSelect');

  const updatePreview = (reloadFrame = false) => {
    const p = WIDGET_SIZES[selectedSize] || WIDGET_SIZES.m;
    if (simWin) {
      simWin.style.width = `${p.width}px`;
      simWin.style.height = `${Math.min(p.height, 480)}px`;
    }
    if (simIcon) simIcon.innerHTML = iconSvg(selectedTool.icon || 'wand-2');
    if (simName) simName.textContent = selectedTool.name;
    if (simDims) simDims.textContent = `${p.width}×${p.height}`;
    overlay.querySelectorAll('[data-ppm-size]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.ppmSize === selectedSize));
    });
    if (reloadFrame && iframe) {
      iframe.src = widgetUrlForTool(selectedTool, { popout: false, size: selectedSize });
    } else if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'assetbench:widget-set-size', size: selectedSize }, '*');
    }
  };

  select?.addEventListener('change', () => {
    selectedTool = getToolById(select.value) || availableTools[0];
    updatePreview(true);
  });

  // Corner drag-to-resize inside the preview simulator
  const simResize = overlay.querySelector('#ppmSimResize');
  let simDrag = null;
  simResize?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = simWin.getBoundingClientRect();
    simDrag = { startX: e.clientX, startY: e.clientY, startW: rect.width, startH: rect.height };
    simResize.setPointerCapture(e.pointerId);
  });
  simResize?.addEventListener('pointermove', (e) => {
    if (!simDrag) return;
    const nw = Math.round(Math.max(320, Math.min(920, simDrag.startW + (e.clientX - simDrag.startX) * 2)));
    const nh = Math.round(Math.max(360, Math.min(680, simDrag.startH + (e.clientY - simDrag.startY))));
    simWin.style.width = `${nw}px`;
    simWin.style.height = `${nh}px`;
    if (simDims) simDims.textContent = `${nw}×${nh}`;
  });
  simResize?.addEventListener('pointerup', () => {
    simDrag = null;
  });

  overlay.querySelectorAll('[data-ppm-size]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedSize = btn.dataset.ppmSize || 'm';
      currentSizeKey = selectedSize;
      updatePreview(false);
    });
  });

  const close = () => {
    try {
      sessionStorage.setItem(POPOUT_LAUNCH_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
  };

  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);

  overlay.querySelector('.popout-preview-modal__close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector('#ppmLaunchExternal')?.addEventListener('click', () => {
    close();
    openToolWidget(selectedTool, { detach: true, size: selectedSize });
  });

  overlay.querySelector('#ppmLaunchDock')?.addEventListener('click', () => {
    close();
    openToolWidget(selectedTool, { detach: false, forceDock: true, size: selectedSize });
  });

  document.body.appendChild(overlay);
  return close;
}
