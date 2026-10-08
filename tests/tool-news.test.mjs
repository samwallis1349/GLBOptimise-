import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../src/shared/config/tools.js';
import { getToolNews } from '../src/shared/config/toolNews.js';

test('every tool has rich news, changelog info, and pro tips', () => {
  for (const tool of TOOLS) {
    const news = getToolNews(tool);
    assert.ok(news, `Tool ${tool.id} has news`);
    assert.ok(news.version, `Tool ${tool.id} has version`);
    assert.ok(news.date, `Tool ${tool.id} has date`);
    assert.ok(news.title, `Tool ${tool.id} has news title`);
    assert.ok(news.content, `Tool ${tool.id} has news content`);
    assert.ok(news.proTipTitle, `Tool ${tool.id} has pro tip title`);
    assert.ok(news.proTip, `Tool ${tool.id} has pro tip content`);
    assert.ok(Array.isArray(news.relatedTools), `Tool ${tool.id} has related tools array`);
  }
});
