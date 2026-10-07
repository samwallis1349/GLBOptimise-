/** Small site-wide prompt for sharing the page the visitor is viewing. */
export function ShareBanner() {
  const banner = document.createElement('aside');
  banner.className = 'share-banner';
  banner.setAttribute('aria-label', 'Share Asset Bench');
  banner.innerHTML = `
    <span class="share-banner__message">Know someone making 3D assets? Send them Asset Bench.</span>
    <button class="share-banner__button" type="button">Share this page</button>
    <span class="share-banner__status" role="status" aria-live="polite"></span>
  `;

  const button = banner.querySelector('.share-banner__button');
  const status = banner.querySelector('.share-banner__status');
  button.addEventListener('click', async () => {
    const shareData = {
      title: document.title || 'Asset Bench',
      text: 'Browser-based tools for preparing 3D assets. Your files stay on your device.',
      url: location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        status.textContent = 'Thanks for sharing.';
      } catch (error) {
        if (error?.name !== 'AbortError') status.textContent = 'Sharing was unavailable. Copy the page link from your address bar.';
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(shareData.url);
      status.textContent = 'Link copied.';
    } catch {
      status.textContent = 'Copy the page link from your address bar to share it.';
    }
  });

  return banner;
}
