import {guard,google,allPages,json,failure,eventFromGoogle,eventToGoogle} from '../../_lib/google.js';
export default async function handler(req,res){
 try{guard(req,res);
  if(req.method==='GET'){
   const from=req.query.from||new Date(Date.now()-7*864e5).toISOString(),to=req.query.to||new Date(Date.now()+180*864e5).toISOString();
   if(!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||Date.parse(to)<=Date.parse(from)||Date.parse(to)-Date.parse(from)>370*864e5)throw failure('Choose a valid calendar range of up to one year.');
   const list=await allPages(req,res,'/users/me/calendarList?maxResults=250');
   const calendars=list.filter(c=>!c.deleted&&c.accessRole!=='none').map(c=>({id:c.id,name:c.summaryOverride||c.summary,backgroundColor:c.backgroundColor||'#1967d2',foregroundColor:c.foregroundColor||'#ffffff',primary:!!c.primary,accessRole:c.accessRole}));
   const events=[],warnings=[];
   // Bounded batches avoid an unbounded burst for accounts with many subscriptions.
   for(let i=0;i<calendars.length;i+=4)await Promise.all(calendars.slice(i,i+4).map(async c=>{
    try{const items=await allPages(req,res,`/calendars/${encodeURIComponent(c.id)}/events?`+new URLSearchParams({singleEvents:'true',orderBy:'startTime',timeMin:from,timeMax:to,maxResults:'2500'}));events.push(...items.filter(e=>e.status!=='cancelled'&&e.start&&e.end).map(e=>eventFromGoogle(e,c.id)));}
    catch(error){if(error.status===401)throw error;warnings.push(c.name+': '+error.message);}
   }));
   return json(res,200,{events,calendars,warnings});
  }
  if(req.method==='POST'){
   const e=req.body;if(!e||typeof e.googleCalendarId!=='string')throw failure('Choose a Google calendar.');
   if(e.account){const primary=await google(req,res,'/calendars/primary');if(primary.id!==e.account)throw failure('This pending change belongs to a different Google account.',403);}
   const payload=eventToGoogle(e),calendar=encodeURIComponent(e.googleCalendarId);
   if(!e.googleEventId&&e.clientEventId){if(!/^[0-9a-f]{32}$/.test(e.clientEventId))throw failure('Invalid client event ID.');payload.id=e.clientEventId;payload.extendedProperties={private:{hearthCreateKey:e.clientEventId}};}
   const path=`/calendars/${calendar}/events`+(e.googleEventId?'/'+encodeURIComponent(e.googleEventId):'');
   let saved;try{saved=await google(req,res,path,{method:e.googleEventId?'PATCH':'POST',headers:e.etag?{'If-Match':e.etag}:{},body:JSON.stringify(payload)});}catch(error){if(error.status!==409||e.googleEventId||!e.clientEventId)throw error;saved=await google(req,res,path+'/'+e.clientEventId);if(saved.extendedProperties?.private?.hearthCreateKey!==e.clientEventId)throw error;}
   return json(res,200,{event:eventFromGoogle(saved,e.googleCalendarId)});
  }
  return json(res,405,{error:'Method not allowed'});
 }catch(e){return json(res,e.status||500,{error:e.message});}
}
