/**
 * Deterministic browser and hardware fingerprinting.
 *
 * Produces a stable SHA-256 hash identifying the physical machine/GPU
 * even across VPNs, IP changes, or Incognito sessions, without storing
 * tracking cookies or collecting personally identifiable information (PII).
 *
 * Vectors:
 *  - WebGL GPU renderer & unmasked graphics chip
 *  - Canvas 2D font subpixel rasterization & alpha blending
 *  - Web AudioContext frequency analysis & DSP rounding quirks
 *  - Hardware metrics (CPU cores, RAM, screen geometry, pixel ratio, platform)
 */

async function sha256(str) {
  try {
    if (!globalThis.crypto?.subtle?.digest) return null;
    const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

function getCanvasSignature() {
  try {
    if (typeof document === 'undefined') return '';
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ff6600';
    ctx.fillRect(100, 5, 80, 25);
    ctx.font = '16px "Arial", "Helvetica", sans-serif';
    ctx.fillStyle = '#006699';
    ctx.fillText('AssetBench.io ⚡ 3D & iOS', 10, 25);
    ctx.fillStyle = 'rgba(0, 204, 102, 0.6)';
    ctx.fillText('AssetBench.io ⚡ 3D & iOS', 12, 27);
    ctx.strokeStyle = '#9933cc';
    ctx.beginPath();
    ctx.arc(50, 45, 12, 0, Math.PI * 2);
    ctx.stroke();
    return canvas.toDataURL();
  } catch {
    return '';
  }
}

function getWebGLSignature() {
  try {
    if (typeof document === 'undefined') return '';
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    return `${vendor}~${renderer}~${maxTex}~${maxViewport?.[0]}x${maxViewport?.[1]}`;
  } catch {
    return '';
  }
}

async function getAudioSignature() {
  try {
    if (typeof window === 'undefined') return '';
    const AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AudioCtx) return '';
    const context = new AudioCtx(1, 44100, 44100);
    const osc = context.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(10000, context.currentTime);

    const comp = context.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-50, context.currentTime);
    comp.knee.setValueAtTime(40, context.currentTime);
    comp.ratio.setValueAtTime(12, context.currentTime);
    comp.attack.setValueAtTime(0, context.currentTime);
    comp.release.setValueAtTime(0.25, context.currentTime);

    osc.connect(comp);
    comp.connect(context.destination);
    osc.start(0);

    const rendered = await Promise.race([
      context.startRendering(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 150)),
    ]);
    const channel = rendered.getChannelData(0);
    let sum = 0;
    for (let i = 4500; i < 5000; i++) sum += Math.abs(channel[i]);
    return String(sum.toFixed(6));
  } catch {
    return '';
  }
}

function getHardwareMetrics() {
  if (typeof window === 'undefined') return '';
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const scr = typeof screen !== 'undefined' ? screen : {};
  return [
    nav.hardwareConcurrency ?? '',
    nav.deviceMemory ?? '',
    scr.width ?? '',
    scr.height ?? '',
    scr.colorDepth ?? '',
    window.devicePixelRatio ?? '',
    nav.platform ?? '',
    Intl?.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : '',
  ].join(';');
}

let cachedDeviceId = null;

/**
 * Returns a stable 64-char SHA-256 hex device ID.
 * Returns null if running outside browser or crypto is unavailable.
 */
export async function getDeviceFingerprint() {
  if (cachedDeviceId) return cachedDeviceId;

  try {
    const stored = localStorage.getItem('assetbench_dev_id');
    if (stored && /^[a-f0-9]{64}$/.test(stored)) {
      cachedDeviceId = stored;
      return stored;
    }
  } catch {}

  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  try {
    const [canvas, webgl, audio] = await Promise.all([
      Promise.resolve(getCanvasSignature()),
      Promise.resolve(getWebGLSignature()),
      getAudioSignature(),
    ]);
    const hardware = getHardwareMetrics();
    const raw = `${webgl}|${canvas}|${audio}|${hardware}`;
    const hash = await sha256(raw);
    if (hash) {
      cachedDeviceId = hash;
      try {
        localStorage.setItem('assetbench_dev_id', hash);
      } catch {}
      return hash;
    }
  } catch {}

  return null;
}
