import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./batchQueue.js',import.meta.url),'utf8');
const {validateBatch,runQueue}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const files=Array.from({length:200},(_,i)=>({name:`${i}.glb`,size:1024}));
validateBatch(files);
assert.throws(()=>validateBatch([...files,files[0]]));
assert.throws(()=>validateBatch([{name:'x.fbx',size:1}]));
assert.throws(()=>validateBatch([{name:'x.glb',size:201*1024*1024}]));
assert.throws(()=>validateBatch(files.map(f=>({...f,size:30*1024*1024}))));
const items=files.map((file,id)=>({file,id,status:'queued'}));
let concurrency=0,peak=0;
await runQueue(items,async item=>{concurrency++;peak=Math.max(peak,concurrency);await Promise.resolve();concurrency--;if(item.id===3)throw Error('broken');return 'PNG';},()=>false,()=>{});
assert.equal(peak,1);assert.equal(items.filter(i=>i.status==='done').length,199);assert.equal(items[3].status,'failed');
let calls=0;await runQueue(items,async()=>{calls++;return 'PNG';},()=>false,()=>{});assert.equal(calls,1);
let cancel=false;const rest=[{status:'queued'},{status:'queued'}];await runQueue(rest,async()=>{cancel=true;return 'PNG';},()=>cancel,()=>{});assert.deepEqual(rest.map(i=>i.status),['done','queued']);
console.log('PASS: 200-item queue, limits, sequential processing, isolated errors, retry and cancellation');

