import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
if(fs.existsSync(path.join(root,'.env')))process.loadEnvFile(path.join(root,'.env'));
const port=process.env.PORT||3000;
process.env.APP_BASE_URL ||= 'http://localhost:'+port;
const routes={
 '/auth/google':'./api/oauth/start.js','/auth/google/callback':'./api/oauth/callback.js',
 '/api/google/status':'./api/google/status.js','/api/google/events':'./api/google/events/index.js',
 '/api/google/share':'./api/google/share.js','/api/household':'./api/household.js'
};
// Explicit public allowlist prevents .env, tokens, source APIs, and Git data being served.
const publicFiles=['index.html','styles.css','app.js','calendar-model.js','recipes.js'];
http.createServer(async(req,res)=>{
 res.status=code=>{res.statusCode=code;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};res.redirect=url=>{res.statusCode=302;res.setHeader('Location',url);res.end();};
 try{
  const url=new URL(req.url,'http://localhost');req.query=Object.fromEntries(url.searchParams);
  let route=routes[url.pathname];if(/^\/api\/google\/events\/[^/]+$/.test(url.pathname)){route='./api/google/events/[id].js';req.query.id=decodeURIComponent(url.pathname.split('/').pop());}
  if(route){let raw='';for await(const part of req){raw+=part;if(raw.length>100000){res.status(413).json({error:'Request too large'});return;}}req.body=raw?JSON.parse(raw):{};const {default:handler}=await import(route);await handler(req,res);return;}
  const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(!publicFiles.includes(file))return res.status(404).json({error:'Not found'});
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');
  fs.createReadStream(path.join(root,file)).pipe(res);
 }catch(e){res.status(500).json({error:e.message});}
}).listen(port,'127.0.0.1',()=>console.log('Hearth: http://localhost:'+port));
