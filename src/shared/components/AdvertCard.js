/**
 * A full-width advert card in the homepage tool grid, pushed from outside by API
 * (any program, or the Game's Marketing studio "Asset Bench site card" platform).
 *
 * The advert is the `advert` banner (worker/index.js handleBanner): an image or
 * a video, plus a text description, an optional title and an optional link.
 * Upload the file to POST /api/banner/media?name=advert, then save the advert
 * with POST /api/banner { name: 'advert', active: false, ... }, so the
 * bottom-of-page banner is left alone. Nothing renders until there is one.
 *
 * The homepage has one every 3 rows of tools, each its own banner: `advert`
 * (the first), then `advert-2`, `advert-3`... (pages/home/HomePage.js).
 */

const postApi = (name) => `/api/banner?name=${encodeURIComponent(name)}`;

/**
 * Every tool page has one at its bottom too, named ad-<tool id> (ad-reduce-polys, ad-inspect-glb...). The full list
 * of names, homepage and tools, is at GET /api/banner/slots (worker/index.js).
 */
export const toolAdvertName = (toolId) => `ad-${toolId}`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Same-site paths, or http(s) addresses; anything else is dropped. */
function safeUrl(raw) {
  const s = String(raw ?? '').trim();
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? s : '';
  } catch {
    return '';
  }
}

function media(post) {
  const src = safeUrl(post.mediaUrl);
  if (!src) return '';
  const alt = esc(post.title || post.text.slice(0, 120));
  return post.mediaType === 'video'
    ? `<video class="bento-post__media" src="${esc(src)}" autoplay muted loop playsinline preload="metadata" aria-label="${alt}"></video>`
    : `<img class="bento-post__media" src="${esc(src)}" alt="${alt}" loading="lazy" decoding="async">`;
}

function render(card, post) {
  const link = safeUrl(post.linkUrl);
  const external = /^https?:/.test(link);
  card.classList.toggle('bento-post--text', !safeUrl(post.mediaUrl));
  card.innerHTML = `
    ${media(post)}
    <div class="bento-post__body">
      ${post.badge ? `<span class="bento-post__badge">${esc(post.badge)}</span>` : ''}
      ${post.title ? `<h3 class="bento-post__title">${esc(post.title)}</h3>` : ''}
      <p class="bento-post__text">${esc(post.text)}</p>
      ${link ? `<a class="btn btn--primary bento-post__link" href="${esc(link)}"${external ? ' target="_blank" rel="noopener"' : ''}>${esc(post.linkText || 'Find out more →')}</a>` : ''}
    </div>
  `;
}

/**
 * Returns the card element straight away (hidden), and fills and shows it
 * once the post arrives. The caller places it in the grid.
 * @param {string} [name] which banner it shows: 'advert', 'advert-2'...
 * @returns {HTMLElement}
 */
export function AdvertCard(name = 'advert') {
  const card = document.createElement('article');
  card.className = 'bento-post';
  card.hidden = true;
  card.dataset.advert = name; // its reference name, for whoever is looking at the page
  fetch(postApi(name))
    .then((res) => (res.ok ? res.json() : null))
    .then((res) => {
      const post = res?.banner;
      if (!post || !(post.text || post.mediaUrl)) return;
      render(card, { ...post, text: post.text || '' });
      card.hidden = false;
    })
    .catch(() => {}); // vite dev has no Worker: no card
  return card;
}
