import { APP_NAME, OPERATOR_NAME, CONTACT_EMAIL } from '../../shared/config/app.js';
import { ADSENSE_ENABLED } from '../../shared/config/ads.js';
import { TRIAL_DAYS, MY_ORDERS_URL } from '../../shared/config/billing.js';
import { SESSION_EXPIRY_MS } from '../../shared/config/limits.js';
import { openPrivacyChoices } from '../../shared/components/ConsentBanner.js';

/**
 * Privacy Policy. Every statement here is tied to the code it describes, so
 * keep them in step when the code changes:
 *
 *   Free trial ........... services/TrialService.js + worker/index.js (/api/trial)
 *   Usage counter ........ services/UsageService.js + worker/index.js (/api/usage)
 *   Licence keys ......... services/LicenseService.js (Lemon Squeezy License API)
 *   Checkout / donations . shared/config/billing.js (Lemon Squeezy, PayPal links)
 *   Browser storage ...... the STORAGE table below
 *   Advertising .......... shared/config/ads.js + shared/components/AdSenseAd.js
 *   Consent .............. services/ConsentService.js + shared/components/ConsentBanner.js
 *   Analytics ............ Cloudflare Web Analytics, loaded by services/AnalyticsService.js
 *                          unless the visitor opts out (automatic setup must be off in Cloudflare)
 *   Third-party code ..... Google Fonts + jsDelivr, loaded by some tool pages
 *
 * The Advertising section switches itself to the "ads are live" wording when
 * ADSENSE_ENABLED is true. Before turning that on for UK/EEA visitors, set up
 * Google's consent message (AdSense → Privacy & messaging) — the policy then
 * describes it.
 */

const UPDATED = '4 October 2026';
const SITE = 'www.assetbench.co.uk';

const ext = (href, text) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

const sessionHours = Math.round(SESSION_EXPIRY_MS / 3_600_000);

/** Everything Asset Bench's own code keeps in your browser. [name, kind, purpose, how long] */
const STORAGE = [
  ['assetbench_trial_v2', 'Local storage', `When your ${TRIAL_DAYS}-day free trial started.`, 'Until you clear it'],
  ['assetbench_dev_id', 'Local storage', 'A one-way hardware signature hash used to prevent trial abuse.', 'Until you clear it'],
  ['assetbench_license_v1', 'Local storage', 'Your lifetime licence key, its activation ID and whether it was valid when last checked. Only set if you activate a key.', 'Until you remove the key or clear it'],
  ['assetbench_tool_licenses_v1', 'Local storage', 'Single-tool licence keys, as above. Only set if you activate one.', 'Until you remove the key or clear it'],
  ['assetbench_consent_v1', 'Local storage', 'Your privacy choices (Analytics and Advertising on or off), the version of this notice and the date you chose.', 'Until you change it or clear it'],
  ['assetbench_usage_v1', 'Local storage', 'While Analytics is on: how many times this browser has opened each tool, used to order the tool lists when our server can’t be reached.', 'Until you clear it'],
  ['assetbench_usage_sent_v1', 'Local storage', 'While Analytics is on: the date each tool was last counted, so a tool is counted at most once a day.', 'Until you clear it'],
  ['assetbench_usage_cache_v1', 'Local storage', 'The last site-wide tool popularity figures, so lists appear in order straight away.', 'Until you clear it'],
  ['assetbench.commandPalette.recents', 'Local storage', 'Tools you recently opened from the search box (Ctrl/Cmd + K).', 'Until you clear it'],
  ['assetbench.thumbnail-presets.v1', 'Local storage', 'Presets you save in Thumbnail Maker.', 'Until you delete them or clear it'],
  ['assetbench.isometric.scale', 'Local storage', 'Your scale setting in Model to Isometric.', 'Until you clear it'],
  ['assetbench:layout-editor:v1', 'Local storage', 'Layout changes made with the built-in page layout editor. Only set if you use it.', 'Until you reset it or clear it'],
  ['assetbench_trial_banner_dismissed', 'Session storage', 'That you closed the trial banner.', 'Until you close the tab'],
  ['assetbench.promoBot.nudged', 'Session storage', 'That the Bench Bot helper has already shown its prompt.', 'Until you close the tab'],
  ['asset-bench', 'IndexedDB', 'Models passed from one tool to another (for example from Optimise GLB to Compress Textures), so you don’t have to choose the file again.', `Removed the next time you open ${APP_NAME} once it is ${sessionHours} hours old`],
  ['assetbench-thumbnails-…', 'IndexedDB', 'Images made during a Thumbnail Maker batch, held while you download them.', 'Deleted when the batch is closed'],
];

function storageTable() {
  const rows = STORAGE.map(
    ([name, kind, purpose, kept]) =>
      `<tr><th scope="row"><code>${name}</code></th><td data-label="Type">${kind}</td><td data-label="What it’s for">${purpose}</td><td data-label="How long">${kept}</td></tr>`,
  ).join('');
  return `
    <div class="privacy-page__table-wrap" role="region" aria-label="Browser storage used by ${APP_NAME}" tabindex="0">
      <table class="privacy-page__table">
        <thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">What it’s for</th><th scope="col">How long</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function advertisingSection() {
  const googleLinks = `
    <p>
      You can read ${ext('https://policies.google.com/technologies/partner-sites', 'how Google uses information from sites that use its services')},
      and manage personalised advertising in ${ext('https://adssettings.google.com', 'Google’s Ad Settings')}.
      You can also opt out of some third-party vendors’ use of cookies for personalised advertising at
      ${ext('https://www.aboutads.info/choices/', 'aboutads.info')}.
    </p>`;

  if (!ADSENSE_ENABLED) {
    return `
      <h2 id="advertising">Advertising</h2>
      <p>
        <strong>${APP_NAME} does not show advertising at the moment</strong>, and no advertising code is loaded on
        this site.
      </p>
      <p>
        We plan to apply to show ads from Google AdSense. Before any ads appear we will update this policy. Once ads
        are switched on, Google and other third-party vendors may use cookies or similar technologies to serve and
        measure ads, including ads based on your previous visits to this and other websites where your consent or
        settings allow it. Ads will be labelled “Advertisement” and won’t be shown to licence holders.
      </p>
      <p>
        Visitors in the UK, the European Economic Area and Switzerland will be asked for their consent through a
        Google-certified consent message before advertising cookies or personalised ads are used.
      </p>
      ${googleLinks}`;
  }

  return `
    <h2 id="advertising">Advertising</h2>
    <p>
      ${APP_NAME} shows advertising from Google AdSense. Ads are labelled “Advertisement” and are not shown to
      licence holders.
    </p>
    <p>
      Third-party vendors, including Google, use cookies to serve ads based on your prior visits to this website or
      other websites. Google’s use of advertising cookies enables it and its partners to serve ads to you based on
      your visits to this and/or other sites on the Internet. Google and its partners may also use cookies or similar
      technologies to measure ads and to limit how often you see them.
    </p>
    <p>
      Visitors in the UK, the European Economic Area and Switzerland are asked for consent through Google’s consent
      message before advertising cookies or personalised ads are used. You can change your choice at any time.
    </p>
    <p><button type="button" class="btn btn--secondary" data-privacy-choices>Change privacy and cookie choices</button></p>
    ${googleLinks}`;
}

function contactSection() {
  const who = OPERATOR_NAME ? `${APP_NAME} is run by ${OPERATOR_NAME}, and ${OPERATOR_NAME} is responsible for the information described here.` : '';
  const how = CONTACT_EMAIL
    ? `For any privacy question or request, email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>, or see our <a href="/contact">Contact page</a>.`
    : 'We have not yet published an email address for privacy requests. It will be listed here and on our <a href="/contact">Contact page</a> as soon as it is available.';
  return `
    <h2 id="contact">Contact</h2>
    <p>${[who, how].filter(Boolean).join(' ')}</p>
    <p>
      For anything about an order or a lost licence key, you can also use
      ${ext(MY_ORDERS_URL, 'Lemon Squeezy’s order portal')}, or reply to your receipt email.
    </p>`;
}

export function render(container) {
  container.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'section container';
  section.innerHTML = `
    <div class="tool-page__header">
      <div>
        <h1 class="tool-page__title">Privacy Policy</h1>
        <p class="tool-page__description">Last updated ${UPDATED}</p>
      </div>
    </div>

    <article class="panel info-page privacy-page">
      <p class="privacy-page__lead">
        This policy explains what information the ${APP_NAME} website at ${SITE} (“${APP_NAME}”, “we”) handles,
        why, and the choices you have.
      </p>

      <section class="privacy-page__summary" aria-labelledby="privacy-summary">
        <h2 id="privacy-summary">In short</h2>
        <ul>
          <li>The files you open in our tools are processed in your browser and are not uploaded to us.</li>
          <li>To run the free trial, our server keeps a one-way hashed form of your IP address and your trial start time.</li>
          <li>While Analytics is on, we count how often each tool is opened, without storing who opened it.</li>
          <li>Payments go through Lemon Squeezy, and donations through PayPal.</li>
          <li>We use Cloudflare to host the site and provide privacy-focused visitor statistics, which you can switch off at any time.</li>
          <li>You can change your choices at any time from “Privacy choices” at the bottom of every page.</li>
          <li>We don’t show ads yet. If we add Google ads, we will ask for consent where the law requires it.</li>
        </ul>
      </section>

      <h2 id="files">Your files</h2>
      <p>
        ${APP_NAME}’s tools run inside your web browser. The models, textures and images you open are read and
        processed on your own device, and our code does not send them to us or anyone else. Some tools keep a copy
        of a model in your browser’s own storage so you can pass it to another tool (see
        <a href="#storage">Browser storage</a>).
      </p>
      <p>
        Your browser still talks to servers to load the site itself, to run the free trial and licence checks, and,
        for some tools, to download code libraries and fonts. Those are described below.
      </p>

      <h2 id="information">Information we handle</h2>

      <h3>Free trial</h3>
      <p>
        Every visitor gets a ${TRIAL_DAYS}-day free trial. When you open any page, your browser asks our server
        when your trial started, sending the start time it has saved, if any. To recognise returning visitors fairly, the
        server turns your IP address (for IPv6, its /64 network prefix) and an anonymous hardware signature into one-way cryptographic hashes.
        It stores those hashes with your trial start time. Our code does not store your raw IP address or device identity. Your browser also keeps its own copy of the start time.
      </p>
      <p>
        A hashed IP address can still count as personal information, because it relates to your connection. We use
        it solely to run the trial fairly, so that switching networks, using VPNs, or clearing browser cache cannot unfairly restart it. We also count how many
        trials start each day, without looking at any IP addresses or hashes.
      </p>

      <h3>Tool usage counts</h3>
      <p>
        While Analytics is on, when you open a tool your browser tells our server which tool it was, at
        most once a day per tool. The
        server adds one to a single site-wide counter for that tool, which we use to show the most popular tools
        first. Nothing that identifies you is stored with these counts.
      </p>

      <h3>Licence keys</h3>
      <p>
        If you buy a licence and enter your key, your browser sends the key and a short device label, such as
        “Chrome on Windows”, directly to Lemon Squeezy to activate it. Your browser then stores the key and
        activation details, and checks them with Lemon Squeezy again on later visits. Removing a key from the
        Pricing page releases that device. We don’t run our own database of licence keys.
      </p>

      <h3>Purchases</h3>
      <p>
        Purchases are made on Lemon Squeezy’s checkout, which collects the details needed to take payment and
        email you your licence key, such as your name, email address, billing address and card details. We don’t
        receive or store your card details. As the seller, we can see order information that Lemon Squeezy makes
        available to us, such as your name, email address and what you bought.
        Read ${ext('https://www.lemonsqueezy.com/privacy', 'Lemon Squeezy’s privacy policy')}.
      </p>

      <h3>Donations</h3>
      <p>
        The Donate and “Support the tools” links take you to PayPal, which processes the payment on its own
        systems. We don’t receive your card or bank details. PayPal may share with us the details it normally gives
        a payment recipient, such as your name, email address and the amount.
        Read ${ext('https://www.paypal.com/uk/legalhub/privacy-full', 'PayPal’s privacy statement')}.
      </p>

      <h3>Hosting and security</h3>
      <p>
        ${APP_NAME} is hosted on Cloudflare. Like any web host, Cloudflare processes standard connection
        information, such as your IP address, browser type and the pages requested, to deliver the site and protect
        it from abuse. Our own server code does not keep request logs.
        Read ${ext('https://www.cloudflare.com/privacypolicy/', 'Cloudflare’s privacy policy')}.
      </p>

      <h3>Visitor statistics</h3>
      <p>
        We use Cloudflare Web Analytics to see how many people visit, which pages they view and how quickly pages
        load. It collects information such as the page address, the referring site, your browser and device type,
        your approximate country and page-load timings. Cloudflare states that Web Analytics does not use cookies
        or local storage and does not fingerprint visitors. We only see totals in Cloudflare’s dashboard, not
        individual visitors or IP addresses. Statistics are on by default to help us improve the site; use
        “Privacy choices” in the footer to switch them off. Read
        ${ext('https://www.cloudflare.com/web-analytics/', 'how Cloudflare Web Analytics works')}.
      </p>

      <h3>Code libraries and fonts</h3>
      <p>
        Some tools, including Convert Files, Model Splitter, Mobile Ready Checker, KTX2 Texture Encoder and Line
        Studio, load code libraries from the jsDelivr CDN when you open them. Some of these also load fonts from
        Google Fonts. Your browser connects to those services directly, so they receive your IP address and browser
        details in order to send the files. Your own files are not sent to them. Read
        ${ext('https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net', 'jsDelivr’s privacy policy')} and
        ${ext('https://developers.google.com/fonts/faq/privacy', 'Google Fonts’ privacy information')}.
      </p>

      <h2 id="storage">Browser storage</h2>
      <p>
        ${APP_NAME}’s own code does not set cookies. It does keep some information in your browser’s local storage,
        session storage and IndexedDB, all of which stay on your device. These are not cookies, but UK privacy law
        covers any technology that stores or reads information on your device, so we list everything here.
      </p>
      ${storageTable()}
      <p>
        The trial, licence and privacy-choice entries are needed for the site to work as you’d expect. The two
        usage entries are used for aggregate tool popularity counts while Analytics is on. The others remember your settings or make
        the site faster. None of them are used for advertising or to track you on other sites.
        You can delete all of them at any time by clearing this site’s data in your browser settings. If you do,
        your trial is not reset, because our server still holds its record of when it started.
      </p>

      <h2 id="cookies">Cookies and similar technologies</h2>
      <ul>
        <li><strong>Necessary:</strong> the trial, licence and privacy-choice storage above, which the site needs to work. Cloudflare may also use strictly necessary security cookies to protect the site from abuse, as described in its ${ext('https://www.cloudflare.com/cookie-policy/', 'cookie policy')}.</li>
        <li><strong>Preferences:</strong> the other browser storage above, which remembers your settings and saved models on your device.</li>
        <li><strong>Analytics (on by default, with opt-out):</strong> Cloudflare Web Analytics, which Cloudflare says works without cookies, and aggregate tool-usage counts. Switch it off at any time using “Privacy choices” in the footer.</li>
        <li><strong>Advertising (your choice):</strong> none at the moment. If Google ads are added, Google and its partners may place or read cookies and similar technologies, as described under <a href="#advertising">Advertising</a>.</li>
        <li><strong>Third-party services:</strong> Lemon Squeezy’s checkout and PayPal set their own cookies on their own sites, under their own policies.</li>
      </ul>

      ${advertisingSection()}

      <h2 id="consent">Your choices</h2>
      <p>
        On your first visit, a small “Privacy choices” notice explains that visitor statistics are on by default
        and gives you a direct way to switch them off. You can also choose categories under Privacy settings:
      </p>
      <ul>
        <li><strong>Necessary</strong> is always active, because the site can’t work without it.</li>
        <li><strong>Analytics</strong> covers Cloudflare Web Analytics and aggregate tool-usage counts. It is on by default; switch it off from the notice, footer, or this page.</li>
        <li><strong>Advertising</strong> is off unless you allow it. ${APP_NAME} doesn’t show ads yet, so it has no effect at the moment.</li>
      </ul>
      <p>
        If you switch Analytics off, that choice is saved in this browser. You can change it at any time with
        “Privacy choices” at the bottom of every page, or here:
      </p>
      <p><button type="button" class="btn btn--secondary" data-open-choices>Change privacy choices</button></p>
      <p>
        You can also clear the site’s browser storage, or block it in your browser settings, although the free trial
        and licence won’t work without it. If advertising is switched on, visitors in the UK, the European Economic
        Area and Switzerland will also be asked through Google’s consent message.
      </p>

      <h2 id="third-parties">Who else is involved</h2>
      <ul>
        <li><strong>Cloudflare:</strong> hosts the site, runs the trial and usage-count server, stores trial records and provides visitor statistics.</li>
        <li><strong>Lemon Squeezy:</strong> sells licences, takes payment and issues, activates and checks licence keys.</li>
        <li><strong>PayPal:</strong> processes donations.</li>
        <li><strong>jsDelivr</strong> and <strong>Google Fonts</strong>: deliver code libraries and fonts used by some tools.</li>
        <li><strong>Google AdSense</strong>: only once advertising is switched on (see <a href="#advertising">Advertising</a>).</li>
      </ul>
      <p>
        These providers may process information outside the UK. Where they do, they are responsible for doing so
        under their own privacy commitments, which are linked above.
      </p>

      <h2 id="legal-bases">Why we’re allowed to use this information</h2>
      <p>
        Under UK data protection law, we rely on our <strong>legitimate interests</strong> in running the free trial
        fairly and keeping the site secure and working. For UK visitors, we use the PECR statistical-purposes
        exception for analytics to produce aggregate statistics that help us improve the site; the notice explains
        this use and provides a simple opt-out. You can switch Analytics off at any time. We rely on
        <strong>performing our contract with you</strong> to provide and check a licence you’ve bought. Where the law
        requires your <strong>consent</strong>, for example for advertising cookies, we will ask for it first, and
        you can withdraw it at any time.
      </p>

      <h2 id="retention">How long information is kept</h2>
      <ul>
        <li><strong>Trial records</strong> on our server have no expiry date, so a trial can’t be restarted. They hold only the hashed value and the start time.</li>
        <li><strong>Tool usage counts</strong> are running totals with no personal information, kept for as long as the site uses them.</li>
        <li><strong>Browser storage</strong> stays until it expires as shown in the table above, or until you clear it.</li>
        <li><strong>Order, payment and donation records</strong> are kept by Lemon Squeezy and PayPal under their own retention policies.</li>
        <li><strong>Hosting and analytics data</strong> is kept by Cloudflare under its own retention policies.</li>
      </ul>

      <h2 id="security">Security</h2>
      <p>
        The site is served over HTTPS, so information sent between your browser and the site is encrypted. We keep
        as little as we can: a one-way hash instead of your IP address, and nothing about your files. Payments are
        handled entirely by Lemon Squeezy and PayPal. No way of sending or storing information online is completely
        secure, but we work to protect the information we handle.
      </p>

      <h2 id="rights">Your rights</h2>
      <p>Depending on your circumstances and the law that applies, you can ask us to:</p>
      <ul>
        <li>give you a copy of the personal information we hold about you</li>
        <li>correct information that is wrong</li>
        <li>delete your information</li>
        <li>restrict how we use it, or object to how we use it</li>
        <li>withdraw consent, where we rely on consent</li>
      </ul>
      <p>
        Because our server only stores a hashed value, not your name, email or IP address, we may not be able to
        link a trial record to you. You can remove everything we keep in your browser yourself by clearing this
        site’s data. For order details, contact Lemon Squeezy or use its order portal.
      </p>

      ${contactSection()}

      <h2 id="complaints">Complaints</h2>
      <p>
        If you’re unhappy with how we handle your information, please contact us first so we can try to put it
        right. You also have the right to complain to the UK’s data protection regulator, the Information
        Commissioner’s Office (ICO), at ${ext('https://ico.org.uk/make-a-complaint/', 'ico.org.uk/make-a-complaint')}
        or on 0303 123 1113.
      </p>

      <h2 id="changes">Changes to this policy</h2>
      <p>
        We’ll update this page whenever ${APP_NAME} changes how it handles information, for example before any
        advertising is switched on. The date at the top shows when it last changed.
      </p>
    </article>
  `;

  section.querySelector('[data-open-choices]')?.addEventListener('click', openPrivacyChoices);

  // Reopens Google's consent message (AdSense → Privacy & messaging) so visitors
  // can change or withdraw consent. Only rendered once ADSENSE_ENABLED is true.
  section.querySelector('[data-privacy-choices]')?.addEventListener('click', () => {
    window.googlefc = window.googlefc || {};
    window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
    window.googlefc.callbackQueue.push(() => window.googlefc.showRevocationMessage?.());
  });

  container.appendChild(section);
}
