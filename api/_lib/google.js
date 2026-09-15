import crypto from 'node:crypto';
const cookieName='hearth_google_token';
const base=()=>process.env.APP_BASE_URL?.replace(/\/$/,'');
const key=()=>{const secret=process.env.TOKEN_ENCRYPTION_KEY||process.env.GOOGLE_CLIENT_SECRET;if(!secret)throw new Error('Google connection is not configured');return crypto.createHash('sha256').update(secret).digest();};
export const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i).trim(),x.slice(i+1)];}));
export const appendCookie=(res,cookie)=>{const old=res.getHeader('Set-Cookie')||[];res.setHeader('Set-Cookie',[...(Array.isArray(old)?old:[old]),cookie]);};
export const cookieOptions=()=>`HttpOnly; ${base()?.startsWith('https:')?'Secure; ':''}SameSite=Lax; Path=/`;
function seal(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv),body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url');}
export function tokens(req){try{const b=Buffer.from(cookies(req)[cookieName]||'','base64url'),cipher=crypto.createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));cipher.setAuthTag(b.subarray(12,28));const token=JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString());return token.sessionUntil&&token.sessionUntil<Date.now()?null:token;}catch{return null;}}
export function storeTokens(res,value){const compact={access_token:value.access_token,refresh_token:value.refresh_token,expiry:value.expiry,sessionUntil:Date.now()+15552000000};appendCookie(res,`${cookieName}=${seal(compact)}; ${cookieOptions()}; Max-Age=15552000`);}
export function clearTokens(res){appendCookie(res,`${cookieName}=; ${cookieOptions()}; Max-Age=0`);}
export const callbackUrl=()=>base()+'/auth/google/callback';
export const configured=()=>Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&base());
export function failure(message,status=400){return Object.assign(new Error(message),{status});}
export function guard(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Cookie');
 if(!['GET','HEAD'].includes(req.method)){const origin=req.headers.origin;if(origin&&origin!==base())throw failure('This request must come from Hearth.',403);if(req.headers['sec-fetch-site']==='cross-site')throw failure('Cross-site request rejected.',403);}
}
export async function access(req,res){
 if(req.googleAccess)return req.googleAccess;
 req.googleAccess=(async()=>{let token=tokens(req);if(!token)throw failure('Please reconnect Google Calendar.',401);if(token.expiry>Date.now()+60000)return token.access_token;if(!token.refresh_token)throw failure('Google access expired. Reconnect to enable offline access.',401);
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,grant_type:'refresh_token',refresh_token:token.refresh_token})});const fresh=await r.json();if(!r.ok)throw failure('Google authorization expired or was revoked. Please reconnect.',401);storeTokens(res,{...token,...fresh,expiry:Date.now()+fresh.expires_in*1000});return fresh.access_token;})();
 return req.googleAccess;
}
export async function google(req,res,url,options={}){
 const token=await access(req,res),r=await fetch('https://www.googleapis.com/calendar/v3'+url,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...options.headers}});
 if(r.status===204)return null;const result=await r.json();if(!r.ok)throw failure(r.status===412?'This event changed in Google. Sync, reopen it, and try again.':result.error?.message||'Google Calendar request failed.',r.status);return result;
}
export async function allPages(req,res,path){const items=[];let next;do{const result=await google(req,res,path+(next?(path.includes('?')?'&':'?')+'pageToken='+encodeURIComponent(next):''));items.push(...(result.items||[]));next=result.nextPageToken;}while(next);return items;}
export const json=(res,status,data)=>res.status(status).json(data);
export function eventToGoogle(e){
 if(typeof e.title!=='string'||!e.title.trim()||e.title.length>500)throw failure('Add a title of 1–500 characters.');
 const body={summary:e.title.trim(),location:String(e.location||''),description:String(e.notes||'')};
 if(e.allDay){if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!/^\d{4}-\d{2}-\d{2}$/.test(e.endDate)||e.endDate<=e.date)throw failure('Invalid all-day date range.');body.start={date:e.date};body.end={date:e.endDate};}
 else{if(!e.startDateTime||!e.endDateTime||!Number.isFinite(Date.parse(e.startDateTime))||Date.parse(e.endDateTime)<=Date.parse(e.startDateTime)||!Number.isFinite(Date.parse(e.endDateTime)))throw failure('End time must be after start time.');body.start={dateTime:new Date(e.startDateTime).toISOString()};body.end={dateTime:new Date(e.endDateTime).toISOString()};}
 if(e.reminder==='default')body.reminders={useDefault:true};else if(e.reminder==='none')body.reminders={useDefault:false,overrides:[]};else if(['10','30','60'].includes(e.reminder))body.reminders={useDefault:false,overrides:[{method:'popup',minutes:Number(e.reminder)}]};
 if(e.repeat&&e.repeat!=='none'){
  if(!['daily','weekdays','weekly','monthly'].includes(e.repeat)||!Number.isInteger(Number(e.repeatCount))||Number(e.repeatCount)<1||Number(e.repeatCount)>365)throw failure('Choose a valid repeat pattern and count (1–365).');
  const frequency={daily:'DAILY',weekdays:'WEEKLY;BYDAY=MO,TU,WE,TH,FR',weekly:'WEEKLY',monthly:'MONTHLY'}[e.repeat];
  body.recurrence=['RRULE:FREQ='+frequency+';COUNT='+Number(e.repeatCount)];
  if(!e.allDay){try{new Intl.DateTimeFormat('en',{timeZone:e.timeZone});}catch{throw failure('A valid timezone is required for repeating events.');}if(!e.timeZone)throw failure('A timezone is required for repeating events.');body.start.timeZone=e.timeZone;body.end.timeZone=e.timeZone;}
 }
 return body;
}
export const eventFromGoogle=(e,calendar)=>({id:calendar+'::'+e.id,googleEventId:e.id,googleCalendarId:calendar,title:e.summary||'(No title)',date:e.start.date||e.start.dateTime.slice(0,10),endDate:e.end.date||e.end.dateTime.slice(0,10),time:e.start.dateTime?.slice(11,16)||'',end:e.end.dateTime?.slice(11,16)||'',startDateTime:e.start.dateTime||null,endDateTime:e.end.dateTime||null,allDay:!!e.start.date,location:e.location||'',notes:e.description||'',etag:e.etag,updated:e.updated,htmlLink:e.htmlLink,recurringEventId:e.recurringEventId,eventType:e.eventType||'default',reminder:e.reminders?.useDefault?'default':!e.reminders?.overrides?.length?'none':e.reminders.overrides.length===1&&e.reminders.overrides[0].method==='popup'&&[10,30,60].includes(e.reminders.overrides[0].minutes)?String(e.reminders.overrides[0].minutes):'preserve'});
