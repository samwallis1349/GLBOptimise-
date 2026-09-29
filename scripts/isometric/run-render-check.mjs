import http from 'node:http';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
const server=http.createServer((req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');if(req.url!='/report'){res.end();return;}let body='';req.on('data',d=>body+=d);req.on('end',()=>{console.log(body);res.end('OK');finish(body.startsWith('PASS:')?0:1);});});
let browser,timer;function finish(code){clearTimeout(timer);browser?.kill();server.close();setTimeout(()=>process.exit(code),250);}
server.listen(5191,'127.0.0.1',()=>{browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless','--no-first-run','--enable-unsafe-swiftshader','--user-data-dir='+resolve('tmp-processing/iso-test-live'),'http://127.0.0.1:5173/scripts/isometric/render-check.html'],{stdio:'ignore'});timer=setTimeout(()=>{console.error('Render check timed out');finish(1);},45000);});
