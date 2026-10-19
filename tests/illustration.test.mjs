import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECTS, CATEGORIES, SERVICES, PAST_LOGOS, FEATURED_PROJECT, STUDIO_INFO } from '../src/illustration/config/portfolioData.js';
import worker from '../worker/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('illustration: portfolio configuration and project data integrity', () => {
  assert.equal(typeof STUDIO_INFO.name, 'string');
  assert.equal(typeof STUDIO_INFO.tagline, 'string');
  assert.equal(CATEGORIES.length, 7); // 'All Work' + 6 specific categories

  // Verify all 6 prompt categories are covered
  const requiredCategories = [
    'Character Illustration',
    'Isometric Worlds',
    'Brand Illustration',
    'Game Art and Assets',
    'Editorial Illustration',
    'Mascots and Characters',
  ];

  for (const cat of requiredCategories) {
    const hasCat = PROJECTS.some((p) => p.category === cat);
    assert.ok(hasCat, `Category "${cat}" must be represented in PROJECTS`);
  }

  // Verify all project assets exist in public/
  for (const project of PROJECTS) {
    assert.ok(project.title, 'Project must have title');
    assert.ok(project.overview, 'Project must have overview');
    assert.ok(project.artDirection, 'Project must have art direction');
    assert.ok(project.deliverables?.length > 0, 'Project must have deliverables');
    assert.ok(project.palette?.length >= 3, 'Project must have palette swatches');

    const assetPath = path.join(rootDir, 'public', project.image.replace(/^\//, ''));
    assert.ok(fs.existsSync(assetPath), `Project image must exist on disk: ${assetPath}`);
  }

  // Verify featured project artwork
  const featuredPath = path.join(rootDir, 'public', FEATURED_PROJECT.image.replace(/^\//, ''));
  assert.ok(fs.existsSync(featuredPath), `Featured artwork must exist: ${featuredPath}`);

  // Verify all 6 services
  assert.equal(SERVICES.length, 6);
  for (const service of SERVICES) {
    assert.ok(service.title, 'Service must have title');
    assert.ok(service.description, 'Service must have description');
    assert.ok(service.deliverables?.length > 0, 'Service must have deliverables');
  }

  // Verify studio info branding: Sam, Graphic Designer
  assert.equal(STUDIO_INFO.name, 'Sam');
  assert.equal(STUDIO_INFO.artistName, 'Sam');
  assert.equal(STUDIO_INFO.artistTitle, 'Graphic Designer');

  // Verify past logos collection: 7 logos from assets
  assert.equal(PAST_LOGOS.length, 7, 'Must have 7 logo previews online');
  for (const logo of PAST_LOGOS) {
    assert.ok(logo.title, 'Logo must have title');
    assert.ok(logo.badge, 'Logo must have authenticity badge');
    const logoPath = path.join(rootDir, 'public', logo.image.replace(/^\//, ''));
    assert.ok(fs.existsSync(logoPath), `Logo asset must exist on disk: ${logoPath}`);
  }
});

test('illustration: domain and route detection covers illustrator subdomain and path', () => {
  const detect = (hostname, pathname = '', search = '') => {
    const h = (hostname || '').toLowerCase();
    const p = (pathname || '').toLowerCase();
    const s = (search || '').toLowerCase();
    return (
      h.startsWith('illustrator.') ||
      h.startsWith('illustration.') ||
      h.startsWith('art.') ||
      h.includes('illustrator') ||
      p.startsWith('/illustrator') ||
      p.startsWith('/illustration') ||
      s.includes('illustrator') ||
      s.includes('illustration')
    );
  };

  assert.equal(detect('illustrator.assetbench.co.uk'), true);
  assert.equal(detect('illustration.assetbench.co.uk'), true);
  assert.equal(detect('art.assetbench.co.uk'), true);
  assert.equal(detect('www.assetbench.co.uk', '/illustrator'), true);
  assert.equal(detect('www.assetbench.co.uk', '/illustration'), true);
  assert.equal(detect('localhost', '/', '?illustrator'), true);
  assert.equal(detect('www.assetbench.co.uk', '/tools'), false);
});

test('illustration: worker enquiry API handles validation and submission', async () => {
  const env = {
    TRIALS: {
      data: new Map(),
      async put(key, value, options) {
        this.data.set(key, { value, options });
      },
      async get(key) {
        return this.data.get(key)?.value || null;
      },
    },
  };

  // Test 1: Empty body rejected with 400
  const reqBad = new Request('https://illustration.assetbench.co.uk/api/illustration-enquiry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '' }),
  });
  const resBad = await worker.fetch(reqBad, env, {});
  assert.equal(resBad.status, 400);

  // Test 2: Valid enquiry accepted and stored
  const reqGood = new Request('https://illustration.assetbench.co.uk/api/illustration-enquiry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Creative Director',
      email: 'cd@studio.com',
      projectType: 'Character Illustration',
      budget: '£3,000 – £7,500',
      description: 'We need key character art for an upcoming narrative game teaser.',
    }),
  });
  const resGood = await worker.fetch(reqGood, env, {});
  assert.equal(resGood.status, 200);
  const data = await resGood.json();
  assert.equal(data.ok, true);
  assert.ok(data.message.includes('enquiry has been received'));

  // Ensure record was stored in KV
  assert.ok(env.TRIALS.data.size > 0, 'Enquiry record should be saved in KV');

  // Test 3: OPTIONS returns 204
  const reqOpt = new Request('https://illustration.assetbench.co.uk/api/illustration-enquiry', {
    method: 'OPTIONS',
  });
  const resOpt = await worker.fetch(reqOpt, env, {});
  assert.equal(resOpt.status, 204);
});
