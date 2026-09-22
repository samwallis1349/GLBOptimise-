import { glbCubeIcon } from './icons/glbCube.js';
import { polyMeshIcon } from './icons/polyMesh.js';
import { textureGridIcon } from './icons/textureGrid.js';
import { lodStackIcon } from './icons/lodStack.js';
import { stripClipIcon } from './icons/stripClip.js';
import { rigSkeletonIcon } from './icons/rigSkeleton.js';
import { animCurveIcon } from './icons/animCurve.js';
import { animTrimIcon } from './icons/animTrim.js';

/**
 * ToolIdentity — the standalone identity block for a tool inside AssetBench.
 *
 * Three levels of hierarchy, and nothing else: a symbol that identifies the
 * file/tool, a two-tone wordmark that names the application, and one muted
 * line explaining its purpose. No buttons, links or panels live in here —
 * it identifies the tool, it isn't part of the tool's UI.
 *
 * Reusable by design: every tool (Optimise GLB, Reduce Polys, and whatever
 * comes next) supplies its own mark and wording and gets a visually related
 * header for free. Promoted here from Optimise GLB's own ui/ folder once
 * Reduce Polys needed the same block (see src/shared/components/toolIdentity.css
 * for the accompanying styles, which each tool injects alongside its own CSS).
 */

const MARKS = {
  'glb-cube': glbCubeIcon,
  'poly-mesh': polyMeshIcon,
  'texture-grid': textureGridIcon,
  'lod-stack': lodStackIcon,
  'strip-clip': stripClipIcon,
  'rig-skeleton': rigSkeletonIcon,
  'anim-curve': animCurveIcon,
  'anim-trim': animTrimIcon,
};

/**
 * @param {HTMLElement} mount
 * @param {{mark?: string, eyebrow?: string, title: string, accentTitle?: string, description?: string}} config
 */
export function renderToolIdentity(mount, config) {
  if (!mount) return;
  const mark = MARKS[config.mark] || '';

  mount.className = 'tool-identity';
  mount.innerHTML = `
    ${mark ? `<div class="tool-identity-mark">${mark}</div>` : ''}
    <div class="tool-identity-text">
      ${config.eyebrow ? `<p class="tool-identity-eyebrow">${config.eyebrow}</p>` : ''}
      <h1 class="tool-identity-title">${config.title}${
        config.accentTitle ? ` <span class="accent">${config.accentTitle}</span>` : ''
      }</h1>
      ${config.description ? `<p class="tool-identity-description">${config.description}</p>` : ''}
    </div>
  `;
  return mount;
}
