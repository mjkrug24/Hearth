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
 '/api/google/share':'./api/google/share.js','/api/household':'./api/household.js','/api/household/batch':'./api/household/batch.js'
};
// Explicit public allowlist prevents .env, tokens, source APIs, and Git data being served.
const publicFiles=['index.html','styles.css','warm.css','app.js','pocketbase.js','calendar-model.js','recipes.js','planning.js','offline.js','sw.js','household-ui.js','household-model.js','manifest.json','icon.svg','favicon.ico','icon-192.png','icon-512.png','icon-maskable.png','apple-touch-icon.png'];
const securityHeaders={"Content-Security-Policy":"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' http: https: ws: wss:; worker-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
http.createServer(async(req,res)=>{
 res.status=code=>{res.statusCode=code;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};res.redirect=url=>{res.statusCode=302;res.setHeader('Location',url);res.end();};
 for(const [name,value] of Object.entries(securityHeaders))res.setHeader(name,value);
 if((req.headers['x-forwarded-proto']||'')==='https')res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
 try{
  const url=new URL(req.url,'http://localhost');req.query=Object.fromEntries(url.searchParams);
  if(url.pathname.startsWith('/api/pb/')){
   const pbBase=(req.headers['x-pb-url']||req.query.url||'').replace(/\/+$/,'').replace(/\/_+$/,'');
   if(!pbBase)return res.status(400).json({error:'Missing x-pb-url header'});
   const target=pbBase+url.pathname.replace(/^\/api\/pb/,'/api')+(url.search||'');
   const headers={};
   for(const [k,v] of Object.entries(req.headers)){
    if(!['host','connection','x-pb-url','content-length'].includes(k.toLowerCase()))headers[k]=v;
   }
   let raw=Buffer.alloc(0);
   for await(const part of req){raw=Buffer.concat([raw,Buffer.isBuffer(part)?part:Buffer.from(part)]);}
   try{
    const upstream=await fetch(target,{
     method:req.method,
     headers,
     body:['GET','HEAD'].includes(req.method)?undefined:(raw.length?raw:undefined)
    });
    res.statusCode=upstream.status;
    for(const [k,v] of upstream.headers){
     if(!['content-encoding','transfer-encoding'].includes(k.toLowerCase()))res.setHeader(k,v);
    }
    if(upstream.body){
     const reader=upstream.body.getReader();
     while(true){
      const {done,value}=await reader.read();
      if(done)break;
      res.write(value);
     }
    }
    res.end();
   }catch(err){
    res.status(502).json({error:'PocketBase connection failed: '+err.message});
   }
   return;
  }
  let route=routes[url.pathname];if(/^\/api\/google\/events\/[^/]+$/.test(url.pathname)){route='./api/google/events/[id].js';req.query.id=decodeURIComponent(url.pathname.split('/').pop());}
  if(route){let raw='';for await(const part of req){raw+=part;if(raw.length>100000){res.status(413).json({error:'Request too large'});return;}}req.body=raw?JSON.parse(raw):{};const {default:handler}=await import(route);await handler(req,res);return;}
  const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(!publicFiles.includes(file))return res.status(404).json({error:'Not found'});
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('.ico')?'image/x-icon':file.endsWith('.json')?'application/manifest+json':'text/javascript; charset=utf-8');
  fs.createReadStream(path.join(root,file)).pipe(res);
 }catch(e){res.status(500).json({error:e.message});}
}).listen(port,process.env.HOST||'0.0.0.0',()=>console.log('Hearth: http://localhost:'+port));
