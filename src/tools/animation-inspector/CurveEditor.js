import { extractTrackCurve, PATH_META } from './AnimationAnalysis.js';

/**
 * Canvas curve view for one animated node's channels.
 *
 * Each glTF path is normalised into its own -1..1 band before drawing. That
 * is a deliberate choice: a hip translation measured in metres and a rotation
 * quaternion bounded to ±1 cannot share a linear axis without one of them
 * collapsing into a flat line. The real, un-normalised range of every channel
 * is reported back through `getSummary()` so the panel can show what the
 * band actually represents — the shape is comparable, the numbers stay honest.
 *
 * Drawn on a DPR-scaled backing store so curves stay crisp on retina displays,
 * and re-rendered from cached curve data on every playhead move, which keeps
 * scrubbing cheap (no re-decoding of accessors per frame).
 */
export class CurveEditor {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.curves = [];
    this.duration = 1;
    this.time = 0;
    this.padding = { top: 12, right: 12, bottom: 22, left: 34 };

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(canvas);
    this._resize();
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
    this.render();
  }

  /**
   * @param {object[]} tracks every track targeting the selected node
   * @param {number} duration clip duration, for the shared time axis
   */
  setTracks(tracks, duration) {
    this.duration = duration > 0 ? duration : 1;
    this.curves = [];

    // Group by path so each path normalises against its own extremes.
    const byPath = new Map();
    for (const track of tracks) {
      const curve = extractTrackCurve(track);
      if (!curve.times.length) continue;
      if (!byPath.has(track.path)) byPath.set(track.path, []);
      byPath.get(track.path).push({ track, curve });
    }

    for (const [path, entries] of byPath) {
      const meta = PATH_META[path] || PATH_META.translation;
      let min = Infinity;
      let max = -Infinity;
      for (const { curve } of entries) {
        min = Math.min(min, curve.min);
        max = Math.max(max, curve.max);
      }
      // A dead-flat channel has zero span; give it a nominal one so it draws
      // along the centre line instead of dividing by zero.
      const span = max - min;
      const half = span > 1e-9 ? span / 2 : 1;
      const mid = span > 1e-9 ? (max + min) / 2 : min;

      for (const { track, curve } of entries) {
        this.curves.push({
          path,
          colour: meta.colour,
          label: meta.label,
          nodeName: track.nodeName,
          interpolation: track.interpolation,
          times: curve.times,
          components: curve.components.map((component, i) => ({
            label: component.label,
            // Normalised for drawing; opacity separates X/Y/Z/W within a path.
            points: component.values.map((v) => (v - mid) / half),
            alpha: 1 - i * 0.18,
          })),
          realMin: min,
          realMax: max,
        });
      }
    }

    this.render();
  }

  /** One line per path currently drawn, with its true value range. */
  getSummary() {
    const seen = new Map();
    for (const curve of this.curves) {
      if (seen.has(curve.path)) continue;
      seen.set(curve.path, {
        path: curve.path,
        label: curve.label,
        colour: curve.colour,
        min: curve.realMin,
        max: curve.realMax,
        interpolation: curve.interpolation,
      });
    }
    return [...seen.values()];
  }

  setTime(seconds) {
    this.time = seconds;
    this.render();
  }

  clear() {
    this.curves = [];
    this.render();
  }

  render() {
    const { ctx, width, height } = this;
    if (!ctx || !width || !height) return;

    const style = getComputedStyle(this.canvas);
    const gridColour = style.getPropertyValue('--color-border').trim() || 'rgba(255,255,255,0.1)';
    const textColour = style.getPropertyValue('--color-text-muted').trim() || 'rgba(255,255,255,0.45)';
    const accent = style.getPropertyValue('--color-accent').trim() || '#ffb547';

    ctx.clearRect(0, 0, width, height);

    const { top, right, bottom, left } = this.padding;
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    if (plotW <= 0 || plotH <= 0) return;

    const xOf = (t) => left + (t / this.duration) * plotW;
    const yOf = (v) => top + plotH / 2 - (v * plotH) / 2;

    // --- grid + axis labels ------------------------------------------------
    ctx.save();
    ctx.strokeStyle = gridColour;
    ctx.fillStyle = textColour;
    ctx.lineWidth = 1;
    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';

    for (const value of [1, 0.5, 0, -0.5, -1]) {
      const y = Math.round(yOf(value)) + 0.5;
      ctx.globalAlpha = value === 0 ? 0.55 : 0.25;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + plotW, y);
      ctx.stroke();
      ctx.globalAlpha = 0.8;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(value.toFixed(1), left - 6, y);
    }

    const tickCount = 5;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= tickCount; i += 1) {
      const t = (this.duration * i) / tickCount;
      const x = Math.round(xOf(t)) + 0.5;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + plotH);
      ctx.stroke();
      ctx.globalAlpha = 0.8;
      ctx.fillText(`${t.toFixed(2)}s`, x, top + plotH + 6);
    }
    ctx.restore();

    // --- empty state -------------------------------------------------------
    if (!this.curves.length) {
      ctx.save();
      ctx.fillStyle = textColour;
      ctx.globalAlpha = 0.7;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No curve data for this node', left + plotW / 2, top + plotH / 2);
      ctx.restore();
      return;
    }

    // --- curves ------------------------------------------------------------
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.4;
    for (const curve of this.curves) {
      for (const component of curve.components) {
        ctx.globalAlpha = Math.max(0.28, component.alpha);
        ctx.strokeStyle = curve.colour;
        ctx.beginPath();
        for (let i = 0; i < component.points.length; i += 1) {
          const x = xOf(curve.times[i]);
          const y = yOf(component.points[i]);
          if (i === 0) ctx.moveTo(x, y);
          else if (curve.interpolation === 'STEP') {
            // STEP holds its value until the next key — drawing it as a
            // straight ramp would misrepresent what the file actually does.
            ctx.lineTo(x, yOf(component.points[i - 1]));
            ctx.lineTo(x, y);
          } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    // --- playhead ----------------------------------------------------------
    ctx.save();
    const px = Math.round(xOf(Math.min(this.time, this.duration))) + 0.5;
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.lineTo(px, top + plotH);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.lineTo(px - 4, top - 5);
    ctx.lineTo(px + 4, top - 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  dispose() {
    this._resizeObserver.disconnect();
    this.curves = [];
  }
}
