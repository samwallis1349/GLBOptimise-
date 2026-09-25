export function validateBatch(files) {
  if (!files.length) throw new Error('Choose at least one GLB.');
  if (files.length > 200) throw new Error('Choose no more than 200 GLBs per batch.');
  if (files.some(f => !/\.glb$/i.test(f.name))) throw new Error('Batch mode supports self-contained GLB files only.');
  if (files.some(f => f.size > 200 * 1024 * 1024)) throw new Error('Each model must be 200 MB or smaller.');
  if (files.reduce((sum,f) => sum+f.size,0) > 1024 * 1024 * 1024) throw new Error('Keep each batch below 1 GB in total.');
}
export async function runQueue(items, process, cancelled, changed) {
  for (const item of items) {
    if (cancelled()) break;
    if (item.status === 'done') continue;
    item.status = 'working'; item.error = ''; changed();
    try { item.blob = await process(item); item.status = 'done'; }
    catch (error) { item.status = 'failed'; item.error = error.message || 'Unable to render'; }
    changed();
  }
}
