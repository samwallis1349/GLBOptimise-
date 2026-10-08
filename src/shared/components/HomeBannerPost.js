import { iconSvg } from '../utils/icons.js';

const BANNER_API = '/api/banner';

const DEFAULT_BANNER = {
  name: 'default',
  badge: 'COMMUNITY & NEWS',
  title: 'Transform 3D Assets & App Graphics in Seconds',
  text: 'From AI 3D model generation to polygon reduction, texture encoding, and iOS App Store assets — AssetBench runs entirely inside your browser with zero upload waiting.',
  mediaType: 'image',
  mediaUrl: '/images/tripo-promo.webp',
  linkUrl: '/tools',
  linkText: 'Explore All Tools →',
  updatedAt: Date.now(),
};

function formatBannerDate(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function isVideoUrl(url) {
  if (!url) return false;
  const clean = url.toLowerCase().split('?')[0];
  return (
    clean.endsWith('.mp4') ||
    clean.endsWith('.webm') ||
    clean.endsWith('.mov') ||
    clean.endsWith('.m4v') ||
    url.includes('youtube.com') ||
    url.includes('youtu.be') ||
    url.includes('vimeo.com')
  );
}

function renderMediaElement(mediaUrl, mediaType, title) {
  const isVideo = mediaType === 'video' || isVideoUrl(mediaUrl);

  if (isVideo) {
    // YouTube embed
    if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) {
      const match = mediaUrl.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([^#&?]*)/);
      const videoId = match && match[1].length === 11 ? match[1] : null;
      if (videoId) {
        return `
          <div class="home-banner-post__video-wrap">
            <iframe class="home-banner-post__iframe" src="https://www.youtube.com/embed/${videoId}" title="${title || 'Video'}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
          </div>`;
      }
    }

    // Native HTML5 video
    return `
      <div class="home-banner-post__video-wrap">
        <video class="home-banner-post__video" src="${mediaUrl}" controls autoplay muted loop playsinline preload="metadata"></video>
      </div>`;
  }

  // Image fallback
  return `
    <div class="home-banner-post__img-wrap">
      <img class="home-banner-post__img" src="${mediaUrl || DEFAULT_BANNER.mediaUrl}" alt="${title || 'Featured Post'}" loading="lazy" />
    </div>`;
}

/**
 * Creates the dynamic bottom-of-homepage post banner.
 * Can be updated remotely via POST /api/banner by external programs.
 */
export function HomeBannerPost() {
  const section = document.createElement('section');
  section.className = 'home-banner-post container';
  section.setAttribute('aria-label', 'Featured Announcement');

  // Support previewing any named banner via query param: /?banner=my-name
  const params = new URLSearchParams(window.location.search);
  const requestedBanner = params.get('banner');
  const fetchUrl = requestedBanner ? `${BANNER_API}?name=${encodeURIComponent(requestedBanner)}` : BANNER_API;

  function render(banner) {
    const data = banner || DEFAULT_BANNER;
    const dateFormatted = formatBannerDate(data.updatedAt);

    section.innerHTML = `
      <div class="home-banner-post__inner">
        <div class="home-banner-post__media">
          ${renderMediaElement(data.mediaUrl, data.mediaType, data.title)}
        </div>
        <div class="home-banner-post__content">
          <div class="home-banner-post__meta">
            ${data.badge ? `<span class="home-banner-post__badge">${data.badge}</span>` : ''}
            ${dateFormatted ? `<span class="home-banner-post__date">${dateFormatted}</span>` : ''}
          </div>
          <h2 class="home-banner-post__title">${data.title}</h2>
          <p class="home-banner-post__text">${data.text || data.description || ''}</p>
          <div class="home-banner-post__actions">
            ${
              data.linkUrl
                ? `
              <a class="btn btn--primary home-banner-post__btn" href="${data.linkUrl}" ${data.linkUrl.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : ''}>
                ${data.linkText || 'Learn More →'}
              </a>`
                : ''
            }
          </div>
        </div>
      </div>
    `;
  }

  // Render fallback immediately so layout is stable
  render(DEFAULT_BANNER);

  // Fetch dynamic content from worker
  fetch(fetchUrl)
    .then((res) => (res.ok ? res.json() : null))
    .then((res) => {
      if (res?.banner && section.isConnected) {
        render(res.banner);
      }
    })
    .catch(() => {
      // Keep fallback if offline / in local dev without worker
    });

  return section;
}
