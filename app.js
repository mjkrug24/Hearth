import {dateKey,parseDay,addDays,clock,escapeHTML as esc,safeColor,normalizeEvent,occursOn,layoutEvents,monthDates} from './calendar-model.js';
import {recipes,matches,mealGroups} from './recipes.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{toast('Device storage is full or unavailable.');}};
const localCalendar={id:'local',name:'On this device',backgroundColor:'#1967d2',foregroundColor:'#ffffff',accessRole:'owner'};
const settings=read('hearth-settings',{theme:read('hearth-dark-mode',false)?'dark':'system',view:'month'});
const state={date:new Date(),mini:new Date(new Date().getFullYear(),new Date().getMonth(),1),view:settings.view||'month',app:'calendar',connected:false,configured:false,loading:false,mutating:false,events:[],calendars:[localCalendar],hidden:read('hearth-hidden-calendars',[]),editing:null,home:read('hearth-home',{tasks:[],groceries:[]}),shared:false,homeReady:false};
// Old synced data is never reused across Google accounts or uploaded on connection.
state.localEvents=read('hearth-events',[]).filter(e=>!e.googleEventId).map(e=>normalizeEvent({...e,calendar:'local',googleCalendarId:null}));
state.events=[...state.localEvents];
for(const kind of ['tasks','groceries']) state.home[kind]=(state.home[kind]||[]).map(item=>({...item,id:item.id||crypto.randomUUID(),kind}));
const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
const monthTitle=d=>d.toLocaleDateString(undefined,{month:'long',year:'numeric'});
const shortDate=d=>d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
const timeLabel=t=>{const [h,m]=t.split(':').map(Number);return (h%12||12)+(m?':'+String(m).padStart(2,'0'):'')+(h<12?' AM':' PM');};
let toastTimer,syncSequence=0,shareCalendar=null,activeRecipe=null;
function toast(message){$('#toast').textContent=message;$('#toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),6000);}
async function api(url,options={}){const r=await fetch(url,{cache:'no-store',credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});const data=r.status===204?null:await r.json().catch(()=>({error:'The service returned an unexpected response.'}));if(!r.ok){const error=new Error(data?.error||'Request failed');error.status=r.status;throw error;}return data;}
const post=(url,body,method='POST')=>api(url,{method,body:JSON.stringify(body)});
function notice(message=''){$('#calendarNotice').textContent=message;$('#calendarNotice').classList.toggle('hidden',!message);}
function calendarFor(e){return state.calendars.find(c=>c.id===(e.googleCalendarId||'local'))||localCalendar;}
function paint(e){const c=calendarFor(e);return `background:${safeColor(c.backgroundColor)};color:${safeColor(c.foregroundColor)}`;}
function events(){const q=$('#searchInput').value.trim().toLowerCase();return state.events.filter(e=>!state.hidden.includes(e.googleCalendarId||'local')&&(!q||[e.title,e.notes,e.location].some(s=>(s||'').toLowerCase().includes(q))));}
function saveLocal(){state.localEvents=state.events.filter(e=>!e.googleEventId);write('hearth-events',state.localEvents);}
function syncRange(){let start=new Date(state.date.getFullYear(),state.date.getMonth(),1),end=new Date(state.date.getFullYear(),state.date.getMonth()+1,1);if(state.view==='schedule'){start=parseDay(dateKey(new Date()));end=addDays(start,180);}else{start=addDays(start,-7);end=addDays(end,7);}return {from:start.toISOString(),to:end.toISOString()};}
async function sync(){
  if(!state.connected||state.mutating)return;
  const sequence=++syncSequence;state.loading=true;$('#connectBtn').disabled=true;$('#syncStatus').textContent='Syncing…';notice();
  try{const remote=await api('/api/google/events?'+new URLSearchParams(syncRange()));if(sequence!==syncSequence)return;
    state.calendars=remote.calendars;state.events=remote.events.map(normalizeEvent);
    $('#syncStatus').textContent='Synced at '+new Date().toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
    if(remote.warnings?.length)notice(remote.warnings.join(' '));render();
  }catch(e){if(sequence!==syncSequence)return;$('#syncStatus').textContent='Sync failed — retry';notice(e.message);if(e.status===401){state.connected=false;$('#connectBtn').textContent='Reconnect';}}
  finally{if(sequence===syncSequence){state.loading=false;$('#connectBtn').disabled=false;}}
}
async function initConnection(){
  try{const s=await api('/api/google/status');state.connected=s.connected;state.configured=s.configured;$('#connectBtn').textContent=s.connected?'Sync now':'Connect Google';$('#syncStatus').textContent=s.connected?'Connected':s.configured?'Sign in to see your calendars':'Google connection needs setup';if(s.connected){state.events=[];await sync();}}
  catch{$('#syncStatus').textContent='Offline · local calendar';}
  await loadHome();render();
}
function renderCalendars(){
  const groups=state.connected?[['My calendars',state.calendars.filter(c=>c.accessRole==='owner')],['Other calendars',state.calendars.filter(c=>c.accessRole!=='owner')]]:[['Local calendar',[localCalendar]]];
  $('#calendarLists').innerHTML=groups.map(([name,list])=>`<section class="calendar-group"><h3>${name}</h3>${list.map(c=>`<div class="calendar-row"><label title="${esc(c.name)}"><input type="checkbox" data-calendar="${esc(c.id)}" style="accent-color:${safeColor(c.backgroundColor)}" ${state.hidden.includes(c.id)?'':'checked'}><span>${esc(c.name)}</span></label>${state.connected&&c.accessRole==='owner'?`<button class="icon" data-share="${esc(c.id)}" aria-label="Share ${esc(c.name)}">↗</button>`:''}</div>`).join('')||'<p class="muted">No calendars in this group.</p>'}</section>`).join('');
}
function renderMini(){const first=state.mini,start=addDays(first,-first.getDay());$('#miniTitle').textContent=monthTitle(first);$('#miniGrid').innerHTML=['S','M','T','W','T','F','S'].map(x=>`<span>${x}</span>`).join('')+Array.from({length:42},(_,i)=>{const d=addDays(start,i);return `<button data-day="${dateKey(d)}" class="${d.getMonth()!==first.getMonth()?'dim ':''}${dateKey(d)===dateKey(state.date)?'selected':''}" aria-label="${esc(d.toDateString())}">${d.getDate()}</button>`;}).join('');}
function chip(e){return `<button class="event-chip" data-event="${esc(e.id)}" style="${paint(e)}" title="${esc(e.title)}">${e.allDay?'':esc(timeLabel(e.time))+' '}${esc(e.title)}</button>`;}
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
  $('#createBtn').disabled=state.connected&&!state.calendars.some(c=>['owner','writer'].includes(c.accessRole));
}
function navigate(delta){if(state.view==='month'){state.date=new Date(state.date.getFullYear(),state.date.getMonth()+delta,1);}else state.date=addDays(state.date,delta*(state.view==='week'?7:1));state.mini=new Date(state.date.getFullYear(),state.date.getMonth(),1);render();sync();}
function toggleAllDay(){for(const el of $$('.time-field'))el.classList.toggle('hidden',$('#allDay').checked);$('#eventTime').required=$('#eventEnd').required=!$('#allDay').checked;}
function openEvent(e=null,day=dateKey(state.date),time='10:00'){
 if(state.loading||state.mutating)return toast('Wait for the current calendar operation to finish.');
 state.editing=e;$('#eventForm').reset();$('#eventError').textContent='';
 const writable=state.calendars.filter(c=>['owner','writer'].includes(c.accessRole)),c=e?calendarFor(e):writable.find(x=>x.primary)||writable[0];
 if(!c)return toast('No writable calendar is available.');
 const readOnly=!!e&&(!['owner','writer'].includes(c.accessRole)||e.eventType&&e.eventType!=='default');
 const end=new Date(day+'T'+time);end.setHours(end.getHours()+1);
 $('#eventHeading').textContent=readOnly?'Event details':e?'Edit event':'New event';$('#eventTitle').value=e?.title||'';$('#eventDate').value=e?.date||day;$('#eventTime').value=e?.time||time;$('#eventEnd').value=e?.end||clock(end);$('#allDay').checked=e?.allDay||false;
 $('#eventEndDate').value=e?(e.allDay?dateKey(addDays(parseDay(e.endDate),-1)):e.endDate):dateKey(end);
 $('#eventCalendar').innerHTML=(e?[c]:writable).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');$('#eventCalendar').value=c.id;
 $('#eventLocation').value=e?.location||'';$('#eventNotes').value=e?.notes||'';$('#eventReminder').value=e?.reminder||'default';$('#eventTimezone').textContent='Times shown in '+zone;
 $('#eventInfo').textContent=readOnly?'This event is read-only here. Open it in Google for more options.':e?.recurringEventId?'Changes apply to this occurrence only. Manage the full series in Google Calendar.':e?'The event stays on its original calendar.':'All-day end dates include the selected last day.';
 for(const input of $$('#eventForm input, #eventForm textarea, #eventForm select'))input.disabled=readOnly;
 $('#eventCalendar').disabled=!!e||readOnly;$('#deleteBtn').classList.toggle('hidden',!e||readOnly);$('#saveEventBtn').classList.toggle('hidden',readOnly);
 $('#googleEventLink').classList.toggle('hidden',!e?.htmlLink);$('#googleEventLink').href=e?.htmlLink?.startsWith('https://')?e.htmlLink:'#';
 toggleAllDay();$('#eventDialog').showModal();$('#eventTitle').focus();
}
async function saveEvent(ev){
 ev.preventDefault();const old=state.editing,allDay=$('#allDay').checked;
 const data={...old,id:old?.id||crypto.randomUUID(),title:$('#eventTitle').value.trim(),date:$('#eventDate').value,endDate:$('#eventEndDate').value,time:$('#eventTime').value,end:$('#eventEnd').value,allDay,location:$('#eventLocation').value,notes:$('#eventNotes').value,reminder:$('#eventReminder').value,googleCalendarId:state.connected?$('#eventCalendar').value:null};
 if(!data.title)return;
 if(allDay){if(data.endDate<data.date){$('#eventError').textContent='End date must be on or after start date.';return;}data.endDate=dateKey(addDays(parseDay(data.endDate),1));}
 else{const a=new Date(data.date+'T'+data.time),b=new Date(data.endDate+'T'+data.end);if(!(b>a)){$('#eventError').textContent='End must be after start. Use the next date for overnight events.';return;}data.startDateTime=a.toISOString();data.endDateTime=b.toISOString();}
 state.mutating=true;$('#saveEventBtn').disabled=true;$('#deleteBtn').disabled=true;++syncSequence;state.loading=false;
 try{if(state.connected){const result=await post('/api/google/events',data);const saved=normalizeEvent(result.event);state.events=state.events.filter(e=>e.id!==old?.id&&e.id!==saved.id);state.events.push(saved);}else{state.events=state.events.filter(e=>e.id!==data.id);state.events.push(data);saveLocal();}$('#eventDialog').close();render();toast(state.connected?'Saved to Google Calendar':'Saved on this device');}
 catch(error){$('#eventError').textContent=error.message;}
 finally{state.mutating=false;$('#saveEventBtn').disabled=false;$('#deleteBtn').disabled=false;$('#connectBtn').disabled=false;}
}
async function deleteEvent(){
 const e=state.editing;if(!e||!confirm('Delete “'+e.title+'”'+(e.recurringEventId?' (this occurrence only)':'')+'?'))return;
 state.mutating=true;$('#deleteBtn').disabled=true;
 try{if(e.googleEventId)await post('/api/google/events/'+encodeURIComponent(e.googleEventId)+'?calendar='+encodeURIComponent(e.googleCalendarId),{etag:e.etag},'DELETE');state.events=state.events.filter(x=>x.id!==e.id);if(!e.googleEventId)saveLocal();$('#eventDialog').close();render();toast('Event deleted');}
 catch(error){$('#eventError').textContent=error.message;}
 finally{state.mutating=false;$('#deleteBtn').disabled=false;}
}
function theme(){const dark=settings.theme==='dark'||settings.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=dark?'dark':'light';$('#themeSelect').value=settings.theme;write('hearth-settings',settings);}
function openSettings(){$('#defaultView').value=settings.view;$('#accountStatus').textContent=state.connected?'Google Calendar is connected in this browser.':state.configured?'Sign in with Google to load your calendars.':'Google connection needs deployment configuration.';$('#signInBtn').textContent=state.connected?'Switch Google account':'Connect Google';$('#disconnectBtn').classList.toggle('hidden',!state.connected);$('#storageExplanation').textContent=state.shared?'Tasks and groceries are saved to your household and refresh every 15 seconds.':'Tasks and groceries currently save on this device. Shared storage requires the Supabase household configuration described in the project README.';$('#timezoneLabel').textContent=zone;$('#settingsDialog').showModal();}
async function loadHome(){try{const result=await api('/api/household');state.shared=result.shared;if(result.shared){state.home={tasks:result.items.filter(x=>x.kind==='tasks'),groceries:result.items.filter(x=>x.kind==='groceries')};}}catch(e){if(state.shared)toast('Household refresh failed: '+e.message);}state.homeReady=true;renderHome();}
function renderHome(){$('#homeStatus').textContent=state.shared?'Shared household · synced':'Saved on this device';for(const kind of ['tasks','groceries']){$(kind==='tasks'?'#taskList':'#groceryList').innerHTML=state.home[kind].map(item=>`<div class="list-row ${item.done?'done':''}"><input type="checkbox" aria-label="Complete ${esc(item.name)}" data-check="${esc(item.id)}" data-kind="${kind}" ${item.done?'checked':''}><span class="item-copy">${esc(item.name)}<small>${esc(item.due||item.quantity||'')}</small></span><button class="icon" data-edit-item="${esc(item.id)}" data-kind="${kind}" aria-label="Edit ${esc(item.name)}">✎</button><button class="icon" data-delete-item="${esc(item.id)}" data-kind="${kind}" aria-label="Delete ${esc(item.name)}">×</button></div>`).join('')||'<p class="muted">Your list is clear.</p>';}
 $('#recipeList').innerHTML=matches(state.home.groceries).slice(0,4).map(r=>`<button class="recipe-button" data-recipe="${r.id}"><strong>${esc(r.name)}</strong><small>${r.minutes} min · ${r.ingredients.length-r.missing.length}/${r.ingredients.length} ingredients listed</small></button>`).join('');
}
async function homeChange(kind,item,remove=false){
 try{if(state.shared)await post('/api/household',{...item,kind},remove?'DELETE':'POST');state.home[kind]=state.home[kind].filter(x=>x.id!==item.id);if(!remove)state.home[kind].push(item);if(!state.shared)write('hearth-home',state.home);renderHome();}
 catch(e){toast('List change could not be saved: '+e.message);renderHome();throw e;}
}
for(const [form,kind] of [['#taskForm','tasks'],['#groceryForm','groceries']])$(form).onsubmit=async e=>{e.preventDefault();const fields=new FormData(e.target),name=fields.get('name').trim();if(!name)return;const button=e.target.querySelector('button');button.disabled=true;try{await homeChange(kind,{id:crypto.randomUUID(),kind,name,done:false,due:fields.get('due')||'',quantity:fields.get('quantity')||''});e.target.reset();}catch{}finally{button.disabled=false;}};
for(const [button,kind] of [['#clearTasks','tasks'],['#clearGroceries','groceries']])$(button).onclick=async()=>{const completed=state.home[kind].filter(x=>x.done);if(!completed.length)return toast('No completed items to clear.');if(!confirm('Remove '+completed.length+' completed items?'))return;$(button).disabled=true;try{for(const item of completed)await homeChange(kind,item,true);}catch{}finally{$(button).disabled=false;}};
$('#mealForm').onsubmit=e=>{e.preventDefault();const groups=mealGroups($('#mealInput').value);$('#mealResult').innerHTML=groups.map(g=>`<div>${g.found.length?'✓':'○'} ${esc(g.name)}: ${g.found.length?esc(g.found.join(', ')):'not recognized'}</div>`).join('')+'<p class="muted">Missing recognition is not proof an ingredient is absent. Use this as a planning checklist; adjust portions to your needs.</p>';};
$('#addIngredients').onclick=async()=>{const recipe=matches(state.home.groceries).find(r=>r.id===activeRecipe);$('#addIngredients').disabled=true;try{for(const name of recipe.missing)await homeChange('groceries',{id:crypto.randomUUID(),kind:'groceries',name,quantity:'',done:false});$('#recipeDialog').close();toast(recipe.missing.length?'Missing ingredients added':'Everything is already on your list');}catch{}finally{$('#addIngredients').disabled=false;}};
$('#shareForm').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('.primary');button.disabled=true;try{await post('/api/google/share',{calendar:shareCalendar.id,email:$('#shareEmail').value,role:$('#shareRole').value});$('#shareDialog').close();toast('Google Calendar sharing updated');}catch(e){$('#shareError').textContent=e.message;}finally{button.disabled=false;}};
document.addEventListener('click',async e=>{
 const b=e.target.closest('button,a');if(b?.hasAttribute('data-close')){b.closest('dialog').close();return;}
 if(b?.dataset.event){openEvent(state.events.find(x=>x.id===b.dataset.event));return;}
 if(b?.dataset.day){state.date=parseDay(b.dataset.day);state.mini=new Date(state.date.getFullYear(),state.date.getMonth(),1);render();sync();return;}
 if(b?.dataset.share){shareCalendar=state.calendars.find(c=>c.id===b.dataset.share);$('#shareName').textContent=shareCalendar.name;$('#shareEmail').value='';$('#shareRole').value='reader';$('#shareError').textContent='';$('#shareDialog').showModal();return;}
 if(b?.dataset.recipe){activeRecipe=Number(b.dataset.recipe);const r=recipes[activeRecipe];$('#recipeTitle').textContent=r.name;$('#recipeDetails').innerHTML='<h3>Ingredients</h3><ul>'+r.ingredients.map(i=>'<li>'+esc(i)+'</li>').join('')+'</ul><h3>Method</h3><ol>'+r.steps.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ol>';$('#recipeDialog').showModal();return;}
 if(b?.dataset.deleteItem||b?.dataset.editItem){const kind=b.dataset.kind,item=state.home[kind].find(x=>x.id===(b.dataset.deleteItem||b.dataset.editItem));if(b.dataset.deleteItem){try{await homeChange(kind,item,true);}catch{}}else{const name=prompt('Item name',item.name);if(name?.trim()){try{await homeChange(kind,{...item,name:name.trim().slice(0,200)});}catch{}}}return;}
 const day=e.target.closest('[data-new-day]');if(day){openEvent(null,day.dataset.newDay);return;}
 const timeline=e.target.closest('[data-time-day]');if(timeline){const min=Math.max(0,Math.min(1425,Math.floor((e.clientY-timeline.getBoundingClientRect().top)/15)*15));openEvent(null,timeline.dataset.timeDay,String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0'));}
});
document.addEventListener('change',async e=>{if(e.target.dataset.calendar){const id=e.target.dataset.calendar;state.hidden=state.hidden.filter(x=>x!==id);if(!e.target.checked)state.hidden.push(id);write('hearth-hidden-calendars',state.hidden);render();}if(e.target.dataset.check){const kind=e.target.dataset.kind,item=state.home[kind].find(x=>x.id===e.target.dataset.check);try{await homeChange(kind,{...item,done:e.target.checked});}catch{}}});
$('#todayBtn').onclick=()=>{state.date=new Date();state.mini=new Date(state.date.getFullYear(),state.date.getMonth(),1);render();sync();};
$('#prevBtn').onclick=()=>navigate(-1);$('#nextBtn').onclick=()=>navigate(1);
$('#miniPrev').onclick=()=>{state.mini=new Date(state.mini.getFullYear(),state.mini.getMonth()-1,1);renderMini();};$('#miniNext').onclick=()=>{state.mini=new Date(state.mini.getFullYear(),state.mini.getMonth()+1,1);renderMini();};
$('#viewSelect').onchange=e=>{state.view=e.target.value;$('#calendarContent').scrollTop=0;render();sync();};
$('#searchInput').oninput=render;$('#createBtn').onclick=()=>openEvent();$('#allDay').onchange=toggleAllDay;$('#eventForm').onsubmit=saveEvent;$('#deleteBtn').onclick=deleteEvent;
$('#connectBtn').onclick=()=>state.connected?sync():location.assign('/auth/google');$('#signInBtn').onclick=()=>location.assign('/auth/google');
$('#disconnectBtn').onclick=async()=>{try{await post('/api/google/status',{},'DELETE');++syncSequence;state.connected=false;state.events=[...state.localEvents];state.calendars=[localCalendar];$('#settingsDialog').close();await initConnection();toast('Disconnected in this browser');}catch(e){toast(e.message);}};
$('#themeBtn').onclick=()=>{settings.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';theme();};$('#themeSelect').onchange=e=>{settings.theme=e.target.value;theme();};matchMedia('(prefers-color-scheme: dark)').addEventListener('change',theme);
$('#defaultView').onchange=e=>{settings.view=e.target.value;write('hearth-settings',settings);};
$('#settingsBtn').onclick=$('#accountBtn').onclick=openSettings;
$('#menuBtn').onclick=()=>document.body.classList.toggle(matchMedia('(max-width:700px)').matches?'sidebar-open':'sidebar-closed');
$$('[data-app]').forEach(b=>b.onclick=()=>{state.app=b.dataset.app;$$('[data-app]').forEach(x=>x.classList.toggle('active',x===b));$('#homeWorkspace').classList.toggle('hidden',state.app!=='home');$('#calendarWorkspace').classList.toggle('hidden',state.app!=='calendar');$('#sidebar').classList.toggle('hidden',state.app!=='calendar');if(state.app==='home')loadHome();});
document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,dialog')||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key.toLowerCase()==='t')$('#todayBtn').click();if(e.key.toLowerCase()==='c')openEvent();});
setInterval(()=>{if(!document.hidden&&state.connected&&!state.loading&&!state.mutating&&!$('dialog[open]'))sync();},60000);
setInterval(()=>{if(!document.hidden&&state.app==='home'&&state.shared)loadHome();},15000);
theme();render();renderHome();initConnection();
const oauthResult=new URLSearchParams(location.search).get('sync');if(oauthResult){history.replaceState({},'',location.pathname);if(oauthResult!=='connected')toast('Google connection: '+oauthResult.replaceAll('-',' '));}
