import {installHousehold} from './household-ui.js';
import {kinds,applyChanges} from './household-model.js';
import {dateKey,parseDay,addDays,clock,escapeHTML as esc,safeColor,normalizeEvent,occursOn,layoutEvents,monthDates} from './calendar-model.js';
import {recipes,mealGroups,normalizeCustomRecipe} from './recipes.js';
import {Outbox} from './offline.js';
import {overlaps,shiftedEvent,expandLocal,mergePending} from './planning.js';
import {pb} from './pocketbase.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{toast('Device storage is full or unavailable.');}};
const localCalendar={id:'local',name:'On this device',backgroundColor:'#2b6777',foregroundColor:'#ffffff',accessRole:'owner'};
// Curated calendar palette — warm, distinct, readable on white text in both light and dark modes.
const calendarPalette=[
 {bg:'#2b6777',fg:'#ffffff'}, // teal (local / primary)
 {bg:'#c44536',fg:'#ffffff'}, // warm red
 {bg:'#7b68a5',fg:'#ffffff'}, // soft purple
 {bg:'#3a7d44',fg:'#ffffff'}, // forest green
 {bg:'#d4853a',fg:'#ffffff'}, // amber / burnt orange
 {bg:'#3872a8',fg:'#ffffff'}, // ocean blue
 {bg:'#b5566e',fg:'#ffffff'}, // rose
 {bg:'#5a8a6f',fg:'#ffffff'}, // sage
 {bg:'#8c6e3f',fg:'#ffffff'}, // warm brown
 {bg:'#4a7c91',fg:'#ffffff'}, // steel teal
];
const calColorKey='hearth-calendar-colors';
function colorizeCalendars(calendars){const saved=read(calColorKey,{});return calendars.map((c,i)=>{const pi=saved[c.id]??((i+1)%calendarPalette.length);const color=calendarPalette[pi]||calendarPalette[0];return {...c,backgroundColor:color.bg,foregroundColor:color.fg};});}
function applyLocalColor(){const saved=read(calColorKey,{});const pi=saved['local'];if(pi!=null&&calendarPalette[pi]){localCalendar.backgroundColor=calendarPalette[pi].bg;localCalendar.foregroundColor=calendarPalette[pi].fg;}}
applyLocalColor();
const settings=read('hearth-settings',{theme:read('hearth-dark-mode',false)?'dark':'system',view:'month'});
const state={date:new Date(),mini:new Date(new Date().getFullYear(),new Date().getMonth(),1),view:settings.view||'month',app:settings.destination||'home',connected:false,configured:false,loading:false,mutating:false,events:[],calendars:[localCalendar],hidden:read('hearth-hidden-calendars',[]),editing:null,home:read('hearth-home',{tasks:[],groceries:[],pantry:[],meals:[]}),shared:false,homeReady:false,account:'device',members:[],partner:null,verified:false,lastCalendarSync:null,lastHomeSync:null,lastError:'',mealWeek:addDays(new Date(),-((new Date().getDay()+6)%7))};
const allRecipes=()=>[...recipes,...homeItems('recipes')];
const outbox=new Outbox();
// Old synced data is never reused across Google accounts or uploaded on connection.
state.localEvents=read('hearth-events',[]).filter(e=>!e.googleEventId).map(e=>normalizeEvent({...e,calendar:'local',googleCalendarId:null}));
state.events=[...state.localEvents];
for(const kind of kinds) state.home[kind]=(state.home[kind]||[]).map(item=>({...item,id:item.id||crypto.randomUUID(),kind}));
const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
const monthTitle=d=>d.toLocaleDateString(undefined,{month:'long',year:'numeric'});
const shortDate=d=>d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
const timeLabel=t=>{const [h,m]=t.split(':').map(Number);return (h%12||12)+(m?':'+String(m).padStart(2,'0'):'')+(h<12?' AM':' PM');};
let toastTimer,syncSequence=0,shareCalendar=null,editingItem=null;
function toast(message){$('#toast').textContent=message;$('#toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),6000);}
async function api(url,options={}){const r=await fetch(url,{cache:'no-store',credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});const data=r.status===204?null:await r.json().catch(()=>({error:'The service returned an unexpected response.'}));if(!r.ok){const error=new Error(data?.error||'Request failed');error.status=r.status;throw error;}return data;}
const post=(url,body,method='POST')=>api(url,{method,body:JSON.stringify(body)});
function notice(message=''){$('#calendarNotice').textContent=message;$('#calendarNotice').classList.toggle('hidden',!message);}
// PocketBase Cross-Device Sync
let settingsSyncTimeout=null,receivingRemoteSettings=false;
function syncSettingsToPocketBase(){
 if(!pb.isAuthenticated()||receivingRemoteSettings)return;
 clearTimeout(settingsSyncTimeout);
 settingsSyncTimeout=setTimeout(async()=>{
  try{
   await pb.saveSettings({
    theme:settings.theme,
    view:settings.view,
    destination:state.app,
    spouse:settings.spouse||'',
    calendarColors:read(calColorKey,{}),
    hiddenCalendars:state.hidden||[],
    favorites:read('hearth-favorites-'+state.account,read('hearth-favorites-device',[]))
   });
  }catch(err){console.warn('PocketBase settings sync error:',err.message);}
 },300);
}

function applyPocketBaseSettings(data){
 if(!data||typeof data!=='object')return;
 receivingRemoteSettings=true;
 try{
  let changed=false;
  if(data.theme&&data.theme!==settings.theme){settings.theme=data.theme;theme();changed=true;}
  if(data.view&&data.view!==settings.view){settings.view=data.view;state.view=data.view;if($('#defaultView'))$('#defaultView').value=data.view;if($('#viewSelect'))$('#viewSelect').value=data.view;changed=true;}
  if(data.destination&&data.destination!==state.app&&householdUI?.navigate){householdUI.navigate(data.destination,false);changed=true;}
  if(data.spouse!==undefined&&data.spouse!==settings.spouse){settings.spouse=data.spouse;if($('#spouseSetting'))$('#spouseSetting').value=data.spouse;changed=true;}
  if(data.calendarColors&&typeof data.calendarColors==='object'){write(calColorKey,data.calendarColors);applyLocalColor();state.calendars=colorizeCalendars(state.calendars.map(c=>({...c})));renderCalendars();changed=true;}
  if(Array.isArray(data.hiddenCalendars)){state.hidden=data.hiddenCalendars;write('hearth-hidden-calendars',state.hidden);renderCalendars();changed=true;}
  if(Array.isArray(data.favorites)){write('hearth-favorites-'+state.account,data.favorites);write('hearth-favorites-device',data.favorites);changed=true;}
  if(changed){write('hearth-settings',settings);render();renderDashboard();}
 }finally{
  receivingRemoteSettings=false;
 }
}

async function syncPocketBaseItem(item,remove=false){
 if(!pb.isAuthenticated())return;
 try{
  const clientId=item.id;
  if(remove){
   if(item.pb_id){
    await pb.delete('hearth_items',item.pb_id).catch(()=>{});
   }else{
    const records=await pb.getFullList('hearth_items',{filter:`client_id="${clientId}"`}).catch(()=>[]);
    for(const r of records)await pb.delete('hearth_items',r.id).catch(()=>{});
   }
  }else{
   const details={...(item.details||{})};
   for(const k of ['amount','servings','unit','aisle','recipeId','recipeSnapshot','repeat','priority','expires','rotation','skipped','nextId','scheduledDue','seriesAnchor','custom','ingredients','portions','steps','minutes'])if(item[k]!==undefined)details[k]=item[k];
   const record={client_id:clientId,kind:item.kind,name:item.name||'',done:!!item.done,due:item.due||'',quantity:item.quantity||'',details,assignedTo:item.assignedTo||'',user:pb.user()?.id||null};
   if(item.pb_id){
    await pb.update('hearth_items',item.pb_id,record).catch(async()=>{
     const existing=(await pb.getFullList('hearth_items',{filter:`client_id="${clientId}"`}).catch(()=>[]))[0];
     if(existing){item.pb_id=existing.id;await pb.update('hearth_items',existing.id,record);}
     else{const created=await pb.create('hearth_items',record);item.pb_id=created.id;}
    });
   }else{
    const existing=(await pb.getFullList('hearth_items',{filter:`client_id="${clientId}"`}).catch(()=>[]))[0];
    if(existing){item.pb_id=existing.id;await pb.update('hearth_items',existing.id,record);}
    else{const created=await pb.create('hearth_items',record);item.pb_id=created.id;}
   }
  }
 }catch(err){console.warn('PocketBase item sync error:',err.message);}
}

async function syncPocketBaseBatch(changes){
 if(!pb.isAuthenticated()||!Array.isArray(changes))return;
 for(const c of changes)await syncPocketBaseItem(c.item,!!c.remove).catch(()=>{});
}

async function syncPocketBaseEvent(event,remove=false){
 if(!pb.isAuthenticated()||event.googleCalendarId)return;
 try{
  const clientId=event.id;
  if(remove){
   if(event.pb_id){
    await pb.delete('hearth_events',event.pb_id).catch(()=>{});
   }else{
    const records=await pb.getFullList('hearth_events',{filter:`client_id="${clientId}"`}).catch(()=>[]);
    for(const r of records)await pb.delete('hearth_events',r.id).catch(()=>{});
   }
  }else{
   const record={client_id:clientId,title:event.title||'',date:event.date||'',endDate:event.endDate||event.date||'',time:event.time||'',end:event.end||'',allDay:!!event.allDay,location:event.location||'',notes:event.notes||'',reminder:event.reminder||'',repeat:event.repeat||'none',repeatCount:Number(event.repeatCount)||0,timeZone:event.timeZone||'',user:pb.user()?.id||null};
   if(event.pb_id){
    await pb.update('hearth_events',event.pb_id,record).catch(async()=>{
     const existing=(await pb.getFullList('hearth_events',{filter:`client_id="${clientId}"`}).catch(()=>[]))[0];
     if(existing){event.pb_id=existing.id;await pb.update('hearth_events',existing.id,record);}
     else{const created=await pb.create('hearth_events',record);event.pb_id=created.id;}
    });
   }else{
    const existing=(await pb.getFullList('hearth_events',{filter:`client_id="${clientId}"`}).catch(()=>[]))[0];
    if(existing){event.pb_id=existing.id;await pb.update('hearth_events',existing.id,record);}
    else{const created=await pb.create('hearth_events',record);event.pb_id=created.id;}
   }
  }
 }catch(err){console.warn('PocketBase event sync error:',err.message);}
}

async function loadPocketBaseData(){
 if(!pb.isAuthenticated())return;
 try{
  const pbSettingsRec=await pb.fetchSettings().catch(()=>null);
  if(pbSettingsRec?.settings)applyPocketBaseSettings(pbSettingsRec.settings);
  const items=await pb.fetchItems().catch(()=>[]);
  if(items.length>0){
   const grouped=Object.fromEntries(kinds.map(k=>[k,[]]));
   for(const r of items){
    const item={id:r.client_id||r.id,pb_id:r.id,kind:r.kind,name:r.name,done:!!r.done,due:r.due||'',quantity:r.quantity||'',assignedTo:r.assignedTo||'',...(r.details||{})};
    if(grouped[r.kind])grouped[r.kind].push(item);
   }
   state.home=grouped;
   localStorage.setItem('hearth-home',JSON.stringify(state.home));
   renderHome();renderDashboard();
  }
  const events=await pb.fetchEvents().catch(()=>[]);
  if(events.length>0){
   const pbEvents=events.map(e=>normalizeEvent({id:e.client_id||e.id,pb_id:e.id,calendar:'local',googleCalendarId:null,title:e.title,date:e.date,endDate:e.endDate,time:e.time,end:e.end,allDay:e.allDay,location:e.location,notes:e.notes,reminder:e.reminder,repeat:e.repeat,repeatCount:e.repeatCount,timeZone:e.timeZone}));
   const googleEvents=state.events.filter(e=>e.googleCalendarId);
   state.events=[...googleEvents,...pbEvents];
   state.localEvents=pbEvents;
   localStorage.setItem('hearth-events',JSON.stringify(pbEvents));
   render();
  }
 }catch(err){console.warn('PocketBase load error:',err.message);}
}

function setupPocketBaseSubscriptions(){
 if(!pb.isAuthenticated())return;
 pb.connectRealtime();
 pb.subscribe('hearth_settings',payload=>{
  if(payload.action==='create'||payload.action==='update'){
   applyPocketBaseSettings(payload.record?.settings);
   toast('Settings updated from another device');
  }
 });
 pb.subscribe('hearth_items',payload=>{
  const r=payload.record;if(!r)return;
  const clientId=r.client_id||r.id;
  if(payload.action==='delete'){
   for(const k of kinds)state.home[k]=(state.home[k]||[]).filter(x=>x.id!==clientId&&x.pb_id!==r.id);
  }else{
   const item={id:clientId,pb_id:r.id,kind:r.kind,name:r.name,done:!!r.done,due:r.due||'',quantity:r.quantity||'',assignedTo:r.assignedTo||'',...(r.details||{})};
   const kind=r.kind;
   if(state.home[kind]){
    const idx=state.home[kind].findIndex(x=>x.id===clientId||x.pb_id===r.id);
    if(idx>=0)state.home[kind][idx]=item;else state.home[kind].push(item);
   }
  }
  localStorage.setItem('hearth-home',JSON.stringify(state.home));
  renderHome();renderDashboard();
 });
 pb.subscribe('hearth_events',payload=>{
  const r=payload.record;if(!r)return;
  const clientId=r.client_id||r.id;
  if(payload.action==='delete'){
   state.events=state.events.filter(e=>e.id!==clientId&&e.pb_id!==r.id);
   state.localEvents=state.localEvents.filter(e=>e.id!==clientId&&e.pb_id!==r.id);
  }else{
   const ev=normalizeEvent({id:clientId,pb_id:r.id,calendar:'local',googleCalendarId:null,title:r.title,date:r.date,endDate:r.endDate,time:r.time,end:r.end,allDay:r.allDay,location:r.location,notes:r.notes,reminder:r.reminder,repeat:r.repeat,repeatCount:r.repeatCount,timeZone:r.timeZone});
   state.events=state.events.filter(e=>e.id!==clientId&&e.pb_id!==r.id);
   state.events.push(ev);
   state.localEvents=state.localEvents.filter(e=>e.id!==clientId&&e.pb_id!==r.id);
   state.localEvents.push(ev);
  }
  localStorage.setItem('hearth-events',JSON.stringify(state.localEvents));
  render();renderDashboard();
 });
}

async function uploadDeviceDataToPocketBase(){
 if(!pb.isAuthenticated())throw Error('Not logged into PocketBase.');
 await pb.saveSettings({
  theme:settings.theme,
  view:settings.view,
  destination:state.app,
  spouse:settings.spouse||'',
  calendarColors:read(calColorKey,{}),
  hiddenCalendars:state.hidden||[],
  favorites:read('hearth-favorites-'+state.account,read('hearth-favorites-device',[]))
 });
 for(const k of kinds){
  for(const item of homeItems(k))await syncPocketBaseItem(item,false);
 }
 for(const ev of (state.localEvents||[]))await syncPocketBaseEvent(ev,false);
}

function updatePocketBaseUI(){
 const isAuth=pb.isAuthenticated();
 const disconnected=$('#pbDisconnectedState'),connected=$('#pbConnectedState');
 if(disconnected)disconnected.classList.toggle('hidden',isAuth);
 if(connected)connected.classList.toggle('hidden',!isAuth);
 const pbBtn=$('#pbAccountBtn'),pbText=$('#pbAccountText');
 if(pbBtn&&pbText){
  pbBtn.classList.toggle('logged-in',isAuth);
  if(isAuth){
   const user=pb.user();
   pbText.textContent=user?.email?user.email.split('@')[0]:'Account';
   pbBtn.title=`Signed in as ${user?.email||'PocketBase'}. Click to sign out.`;
  }else{
   pbText.textContent='Sign In';
   pbBtn.title='Sign in to sync across devices';
  }
 }
 if(isAuth){
  const user=pb.user();
  if($('#pbUserEmail'))$('#pbUserEmail').textContent=user?.email||'Connected to PocketBase';
  if($('#pbServerUrl'))$('#pbServerUrl').textContent=pb.getUrl();
 }else{
  if($('#pbUrlInput'))$('#pbUrlInput').value=pb.getUrl();
 }
}
function calendarFor(e){return state.calendars.find(c=>c.id===(e.googleCalendarId||'local'))||localCalendar;}
function paint(e){const c=calendarFor(e);return `background:${safeColor(c.backgroundColor)};color:${safeColor(c.foregroundColor)}`;}
let listCache={source:null,key:'',value:null};
function displayEvents(){const from=dateKey(addDays(new Date(state.date.getFullYear(),state.date.getMonth(),1),-7)),to=dateKey(addDays(new Date(state.date.getFullYear(),state.date.getMonth()+1,1),190)),key=state.date.getTime()+'|'+state.account+'|'+outbox.revision;if(listCache.source===state.events&&listCache.key===key)return listCache.value;const value=mergePending(expandLocal(state.events,from,to),outbox.forAccount(state.account));listCache={source:state.events,key,value};return value;}
function events(){const q=$('#searchInput').value.trim().toLowerCase();return displayEvents().filter(e=>!state.hidden.includes(e.googleCalendarId||'local')&&(!q||[e.title,e.notes,e.location].some(s=>(s||'').toLowerCase().includes(q))));}
function saveLocal(){state.localEvents=state.events.filter(e=>!e.googleEventId);write('hearth-events',state.localEvents);}
function syncRange(){let start=new Date(state.date.getFullYear(),state.date.getMonth(),1),end=new Date(state.date.getFullYear(),state.date.getMonth()+1,1);if(state.app==='home'||state.view==='schedule'){start=parseDay(dateKey(new Date()));end=addDays(start,state.app==='home'?14:180);}else{start=addDays(start,-7);end=addDays(end,7);}return {from:start.toISOString(),to:end.toISOString()};}
async function sync(){
  if(!state.connected||state.mutating)return;
  const sequence=++syncSequence;state.loading=true;$('#connectBtn').disabled=true;$('#syncStatus').textContent='Syncing…';notice();
  try{const remote=await api('/api/google/events?'+new URLSearchParams(syncRange()));if(sequence!==syncSequence)return;
    state.calendars=colorizeCalendars(remote.calendars);state.events=remote.events.map(normalizeEvent);if(state.account==='device')state.account=remote.calendars.find(c=>c.primary)?.id||'device';state.lastCalendarSync=Date.now();state.lastError='';cacheAccount();
    $('#syncStatus').textContent='Synced at '+new Date().toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
    if(remote.warnings?.length){notice(remote.warnings.join(' '));state.lastError=remote.warnings.join(' ');}render();renderDashboard();
  }catch(e){if(sequence!==syncSequence)return;$('#syncStatus').textContent='Sync failed — retry';notice(e.message);if(e.status===401){state.connected=false;$('#connectBtn').textContent='Reconnect';}}
  finally{if(sequence===syncSequence){state.loading=false;$('#connectBtn').disabled=false;}}
}
async function initConnection(){
  try{const s=await api('/api/google/status');if(state.account!==(s.account||'device')){$$('dialog[open]').forEach(d=>d.close());state.shared=false;restoreDeviceHome();}state.connected=s.connected;state.configured=s.configured;state.verified=!!s.connected;state.account=s.account||'device';state.members=s.members||[];state.partner=s.partner||null;state.householdConfigured=s.householdConfigured;$('#connectBtn').textContent=s.connected?'Sync now':'Connect Google';$('#syncStatus').textContent=s.connected?'Connected':s.configured?'Sign in to see your calendars':'Google connection needs setup';if(s.connected){state.events=[];await sync();await flushQueue();}}
  catch{const cached=read('hearth-account-cache',null);if(cached){Object.assign(state,{account:cached.account,calendars:colorizeCalendars(cached.calendars),events:cached.events,connected:true,shared:cached.shared,home:cached.home||state.home,members:cached.members||[],partner:cached.partner,verified:false});$('#syncStatus').textContent='Offline · cached calendars';$('#connectBtn').textContent='Retry sync';}else $('#syncStatus').textContent='Offline · local calendar';}
  await loadHome();render();
}
function renderCalendars(){
  const groups=state.connected?[['My calendars',state.calendars.filter(c=>c.accessRole==='owner')],['Other calendars',state.calendars.filter(c=>c.accessRole!=='owner')]]:[['Local calendar',[localCalendar]]];
  $('#calendarLists').innerHTML=groups.map(([name,list])=>`<section class="calendar-group"><h3>${name}</h3>${list.map(c=>`<div class="calendar-row"><button type="button" class="color-swatch" data-color-for="${esc(c.id)}" style="background:${safeColor(c.backgroundColor)}" aria-label="Change color for ${esc(c.name)}" title="Change color"></button><label title="${esc(c.name)}"><input type="checkbox" data-calendar="${esc(c.id)}" style="accent-color:${safeColor(c.backgroundColor)}" ${state.hidden.includes(c.id)?'':'checked'}><span>${esc(c.name)}</span></label>${state.connected&&c.accessRole==='owner'?`<button class="icon" data-share="${esc(c.id)}" aria-label="Share ${esc(c.name)}">↗</button>`:''}</div>`).join('')||'<p class="muted">No calendars in this group.</p>'}</section>`).join('');
}
function renderMini(){const first=state.mini,start=addDays(first,-first.getDay());$('#miniTitle').textContent=monthTitle(first);$('#miniGrid').innerHTML=['S','M','T','W','T','F','S'].map(x=>`<span>${x}</span>`).join('')+Array.from({length:42},(_,i)=>{const d=addDays(start,i);return `<button data-day="${dateKey(d)}" class="${d.getMonth()!==first.getMonth()?'dim ':''}${dateKey(d)===dateKey(state.date)?'selected':''}" aria-label="${esc(d.toDateString())}">${d.getDate()}</button>`;}).join('');}
function chip(e){return `<button class="event-chip" data-event="${esc(e.id)}" style="${paint(e)}" title="${esc(e.title)}">${e.pending?'◷ ':''}${e.allDay?'':esc(timeLabel(e.time))+' '}${esc(e.title)}${e.localParentId?' ↻':''}</button>`;}
function renderMonth(){const dates=monthDates(state.date);return `<div class="month"><div class="weekdays">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(s=>`<span>${s}</span>`).join('')}</div><div class="month-grid" style="grid-template-rows:repeat(${dates.length/7},minmax(85px,1fr))">${dates.map(d=>{const key=dateKey(d);return `<div class="day-cell ${key===dateKey(new Date())?'today':''}" data-new-day="${key}"><button class="day-num ${d.getMonth()!==state.date.getMonth()?'dim':''}" data-new-day="${key}" aria-label="Create event on ${key}">${d.getDate()}</button>${events().filter(e=>occursOn(e,key)).map(chip).join('')}</div>`;}).join('')}</div></div>`;}
function renderTimeline(){
  const start=state.view==='day'?state.date:addDays(state.date,-state.date.getDay()),days=Array.from({length:state.view==='day'?1:7},(_,i)=>addDays(start,i)),cols=`60px repeat(${days.length},minmax(0,1fr))`,current=dateKey(new Date());
  return `<div class="timeline" style="grid-template-columns:${cols};${days.length===1?'min-width:0':''}"><div class="timeline-header" style="grid-template-columns:${cols}"><div class="timeline-zone">All day</div>${days.map(d=>`<div class="timeline-day-head ${dateKey(d)===current?'today':''}"><div class="weekday">${d.toLocaleDateString(undefined,{weekday:'short'})}</div><div class="date-circle">${d.getDate()}</div><div class="all-day">${events().filter(e=>e.allDay&&occursOn(e,dateKey(d))).map(chip).join('')}</div></div>`).join('')}</div><div class="time-gutter">${Array.from({length:24},(_,h)=>`<span class="hour-label" data-hour="${h}" style="top:${h*60}px">${timeLabel(String(h).padStart(2,'0')+':00')}</span>`).join('')}</div>${days.map(d=>{const key=dateKey(d);return `<div class="time-day" data-time-day="${key}">${layoutEvents(events(),key).map(s=>`<button class="timed-event" data-event="${esc(s.event.id)}" style="top:${s.start}px;height:${s.end-s.start}px;left:calc(${s.lane/s.lanes*100}% + 2px);width:calc(${100/s.lanes}% - 4px);${paint(s.event)}" title="${esc(s.event.title+' · '+timeLabel(s.event.time)+' – '+timeLabel(s.event.end))}"><b>${esc(s.event.title)}</b><small>${esc(timeLabel(s.event.time)+' – '+timeLabel(s.event.end))}</small></button>`).join('')}${key===current?`<div class="now-line" style="top:${new Date().getHours()*60+new Date().getMinutes()}px"></div>`:''}</div>`;}).join('')}</div>`;
}
function renderAgenda(){
 const today=dateKey(new Date()),end=addDays(parseDay(today),180),days=[];
 for(let d=parseDay(today);d<end;d=addDays(d,1)){const list=events().filter(e=>occursOn(e,dateKey(d))).sort((a,b)=>Number(b.allDay)-Number(a.allDay)||(a.time||'').localeCompare(b.time||''));if(list.length)days.push(`<section class="agenda-day"><div class="agenda-date">${esc(d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}))}</div><div>${list.map(e=>`<button class="agenda-event" data-event="${esc(e.id)}" style="border-color:${safeColor(calendarFor(e).backgroundColor)}"><time>${e.allDay?'All day':esc(timeLabel(e.time)+' – '+timeLabel(e.end))}</time><span>${esc(e.title)}<small class="muted"> · ${esc(calendarFor(e).name)}</small></span></button>`).join('')}</div></section>`);}
 return '<div class="agenda">'+(days.join('')||'<p class="empty">No upcoming events match your selected calendars and search.</p>')+'</div>';
}
function render(){
  renderMini();renderCalendars();$('#viewSelect').value=state.view;
  const title=state.view==='schedule'?'Upcoming · next 6 months':state.view==='day'?state.date.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric',year:'numeric'}):state.view==='week'?shortDate(addDays(state.date,-state.date.getDay()))+' – '+shortDate(addDays(state.date,6-state.date.getDay())):monthTitle(state.date);
  $('#periodTitle').textContent=title;$('#prevBtn').disabled=$('#nextBtn').disabled=state.view==='schedule';
  const scroll=$('#calendarContent').scrollTop;$('#calendarContent').innerHTML=state.view==='month'?renderMonth():state.view==='schedule'?renderAgenda():renderTimeline();$('#calendarContent').scrollTop=scroll;
  $('#calendarFooter').textContent=zone+' · '+(state.connected?'Google events · refreshes every minute while open':'Local events stay on this device');
  $('#createBtn').disabled=state.connected&&!state.calendars.some(c=>['owner','writer'].includes(c.accessRole));decorateTimedEvents();renderSyncDetails();
}
function navigate(delta){if(state.view==='month'){state.date=new Date(state.date.getFullYear(),state.date.getMonth()+delta,1);}else state.date=addDays(state.date,delta*(state.view==='week'?7:1));state.mini=new Date(state.date.getFullYear(),state.date.getMonth(),1);render();sync();}
function toggleAllDay(){for(const el of $$('.time-field'))el.classList.toggle('hidden',$('#allDay').checked);$('#eventTime').required=$('#eventEnd').required=!$('#allDay').checked;}
function openEvent(e=null,day=dateKey(state.date),time='10:00'){
 if(state.loading||state.mutating)return toast('Wait for the current calendar operation to finish.');
 state.editing=e;$('#eventForm').reset();$('#eventMore').open=!!e;$('#eventError').textContent='';
 const writable=state.calendars.filter(c=>['owner','writer'].includes(c.accessRole)),c=e?calendarFor(e):writable.find(x=>x.primary)||writable[0];
 if(!c)return toast('No writable calendar is available.');
 const readOnly=!!e&&(!['owner','writer'].includes(c.accessRole)||e.eventType&&e.eventType!=='default');
 const end=new Date(day+'T'+time);end.setHours(end.getHours()+1);
 $('#eventHeading').textContent=readOnly?'Event details':e?'Edit event':'New event';$('#eventTitle').value=e?.title||'';$('#eventDate').value=e?.date||day;$('#eventTime').value=e?.time||time;$('#eventEnd').value=e?.end||clock(end);$('#allDay').checked=e?.allDay||false;
 $('#eventEndDate').value=e?(e.allDay?dateKey(addDays(parseDay(e.endDate),-1)):e.endDate):dateKey(end);
 $('#eventCalendar').innerHTML=(e?[c]:writable).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');$('#eventCalendar').value=c.id;
 $('#eventLocation').value=e?.location||'';$('#eventNotes').value=e?.notes||'';$('#eventReminder').value=e?.reminder||'default';$('#eventTimezone').textContent='Times shown in '+zone;
 $('#eventRepeat').value=e?.repeat||'none';$('#eventRepeatCount').value=e?.repeatCount||12;$('#eventConflicts').classList.add('hidden');
 $('#eventInfo').textContent=readOnly?'This event is read-only here. Open it in Google for more options.':e?.recurringEventId||e?.localParentId?'Changes apply to this occurrence only. Create a new series to use a different repeat pattern.':e?'The event stays on its original calendar.':'All-day end dates include the selected last day.';
 for(const input of $$('#eventForm input, #eventForm textarea, #eventForm select'))input.disabled=readOnly;
 $('#eventCalendar').disabled=!!e||readOnly;$('#eventRepeat').disabled=$('#eventRepeatCount').disabled=!!e||readOnly;$('#deleteBtn').classList.toggle('hidden',!e||readOnly);$('#saveEventBtn').classList.toggle('hidden',readOnly);
 $('#googleEventLink').classList.toggle('hidden',!e?.htmlLink);$('#googleEventLink').href=e?.htmlLink?.startsWith('https://')?e.htmlLink:'#';
 toggleAllDay();$('#eventDialog').showModal();$('#eventTitle').focus();
}
async function saveEvent(ev){
 ev.preventDefault();const old=state.editing,allDay=$('#allDay').checked;
 const data={...old,id:old?.id||crypto.randomUUID(),title:$('#eventTitle').value.trim(),date:$('#eventDate').value,endDate:$('#eventEndDate').value,time:$('#eventTime').value,end:$('#eventEnd').value,allDay,location:$('#eventLocation').value,notes:$('#eventNotes').value,reminder:$('#eventReminder').value,googleCalendarId:state.connected?$('#eventCalendar').value:null,repeat:old?'none':$('#eventRepeat').value,repeatCount:Number($('#eventRepeatCount').value),timeZone:zone};
 if(!data.title)return;
 if(allDay){if(data.endDate<data.date){$('#eventError').textContent='End date must be on or after start date.';return;}data.endDate=dateKey(addDays(parseDay(data.endDate),1));}
 else{const a=new Date(data.date+'T'+data.time),b=new Date(data.endDate+'T'+data.end);if(!(b>a)){$('#eventError').textContent='End must be after start. Use the next date for overnight events.';return;}data.startDateTime=a.toISOString();data.endDateTime=b.toISOString();}
 state.mutating=true;$('#saveEventBtn').disabled=true;$('#deleteBtn').disabled=true;++syncSequence;state.loading=false;
 try{const changedTime=!old||['date','endDate','time','end','allDay'].some(k=>old[k]!==data[k]);const conflicts=changedTime?displayEvents().filter(e=>e.id!==old?.id&&e.localParentId!==old?.id&&overlaps(e,data)):[];if(conflicts.length&&!confirm('This overlaps '+conflicts.map(e=>e.title).slice(0,3).join(', ')+'. Save anyway?'))return;await persistEvent(data,old);$('#eventDialog').close();render();renderDashboard();}
 catch(error){$('#eventError').textContent=error.message;}
 finally{state.mutating=false;$('#saveEventBtn').disabled=false;$('#deleteBtn').disabled=false;$('#connectBtn').disabled=false;}
}
async function deleteEvent(){
const e=state.editing;if(!e)return;
 if(e.pending)return toast('Sync or discard this pending edit in Sync details before deleting it.');
 try{deferDelete({type:'event',item:e,before:e,account:state.connected?state.account:'device'});$('#eventDialog').close();render();}catch(error){$('#eventError').textContent=error.message;}
}
function theme(){const dark=settings.theme==='dark'||settings.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=dark?'dark':'light';$('#themeSelect').value=settings.theme;write('hearth-settings',settings);syncSettingsToPocketBase();}
function openSettings(){updatePocketBaseUI();$('#defaultView').value=settings.view;$('#accountStatus').textContent=state.connected?'Google Calendar is connected in this browser.':state.configured?'Sign in with Google to load your calendars.':'Google connection needs deployment configuration.';$('#signInBtn').textContent=state.connected?'Switch Google account':'Connect Google';$('#disconnectBtn').classList.toggle('hidden',!state.connected);$('#storageExplanation').textContent=state.shared?'Recipes, meals, tasks, pantry, and shopping are shared with your household and refresh while a household screen is open.':'Household lists and recipes currently save on this device. Connect a configured household to share them across devices.';$('#timezoneLabel').textContent=zone;$('#settingsDialog').showModal();}
function restoreDeviceHome(){state.home=read('hearth-home',{tasks:[],groceries:[],pantry:[],meals:[]});for(const kind of kinds)state.home[kind]=(state.home[kind]||[]).map(item=>({...item,id:item.id||crypto.randomUUID(),kind}));}
async function loadHome(){
 const account=state.account,generation=state.homeGeneration||0;
 try{const result=await api('/api/household');if(state.account!==account||generation!==(state.homeGeneration||0)||state.flushing)return;
 const wasShared=state.shared;state.shared=result.shared;
 if(result.shared){state.home=Object.fromEntries(kinds.map(kind=>[kind,result.items.filter(x=>x.kind===kind)]));if(result.members)state.members=result.members;state.lastHomeSync=Date.now();state.lastError='';cacheAccount();await householdUI.migrateShared();}else if(wasShared)restoreDeviceHome();
 }catch(e){if(state.account!==account)return;state.lastError=e.message;if(e.status===401||e.status===403){state.shared=false;restoreDeviceHome();}else if(state.shared)toast('Household refresh failed: '+e.message);}
 state.homeReady=true;renderHome();
}
function homeItems(kind){let home=state.home;for(const op of outbox.forAccount(state.shared?state.account:'device')){if(op.status==='failed')break;if(op.type==='batch')home=applyChanges(home,op.changes.map(c=>({...c,item:{...c.item,pending:true}})));if(op.type==='home')home=applyChanges(home,[{item:{...op.item,pending:true},remove:op.action==='delete'}]);}return home[kind]||[];}
function renderHome(){householdUI.render();}
async function homeChange(kind,item,remove=false){
 state.homeGeneration=(state.homeGeneration||0)+1;const homeAccount=state.account;item={...item,kind};const old=homeItems(kind).find(x=>x.id===item.id);
 if(remove){deferDelete({type:'home',item,before:old||item,account:state.shared?state.account:'device',shared:state.shared});if(pb.isAuthenticated())syncPocketBaseItem(item,true);renderHome();return;}
 const actor=state.shared?state.account:'device';
 item={...item,createdBy:old?.createdBy||actor,updatedBy:actor,completedBy:item.done?(old?.completedBy||actor):null};
 try{
  if(state.shared){try{if(!navigator.onLine||outbox.forAccount(homeAccount).some(o=>o.type!=='event'))throw new TypeError('Offline');const result=await post('/api/household',{...item,account:state.account});if(state.account!==homeAccount)return;item=result.items?.[0]||item;rebasePending(result.items||[]);}catch(e){if(e.status&&e.status<500)throw e;enqueue({type:'home',action:'upsert',item,before:old,account:homeAccount,shared:true});renderHome();return;}}
  const next=applyChanges(state.home,[{item}]);if(!state.shared)localStorage.setItem('hearth-home',JSON.stringify(next));state.home=next;
  if(pb.isAuthenticated())syncPocketBaseItem(item,false);
  if(state.shared)cacheAccount();renderHome();
 }catch(e){state.lastError=e.message;toast('List change could not be saved: '+e.message);renderHome();throw e;}
}
for(const [button,kind] of [['#clearTasks','tasks'],['#clearGroceries','groceries']])$(button).onclick=async()=>{const completed=state.home[kind].filter(x=>x.done);if(!completed.length)return toast('No completed items to clear.');if(!confirm('Remove '+completed.length+' completed items?'))return;$(button).disabled=true;try{for(const item of completed)await homeChange(kind,item,true);}catch{}finally{$(button).disabled=false;}};
$('#mealForm').onsubmit=e=>{e.preventDefault();const groups=mealGroups($('#mealInput').value);$('#mealResult').innerHTML=groups.map(g=>`<div>${g.found.length?'✓':'○'} ${esc(g.name)}: ${g.found.length?esc(g.found.join(', ')):'not recognized'}</div>`).join('')+'<p class="muted">Missing recognition is not proof an ingredient is absent. Use this as a planning checklist; adjust portions to your needs.</p>';};
$('#shareForm').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('.primary');button.disabled=true;try{await post('/api/google/share',{calendar:shareCalendar.id,email:$('#shareEmail').value,role:$('#shareRole').value});$('#shareDialog').close();toast('Google Calendar sharing updated');}catch(e){$('#shareError').textContent=e.message;}finally{button.disabled=false;}};
document.addEventListener('click',async e=>{
 const popover=$('.color-palette-popover');
 if(popover&&!e.target.closest('.color-palette-popover')&&!e.target.closest('[data-color-for]'))popover.remove();
 const b=e.target.closest('button,a');if(b?.hasAttribute('data-close')){b.closest('dialog').close();return;}
 if(b?.dataset.event){if(state.suppressClick){state.suppressClick=false;return;}openEvent(displayEvents().find(x=>x.id===b.dataset.event));return;}
 if(b?.dataset.day){state.date=parseDay(b.dataset.day);state.mini=new Date(state.date.getFullYear(),state.date.getMonth(),1);render();sync();return;}
 if(b?.dataset.share){shareCalendar=state.calendars.find(c=>c.id===b.dataset.share);$('#shareName').textContent=shareCalendar.name;$('#shareEmail').value=state.partner||settings.spouse||'';$('#shareRole').value='reader';$('#shareError').textContent='';$('#shareDialog').showModal();loadSharing();return;}
 if(b?.dataset.colorFor){const calId=b.dataset.colorFor;const existing=$('.color-palette-popover');const wasSame=existing&&existing.dataset.calId===calId;existing?.remove();if(wasSame)return;const pop=document.createElement('div');pop.className='color-palette-popover';pop.dataset.calId=calId;pop.innerHTML=calendarPalette.map((p,i)=>`<button type="button" class="palette-dot${safeColor((state.calendars.find(c=>c.id===calId)||localCalendar).backgroundColor)===p.bg?' selected':''}" data-pick-color="${i}" data-pick-cal="${esc(calId)}" style="background:${p.bg}" aria-label="Color ${i+1}" title="Select color"></button>`).join('');b.closest('.calendar-row').appendChild(pop);return;}
 if(b?.dataset.pickColor!=null){const calId=b.dataset.pickCal,pi=Number(b.dataset.pickColor);const saved=read(calColorKey,{});saved[calId]=pi;write(calColorKey,saved);$('.color-palette-popover')?.remove();if(calId==='local'){applyLocalColor();const localInState=state.calendars.find(c=>c.id==='local');if(localInState){localInState.backgroundColor=localCalendar.backgroundColor;localInState.foregroundColor=localCalendar.foregroundColor;}}else{state.calendars=colorizeCalendars(state.calendars.map(c=>({...c})));}renderCalendars();render();renderDashboard();syncSettingsToPocketBase();return;}
 if(b?.dataset.recipe){openRecipe(b.dataset.recipe);return;}
 if(b?.dataset.deleteItem||b?.dataset.editItem){const kind=b.dataset.kind,item=homeItems(kind).find(x=>x.id===(b.dataset.deleteItem||b.dataset.editItem));if(!item)return;if(b.dataset.deleteItem){try{await homeChange(kind,item,true);}catch{}}else{editingItem={...item,kind};$('#itemName').value=item.name;$('#itemDue').value=item.due||'';$('#itemQuantity').value=item.quantity||'';$('#taskFields').classList.toggle('hidden',kind!=='tasks');$('#inventoryFields').classList.toggle('hidden',!['pantry','groceries'].includes(kind));$('#itemAssignee').innerHTML='<option value="">Anyone</option>'+[...new Set([state.account,...state.members,settings.spouse].filter(Boolean))].map(email=>`<option value="${esc(email)}">${esc(person(email))}</option>`).join('');$('#itemAssignee').value=item.assignedTo||'';$('#itemPriority').value=item.priority||'normal';$('#itemRepeat').value=item.repeat||'none';$('#itemAmount').value=item.amount||'';$('#itemUnit').value=item.unit||'each';householdUI.prepareItem(item);$('#itemError').textContent='';$('#itemDialog').showModal();}return;}
 const day=e.target.closest('[data-new-day]');if(day){openEvent(null,day.dataset.newDay);return;}
 const timeline=e.target.closest('[data-time-day]');if(timeline){const min=Math.max(0,Math.min(1425,Math.floor((e.clientY-timeline.getBoundingClientRect().top)/15)*15));openEvent(null,timeline.dataset.timeDay,String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0'));}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('.color-palette-popover')?.remove();});
document.addEventListener('change',async e=>{if(e.target.dataset.calendar){const id=e.target.dataset.calendar;state.hidden=state.hidden.filter(x=>x!==id);if(!e.target.checked)state.hidden.push(id);write('hearth-hidden-calendars',state.hidden);render();renderDashboard();syncSettingsToPocketBase();}if(e.target.dataset.check){const kind=e.target.dataset.kind,item=homeItems(kind).find(x=>x.id===e.target.dataset.check);try{await completeItem(kind,item,e.target.checked);}catch(error){toast(error.message);}}});
$('#todayBtn').onclick=()=>{state.date=new Date();state.mini=new Date(state.date.getFullYear(),state.date.getMonth(),1);render();sync();};
$('#prevBtn').onclick=()=>navigate(-1);$('#nextBtn').onclick=()=>navigate(1);
$('#miniPrev').onclick=()=>{state.mini=new Date(state.mini.getFullYear(),state.mini.getMonth()-1,1);renderMini();};$('#miniNext').onclick=()=>{state.mini=new Date(state.mini.getFullYear(),state.mini.getMonth()+1,1);renderMini();};
$('#viewSelect').onchange=e=>{state.view=e.target.value;$('#calendarContent').scrollTop=0;render();if(['day','week'].includes(state.view))$('#calendarContent').scrollTop=420;sync();};
$('#searchInput').oninput=render;$('#createBtn').onclick=()=>openEvent();$('#allDay').onchange=toggleAllDay;$('#eventForm').onsubmit=saveEvent;$('#deleteBtn').onclick=deleteEvent;
$('#connectBtn').onclick=()=>state.connected?sync():location.assign('/auth/google');$('#signInBtn').onclick=()=>location.assign('/auth/google');
$('#disconnectBtn').onclick=async()=>{try{await post('/api/google/status',{},'DELETE');++syncSequence;state.connected=false;state.shared=false;state.account='device';state.verified=false;localStorage.removeItem('hearth-account-cache');restoreDeviceHome();state.events=[...state.localEvents];state.calendars=[localCalendar];$('#settingsDialog').close();await initConnection();toast('Disconnected. Pending Google changes stay bound to their original account.');}catch(e){toast(e.message);}};
$('#themeBtn').onclick=()=>{settings.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';theme();};$('#themeSelect').onchange=e=>{settings.theme=e.target.value;theme();};matchMedia('(prefers-color-scheme: dark)').addEventListener('change',theme);
$('#defaultView').onchange=e=>{settings.view=e.target.value;write('hearth-settings',settings);syncSettingsToPocketBase();};
$('#settingsBtn').onclick=$('#accountBtn').onclick=openSettings;
$('#menuBtn').onclick=()=>document.body.classList.toggle(matchMedia('(max-width:700px)').matches?'sidebar-open':'sidebar-closed');
document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,dialog')||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key.toLowerCase()==='t')$('#todayBtn').click();if(e.key.toLowerCase()==='c')openEvent();});
setInterval(()=>{if(!document.hidden&&state.connected&&!state.loading&&!state.mutating&&!$('dialog[open]'))sync();},60000);
setInterval(()=>{if(!document.hidden&&state.app!=='calendar'&&state.shared)loadHome();},15000);
$('#itemForm').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('.primary');button.disabled=true;try{const item={...editingItem,name:$('#itemName').value.trim(),due:$('#itemDue').value,quantity:$('#itemQuantity').value,assignedTo:$('#itemAssignee').value,priority:$('#itemPriority').value,repeat:$('#itemRepeat').value,amount:Number($('#itemAmount').value)||0,unit:$('#itemUnit').value,...householdUI.itemFields()};if(item.kind==='tasks'&&item.repeat!=='none'&&!item.due)throw Error('Add a due date for a recurring chore.');if(item.kind==='tasks'&&item.due!==editingItem.due)item.scheduledDue=editingItem.scheduledDue||editingItem.due;if(item.repeat!==editingItem.repeat){item.scheduledDue=item.due;item.seriesAnchor=item.due;}await homeChange(item.kind,item);$('#itemDialog').close();}catch(error){$('#itemError').textContent=error.message;}finally{button.disabled=false;}};

const oauthResult=new URLSearchParams(location.search).get('sync');if(oauthResult){history.replaceState({},'',location.pathname);if(oauthResult!=='connected')toast('Google connection: '+oauthResult.replaceAll('-',' '));}
// Planning, account-bound offline writes, and delayed deletion.
function person(email){return email==='device'?'Me (this device)':email===state.account?'Me':email===state.partner?'Spouse':email;}
function cacheAccount(){if(state.connected&&state.account!=='device')write('hearth-account-cache',{account:state.account,calendars:state.calendars,events:state.events,home:state.home,shared:state.shared,members:state.members,partner:state.partner,lastCalendarSync:state.lastCalendarSync,lastHomeSync:state.lastHomeSync});}
function enqueue(op){const row=outbox.add(op);state.lastError='';renderSyncDetails();return row;}
function applyLocalEvent(item,remove=false){
 if(item.localParentId){state.events=state.events.map(e=>e.id===item.localParentId?{...e,excludedDates:[...new Set([...(e.excludedDates||[]),item.occurrenceDate])]}:e);}
 state.events=state.events.filter(e=>e.id!==item.id);if(!remove)state.events.push(item);saveLocal();
 if(pb.isAuthenticated()&&!item.googleCalendarId)syncPocketBaseEvent(item,remove);
}
async function persistEvent(item,before){
 const waiting=outbox.forAccount(state.account).find(op=>op.type==='event'&&op.action==='upsert'&&op.item.id===item.id);
 if(waiting){if(waiting.status==='sending')throw Error('This event is being sent. Try again shortly.');waiting.item={...waiting.item,...item,pending:undefined};waiting.status='pending';waiting.error='';outbox.persist();toast('Pending change updated');return;}
 const data={...item,clientEventId:item.clientEventId||crypto.randomUUID().replaceAll('-',''),account:state.account};
 if(!state.connected){applyLocalEvent(data);toast('Saved on this device');return;}
 try{if(!navigator.onLine||!state.verified)throw new TypeError('Offline');const result=await post('/api/google/events',data);const saved=normalizeEvent(result.event);state.events=state.events.filter(e=>e.id!==before?.id&&e.id!==saved.id);state.events.push(saved);cacheAccount();toast('Saved to Google Calendar');if(data.repeat&&data.repeat!=='none')setTimeout(sync,0);}
 catch(e){if(e.status&&e.status<500&&e.status!==429)throw e;enqueue({type:'event',action:'upsert',item:data,before,account:state.account});toast('Saved offline · waiting to sync');render();}
}
function deferDelete(op){const row=enqueue({...op,action:'delete',notBefore:Date.now()+10000});$('#undoBar span').textContent='Removed “'+(op.item.title||op.item.name)+'” · undo before it syncs';$('#undoBar').classList.remove('hidden');$('#undoDelete').dataset.id=row.id;setTimeout(()=>{flushQueue();renderSyncDetails();},10100);}
function rebasePending(items){let changed=false;for(const op of outbox.forAccount(state.account).filter(o=>o.type==='batch')){for(const expected of op.expected){const saved=items.find(i=>i.id===expected.id);if(saved){expected.updated_at=saved.updated_at;changed=true;}}}if(changed)outbox.persist();}
async function flushQueue(){
 if(state.flushing||state.mutating)return;state.flushing=true;
 try{
  await outbox.flush('device',async op=>{if(op.type==='event'){applyLocalEvent(op.item,op.action==='delete');}else{const next=applyChanges(read('hearth-home',{}),[{item:op.item,remove:op.action==='delete'}]);localStorage.setItem('hearth-home',JSON.stringify(next));if(!state.shared)state.home=next;}},()=>{render();renderHome();});
  if(!navigator.onLine||!state.connected)return;
  if(!outbox.forAccount(state.account).length)return;
  const identity=await api('/api/google/status');if(!identity.connected||identity.account&&identity.account!==state.account){state.lastError='Reconnect the account that owns these pending changes.';return;}state.verified=true;
  await outbox.flush(state.account,async op=>{
   if(op.type==='batch')return post('/api/household/batch',{operationId:op.id,account:op.account,changes:op.changes,expected:op.expected});
   if(op.type==='event'){if(op.action==='delete')return post('/api/google/events/'+encodeURIComponent(op.item.googleEventId)+'?calendar='+encodeURIComponent(op.item.googleCalendarId),{etag:op.item.etag,account:op.account},'DELETE');return post('/api/google/events',{...op.item,account:op.account});}
   return post('/api/household',{...op.item,account:op.account},op.action==='delete'?'DELETE':'POST');
  },async(op,result)=>{
   if(state.account!==op.account)return;
   if(op.type==='event'){state.events=state.events.filter(e=>e.id!==op.item.id&&e.id!==op.before?.id);if(result?.event)state.events.push(normalizeEvent(result.event));}
   else if(op.type==='batch'){const actual=op.changes.map(c=>({...c,item:result?.items?.find(i=>i.id===c.item.id)||c.item}));state.home=applyChanges(state.home,actual);}else{state.home[op.item.kind]=(state.home[op.item.kind]||[]).filter(x=>x.id!==op.item.id);if(op.action!=='delete')state.home[op.item.kind].push(result?.items?.[0]||op.item);}
   rebasePending(result?.items||[]);cacheAccount();render();renderHome();
  });
 }catch(e){state.lastError=e.message;}finally{state.flushing=false;renderSyncDetails();}
}
function renderSyncDetails(){
 const relevant=outbox.rows.filter(o=>o.account==='device'||o.account===state.account),other=outbox.rows.length-relevant.length;
 if(!$('#syncDetails'))return;
 $('#syncDetails').innerHTML='<p>Network: '+(navigator.onLine?'online':'offline')+'</p><p>Calendar: '+(state.lastCalendarSync?esc(new Date(state.lastCalendarSync).toLocaleString()):'not synced this visit')+'</p><p>Household: '+(state.lastHomeSync?esc(new Date(state.lastHomeSync).toLocaleString()):state.shared?'not synced this visit':'device-only mode')+'</p>'+ (state.lastError?'<p class="error">'+esc(state.lastError)+'</p>':'')+relevant.map(op=>`<div class="queue-row"><strong>${esc(op.item.title||op.item.name)}</strong><p>${esc(op.action+' · '+op.status+(op.error?' · '+op.error:''))}</p>${op.status!=='sending'?`<button class="button" data-discard="${op.id}">${op.action==='delete'?'Undo deletion':'Discard pending edit'}</button>`:''}</div>`).join('')+(!relevant.length?'<p>No pending changes.</p>':'')+(other?'<p>Changes for another account remain safely queued. Sign in to that account to manage them.</p>':'');
 const undo=outbox.rows.find(o=>o.id===$('#undoDelete').dataset.id);$('#undoBar').classList.toggle('hidden',!undo||undo.status==='sending');
 if($('#syncDetailsButton'))$('#syncDetailsButton').textContent='Sync details'+(relevant.length?' ('+relevant.length+' pending)':'');
}
function renderDashboard(){householdUI.dashboard();}
function renderMealWeek(){householdUI.renderWeek();}
function openRecipe(...args){householdUI.openRecipe(...args);}
function renderRecipe(){householdUI.renderRecipe();}
async function addShoppingFor(...args){return householdUI.shopping(...args);}
async function completeItem(...args){return householdUI.complete(...args);}
function decorateTimedEvents(){for(const el of $$('.timed-event')){const event=displayEvents().find(e=>e.id===el.dataset.event);if(event&&!event.pending&&['owner','writer'].includes(calendarFor(event).accessRole)&&(!event.eventType||event.eventType==='default')){el.classList.add('draggable-event');el.insertAdjacentHTML('beforeend','<span class="resize-handle" title="Drag to change end time" aria-hidden="true"></span>');}}}

// Sync inspection and a ten-second undo window for deletion.
$('.sync-card').insertAdjacentHTML('beforeend','<button class="text-button" id="syncDetailsButton">Sync details</button>');
$('#settingsDialog').insertAdjacentHTML('beforeend','<label>Spouse Google email<input id="spouseSetting" type="email" placeholder="your-spouse@gmail.com"></label><p class="muted">Used by your calendar sharing switch. Household membership is verified by the server configuration.</p>');
$('#spouseSetting').value=settings.spouse||state.partner||'';
$('#spouseSetting').onchange=e=>{if(e.target.validity.valid){settings.spouse=e.target.value.trim().toLowerCase();write('hearth-settings',settings);syncSettingsToPocketBase();}};
$('#syncDetailsButton').onclick=()=>{renderSyncDetails();$('#syncDialog').showModal();};
$('#retryQueue').onclick=async()=>{for(const op of outbox.rows.filter(o=>[state.account,'device'].includes(o.account))){if(op.status==='failed'&&(op.type==='batch'||op.error?.includes('changed in Google')))continue;op.status='pending';op.error='';}outbox.persist();await flushQueue();};
$('#refreshAll').onclick=async()=>{await sync();await loadHome();renderSyncDetails();};
$('#undoDelete').onclick=()=>undoOperation($('#undoDelete').dataset.id);
function undoOperation(id){const op=outbox.rows.find(x=>x.id===id);if(!op||op.status==='sending')return toast('This change is already being sent.');outbox.remove(id);render();renderHome();if(pb.isAuthenticated()&&op.action==='delete'){if(op.type==='event')syncPocketBaseEvent(op.item,false);else if(op.type==='home')syncPocketBaseItem(op.item,false);}toast(op.action==='delete'?'Deletion undone':'Pending change discarded');}
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.discard){undoOperation(b.dataset.discard);return;}
 if(b.dataset.planDay){state.planDay=b.dataset.planDay;householdUI.openPicker(state.planDay);return;}
  if(b.dataset.plannedMeal){
   const meal=homeItems('meals').find(m=>m.id===b.dataset.plannedMeal);
   if(meal){
    householdUI.openMeal(meal);
   }
   return;
  }
  if(b.dataset.stock){householdUI.transfer([homeItems('groceries').find(g=>g.id===b.dataset.stock)]);return;}
  if(b.dataset.revoke){if(!confirm('Remove access for '+b.dataset.revoke+'?'))return;try{await post('/api/google/share',{calendar:shareCalendar.id,email:b.dataset.revoke,role:'none'});await loadSharing();}catch(error){$('#shareError').textContent=error.message;}}
 });
$('#spouseShare').onchange=async e=>{const email=state.partner||settings.spouse;if(!email)return;e.target.disabled=true;try{await post('/api/google/share',{calendar:shareCalendar.id,email,role:e.target.checked?'reader':'none'});await loadSharing();}catch(error){e.target.checked=!e.target.checked;$('#shareError').textContent=error.message;e.target.disabled=false;}};
$('#mealWeekPrev').onclick=()=>{state.mealWeek=addDays(state.mealWeek,-7);renderMealWeek();};$('#mealWeekNext').onclick=()=>{state.mealWeek=addDays(state.mealWeek,7);renderMealWeek();};

let editingCustomRecipeId=null;
function addIngredientRow(amount='',unit='each',name=''){
 const div=document.createElement('div');div.className='ingredient-row';
 div.innerHTML=`<input type="number" class="ing-amount" aria-label="Ingredient amount" min="0.01" max="10000" step="any" placeholder="Amt" value="${esc(String(amount))}" required><select class="ing-unit" aria-label="Ingredient unit">${['each','cup','tbsp','tsp','g','oz','can','clove','fillet','pinch'].map(u=>`<option value="${u}" ${u===unit?'selected':''}>${u}</option>`).join('')}</select><input type="text" class="ing-name" aria-label="Ingredient name" placeholder="Ingredient (e.g. olive oil)" maxlength="100" value="${esc(name)}" required><button type="button" class="icon remove-ing-btn" aria-label="Remove ingredient">×</button>`;
 div.querySelector('.remove-ing-btn').onclick=()=>{
  if($('#customRecipeIngredientsList').children.length>1)div.remove();
  else toast('A recipe needs at least one ingredient.');
 };
 $('#customRecipeIngredientsList').appendChild(div);
}
function openCustomRecipeModal(recipe=null){
 editingCustomRecipeId=recipe?.id||null;
 $('#customRecipeHeading').textContent=recipe?'Edit recipe':'Add your own recipe';
 $('#customRecipeName').value=recipe?.name||'';
 $('#customRecipeMinutes').value=recipe?.minutes||30;
 $('#customRecipeServings').value=recipe?.servings||2;
 $('#customRecipeSteps').value=recipe?.steps?recipe.steps.join('\n'):'';
 $('#customRecipeError').textContent='';
 $('#customRecipeIngredientsList').innerHTML='';
 if(recipe?.portions?.length){
  for(const p of recipe.portions)addIngredientRow(p.amount,p.unit,p.name);
 } else {
  addIngredientRow(1,'each','');
  addIngredientRow(1,'cup','');
 }
 $('#customRecipeDialog').showModal();
}
$('#addRecipeBtn').onclick=()=>openCustomRecipeModal();
$('#addIngredientRowBtn').onclick=()=>addIngredientRow(1,'each','');
$('#customRecipeForm').onsubmit=async e=>{
 e.preventDefault();$('#customRecipeError').textContent='';
 const portions=[];
 for(const row of $$('#customRecipeIngredientsList .ingredient-row')){
  const amount=Number(row.querySelector('.ing-amount').value);
  const unit=row.querySelector('.ing-unit').value;
  const name=row.querySelector('.ing-name').value.trim();
  if(name&&amount>0)portions.push({name,amount,unit});
 }
 try{
  const recipeData={
   id:editingCustomRecipeId||crypto.randomUUID(),
   name:$('#customRecipeName').value.trim(),
   minutes:$('#customRecipeMinutes').value,
   servings:$('#customRecipeServings').value,
   portions,
   steps:$('#customRecipeSteps').value
  };
  const normalized=normalizeCustomRecipe(recipeData);$('#saveCustomRecipeBtn').disabled=true;
  await homeChange('recipes',normalized);
  $('#customRecipeDialog').close();
  renderHome();
  toast(editingCustomRecipeId?'Recipe updated':'Recipe added');
 }catch(err){
  $('#customRecipeError').textContent=err.message;
 }finally{$('#saveCustomRecipeBtn').disabled=false;}
};
// Drag uses the same minute/pixel coordinates as the grid, snapped to 15 minutes.
document.addEventListener('pointerdown',e=>{
 const block=e.target.closest('.draggable-event');if(!block||e.button!==0)return;
 const event=displayEvents().find(item=>item.id===block.dataset.event);if(!event)return;
 const startX=e.clientX,startY=e.clientY,resize=e.target.classList.contains('resize-handle');let moved=false;
 const move=ev=>{if(Math.abs(ev.clientY-startY)+Math.abs(ev.clientX-startX)<6&&!moved)return;moved=true;block.style.opacity='.6';block.style.pointerEvents='none';if(!resize)block.style.transform='translate('+ (ev.clientX-startX)+'px,'+(ev.clientY-startY)+'px)';else block.style.height=Math.max(15,Number.parseFloat(block.style.height)+ev.clientY-(block._lastY??startY))+'px';block._lastY=ev.clientY;};
 const up=async ev=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);if(!moved)return;
  state.suppressClick=true;setTimeout(()=>state.suppressClick=false,150);
  const column=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.time-day');if(!column){render();return;}
  const y=ev.clientY-column.getBoundingClientRect().top;
  const minutes=resize?Math.round(y/15)*15:Math.round((Number(event.time.slice(0,2))*60+Number(event.time.slice(3,5))+ev.clientY-startY)/15)*15;
  const data=shiftedEvent(event,column.dataset.timeDay,Math.max(0,Math.min(resize?1440:1425,minutes)),resize);
  render();if(!data)return toast('End must be after start.');
  const conflict=displayEvents().some(other=>other.id!==event.id&&overlaps(other,data));if(conflict&&!confirm('This overlaps another event. Save the new time?'))return;
  state.mutating=true;try{await persistEvent(data,event);render();renderDashboard();}catch(error){toast(error.message);}finally{state.mutating=false;}
 };
 const cancel=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);render();};
 document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);
});
window.addEventListener('online',async()=>{await initConnection();await flushQueue();});
window.addEventListener('offline',()=>{state.verified=false;renderSyncDetails();toast('Offline · your changes will wait to sync');});
setInterval(()=>{if(!state.loading&&!state.mutating)flushQueue();},15000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
async function loadSharing(){
 $('#spouseShare').disabled=true;$('#spouseStatus').textContent='Loading sharing status…';$('#sharingRules').innerHTML='';
 try{const result=await api('/api/google/share?calendar='+encodeURIComponent(shareCalendar.id));state.sharingRules=result.rules;const spouse=state.partner||settings.spouse;$('#spouseShare').checked=result.rules.some(r=>r.email.toLowerCase()===spouse?.toLowerCase()&&r.role!=='none');$('#spouseShare').disabled=!spouse;$('#spouseStatus').textContent=spouse?'Spouse: '+spouse:'Set your spouse email in Settings to enable one-click sharing.';$('#sharingRules').innerHTML=result.rules.map(r=>`<p>${esc(r.email)} · ${esc(r.role)} <button class="text-button" data-revoke="${esc(r.email)}">Revoke</button></p>`).join('')||'<p class="muted">Not shared with anyone.</p>';}
 catch(e){$('#shareError').textContent=e.message;$('#spouseStatus').textContent='Sharing status unavailable';}
}

$('#pbSignInBtn').onclick=async()=>{
 const url=$('#pbUrlInput').value.trim();
 const email=$('#pbEmailInput').value.trim();
 const password=$('#pbPasswordInput').value;
 $('#pbError').textContent='';
 if(!url)return $('#pbError').textContent='Please enter your PocketBase server URL.';
 if(!email||!password)return $('#pbError').textContent='Please enter your email and password.';
 $('#pbSignInBtn').disabled=true;
 try{
  pb.setUrl(url);
  await pb.login(email,password);
  $('#pbPasswordInput').value='';
  updatePocketBaseUI();
  setupPocketBaseSubscriptions();
  await loadPocketBaseData();
  toast('Connected to PocketBase');
 }catch(err){
  const msg=err?.message||'';
  $('#pbError').textContent=(msg.includes('Failed to fetch')||msg.includes('NetworkError'))
    ?'Could not reach server. Verify your PocketBase URL (e.g. https://ebook.krugcloud.com).'
    :(msg||'Failed to sign in to PocketBase.');
 }finally{$('#pbSignInBtn').disabled=false;}
};

$('#pbSignUpBtn').onclick=async()=>{
 const url=$('#pbUrlInput').value.trim();
 const email=$('#pbEmailInput').value.trim();
 const password=$('#pbPasswordInput').value;
 $('#pbError').textContent='';
 if(!url)return $('#pbError').textContent='Please enter your PocketBase server URL.';
 if(!email||!password)return $('#pbError').textContent='Please enter an email and password to create an account.';
 if(password.length<8)return $('#pbError').textContent='Password must be at least 8 characters.';
 $('#pbSignUpBtn').disabled=true;
 try{
  pb.setUrl(url);
  await pb.register(email,password);
  $('#pbPasswordInput').value='';
  updatePocketBaseUI();
  setupPocketBaseSubscriptions();
  await loadPocketBaseData();
  toast('PocketBase account created & connected');
 }catch(err){
  const msg=err?.message||'';
  $('#pbError').textContent=(msg.includes('Failed to fetch')||msg.includes('NetworkError'))
    ?'Could not reach server. Verify your PocketBase URL (e.g. https://ebook.krugcloud.com).'
    :(msg||'Failed to register with PocketBase.');
 }finally{$('#pbSignUpBtn').disabled=false;}
};

$('#pbDisconnectBtn').onclick=()=>{
 pb.logout();
 localStorage.removeItem('hearth-guest');
 sessionStorage.removeItem('hearth-guest');
 updatePocketBaseUI();
 toast('Disconnected from PocketBase');
 showAuthOverlay();
};

$('#pbUploadDataBtn').onclick=async()=>{
 $('#pbUploadDataBtn').disabled=true;
 try{
  toast('Uploading device data to PocketBase…');
  await uploadDeviceDataToPocketBase();
  toast('Device data uploaded to PocketBase');
 }catch(err){
  toast('Failed to upload data: '+err.message);
 }finally{$('#pbUploadDataBtn').disabled=false;}
};

let authMode='signin';

function showAuthOverlay(){
 const overlay=$('#authOverlay');
 if(!overlay)return;
 overlay.classList.remove('hidden');
 const emailInput=$('#authEmail'),passInput=$('#authPassword'),errorText=$('#authError'),urlInput=$('#authServerUrl');
 if(emailInput)emailInput.value=pb.user()?.email||'';
 if(passInput)passInput.value='';
 if(errorText)errorText.textContent='';
 if(urlInput)urlInput.value=pb.getUrl();
 setAuthMode('signin');
 requestAnimationFrame(()=>emailInput?.focus());
}

function hideAuthOverlay(){
 const overlay=$('#authOverlay');
 if(overlay)overlay.classList.add('hidden');
}

function setAuthMode(mode){
 authMode=mode;
 const title=$('#authTitle'),sub=$('#authSubtitle'),submit=$('#authSubmitBtn'),toggle=$('#authToggleBtn');
 if(authMode==='signup'){
  if(title)title.textContent='Create your account';
  if(sub)sub.textContent='Create an account to automatically sync your Hearth data across all your devices.';
  if(submit)submit.textContent='Create Account';
  if(toggle)toggle.textContent='Already have an account? Sign in';
 }else{
  if(title)title.textContent='Sign in to continue';
  if(sub)sub.textContent='Use your account to sync your calendar, meals, recipes, and lists across all your devices.';
  if(submit)submit.textContent='Sign In';
  if(toggle)toggle.textContent='Need an account? Create one';
 }
}

const authToggleBtn=$('#authToggleBtn');
if(authToggleBtn)authToggleBtn.onclick=()=>{
 setAuthMode(authMode==='signin'?'signup':'signin');
 const err=$('#authError');if(err)err.textContent='';
};

const authGuestBtn=$('#authGuestBtn');
if(authGuestBtn)authGuestBtn.onclick=()=>{
 localStorage.setItem('hearth-guest','1');
 sessionStorage.setItem('hearth-guest','1');
 hideAuthOverlay();
 toast('Using Hearth locally on this device');
};

const authCard=$('#authCard');
if(authCard)authCard.onsubmit=async(e)=>{
 e.preventDefault();
 const email=$('#authEmail').value.trim();
 const password=$('#authPassword').value;
 const serverUrl=($('#authServerUrl')?.value.trim())||'https://ebook.krugcloud.com';
 const errEl=$('#authError');
 if(errEl)errEl.textContent='';
 if(!email||!password){
  if(errEl)errEl.textContent='Please enter both email and password.';
  return;
 }
 if(authMode==='signup'&&password.length<8){
  if(errEl)errEl.textContent='Password must be at least 8 characters.';
  return;
 }
 const submitBtn=$('#authSubmitBtn');
 if(submitBtn){
  submitBtn.disabled=true;
  submitBtn.textContent=authMode==='signup'?'Creating account…':'Signing in…';
 }
 try{
  pb.setUrl(serverUrl);
  if(authMode==='signup'){
   await pb.register(email,password);
   toast('Account created & connected!');
  }else{
   await pb.login(email,password);
   toast('Connected to PocketBase');
  }
  localStorage.removeItem('hearth-guest');
  sessionStorage.removeItem('hearth-guest');
  hideAuthOverlay();
  updatePocketBaseUI();
  setupPocketBaseSubscriptions();
  await loadPocketBaseData();
 }catch(err){
  const msg=err?.message||'';
  if(errEl){
   errEl.textContent=(msg.includes('Failed to fetch')||msg.includes('NetworkError'))
     ?'Could not reach server. Verify your PocketBase URL (e.g. https://ebook.krugcloud.com).'
     :(msg||'Authentication failed. Check your credentials.');
  }
 }finally{
  if(submitBtn){
   submitBtn.disabled=false;
   submitBtn.textContent=authMode==='signup'?'Create Account':'Sign In';
  }
 }
};

const pbAccountBtn=$('#pbAccountBtn');
if(pbAccountBtn)pbAccountBtn.onclick=()=>{
 if(pb.isAuthenticated()){
  const user=pb.user();
  const email=user?.email||'PocketBase';
  if(confirm(`Signed in as ${email}.\n\nDo you want to sign out?`)){
   pb.logout();
   localStorage.removeItem('hearth-guest');
   sessionStorage.removeItem('hearth-guest');
   updatePocketBaseUI();
   toast('Signed out');
   showAuthOverlay();
  }
 }else{
  showAuthOverlay();
 }
};

let householdUI=installHousehold({state,settings,read,write,homeItems,homeChange,allRecipes,outbox,post,enqueue,flushQueue,cacheAccount,loadHome,toast,person,chip,displayEvents,openCustomRecipeModal,openEvent,sync,renderCalendar:render,syncSettingsToPocketBase,syncPocketBaseBatch});
await householdUI.migrateLocal();
householdUI.navigate(state.app,false);theme();render();renderHome();initConnection();
updatePocketBaseUI();
if(pb.isAuthenticated()){
 setupPocketBaseSubscriptions();
 loadPocketBaseData();
}else if(!localStorage.getItem('hearth-guest')&&!sessionStorage.getItem('hearth-guest')){
 showAuthOverlay();
}
