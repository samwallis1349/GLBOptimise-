/**
 * The homepage tool grid, grouped by category (31 Oct, user: "have a title for each category of tools"): one titled
 * section per CATEGORIES entry, in that order, and a full-width advert banner after every 6 tools - always at the end
 * of a row of cards, never splitting one. Shared by pages/home/HomePage.js (which draws it) and the worker's
 * /api/banner/slots (which lists the same banners), so the Showrunner's slots always match the page. No DOM here.
 */
import { CATEGORIES } from './tools.js';

export const ADVERT_EVERY = 6;

/** Group the (already ranked) tools by category, in CATEGORIES order; empty categories are left out. */
export function groupByCategory(tools) {
  return CATEGORIES.map((category) => ({ category, tools: tools.filter((t) => t.category === category.id) })).filter((g) => g.tools.length);
}

/**
 * Card sizes in a section (12-column grid): the first section opens with the big feature card (8 wide, 2 tall) and two
 * cards beside it, then rows of 3; later sections are rows of 3. A short last row stretches to fill the width.
 */
export function sectionSpans(count, { feature = false } = {}) {
  const spans = feature ? [{ cols: 8, rows: 2 }, { cols: 4, rows: 1 }, { cols: 4, rows: 1 }].slice(0, count) : [];
  const rest = count - spans.length;
  const lastRow = rest % 3;
  for (let i = 0; i < rest; i += 1) spans.push({ cols: lastRow && i >= rest - lastRow ? 12 / lastRow : 4, rows: 1 });
  return spans;
}

/** Does card `i` of a section of `count` end a row? (Both layouts put 3 cards in each row-band.) */
const endsRow = (i, count) => i % 3 === 2 || i === count - 1;

/**
 * Where the advert banners go: [{ group, index }] = after card `index` of section `group`. One once 6 tools have
 * passed since the last, at the next row end; never after the very last tool.
 */
export function advertPlaces(groupSizes) {
  const total = groupSizes.reduce((a, b) => a + b, 0);
  const places = [];
  let seen = 0;
  let since = 0;
  groupSizes.forEach((count, group) => {
    for (let index = 0; index < count; index += 1) {
      seen += 1;
      since += 1;
      if (since >= ADVERT_EVERY && endsRow(index, count) && seen < total) {
        places.push({ group, index, afterTools: seen });
        since = 0;
      }
    }
  });
  return places;
}

/** The banner's site name: 'advert', then 'advert-2', 'advert-3'... */
export const advertName = (k) => (k ? `advert-${k + 1}` : 'advert');
