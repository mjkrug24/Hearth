import crypto from 'node:crypto';

const cookieName='hearth_google_token';
const base=()=>process.env.APP_BASE_URL;
const key=()=>crypto.createHash('sha256').update(process.env.TOKEN_ENCRYPTION_KEY||process.env.GOOGLE_CLIENT_SECRET||'').digest();
const parseCookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(x=>x.trim().split('=')));
const seal=value=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv),body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]),tag=cipher.getAuthTag();return Buffer.concat([iv,tag,body]).toString('base64url')};
const open=value=>{try{let b=Buffer.from(value,'base64url'),iv=b.subarray(0,12),tag=b.subarray(12,28),cipher=crypto.createDecipheriv('aes-256-gcm',key(),iv);cipher.setAuthTag(tag);return JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString())}catch{return null}};
export const tokens=req=>open(parseCookies(req)[cookieName]);
export const storeTokens=(res,value)=>res.setHeader('Set-Cookie',`${cookieName}=${seal(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=15552000`);
export const callbackUrl=()=>`${base()}/auth/google/callback`;
export const configured=()=>Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&base());
export async function access(req,res){let token=tokens(req);if(!token)throw Error('Google Calendar is not connected.');if(token.expiry>Date.now()+60_000)return token.access_token;let r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,grant_type:'refresh_token',refresh_token:token.refresh_token})});let fresh=await r.json();if(!r.ok)throw Error(fresh.error_description||'Could not refresh Google access.');token={...token,...fresh,expiry:Date.now()+fresh.expires_in*1000};storeTokens(res,token);return token.access_token}
export async function google(req,res,url,options={}){let token=await access(req,res),r=await fetch(`https://www.googleapis.com/calendar/v3${url}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(options.headers||{})}});if(r.status===204)return null;let json=await r.json();if(!r.ok)throw Error(json.error?.message||'Google Calendar request failed.');return json}
export const json=(res,status,data)=>res.status(status).json(data);
export const eventToGoogle=e=>{if(e.allDay){let next=new Date(e.date+'T12:00');next.setDate(next.getDate()+1);return {summary:e.title,location:e.location||undefined,description:e.notes||undefined,start:{date:e.date},end:{date:next.toISOString().slice(0,10)}}}return {summary:e.title,location:e.location||undefined,description:e.notes||undefined,start:{dateTime:`${e.date}T${e.time||'00:00'}:00`},end:{dateTime:`${e.date}T${e.end||e.time||'01:00'}:00`}}};
export const eventFromGoogle=(e,googleCalendarId='primary')=>({id:`g_${googleCalendarId}_${e.id}`,googleEventId:e.id,googleCalendarId,title:e.summary||'(No title)',date:e.start.date||e.start.dateTime.slice(0,10),time:e.start.date?'':e.start.dateTime?.slice(11,16)||'',end:e.start.date?'':e.end.dateTime?.slice(11,16)||'',allDay:!!e.start.date,location:e.location||'',notes:e.description||'',calendar:'mike',updated:e.updated});
