export const pad = n => String(n).padStart(2, '0');
export const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
export const parseDay = s => new Date(s + 'T00:00:00');
export const addDays = (d,n) => { const copy=new Date(d); copy.setDate(copy.getDate()+n); return copy; };
export const clock = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const minute = s => Number(s.slice(0,2))*60+Number(s.slice(3,5));
export const escapeHTML = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const safeColor = c => /^#[0-9a-f]{6}$/i.test(c||'') ? c : '#1967d2';
export function normalizeEvent(e) {
  if(e.allDay) return {...e,endDate:e.endDate||dateKey(addDays(parseDay(e.date),1))};
  if(e.startDateTime && e.endDateTime) {
    const a=new Date(e.startDateTime),b=new Date(e.endDateTime);
    return {...e,date:dateKey(a),time:clock(a),endDate:dateKey(b),end:clock(b)};
  }
  return {...e,endDate:e.endDate||e.date};
}
export function occursOn(e,day) {
  if(e.allDay) return e.date<=day && e.endDate>day;
  const start=new Date(e.date+'T'+e.time), end=new Date((e.endDate||e.date)+'T'+e.end);
  return start<addDays(parseDay(day),1)&&end>parseDay(day);
}
export function segment(e,day) {
  if(!occursOn(e,day)||e.allDay)return null;
  const start=e.date<day?0:minute(e.time),end=e.endDate>day?1440:minute(e.end);
  return {event:e,start,end};
}
// Connected groups of overlapping events share equal-width lanes.
export function layoutEvents(events,day) {
  const parts=events.map(e=>segment(e,day)).filter(Boolean).sort((a,b)=>a.start-b.start||b.end-a.end);
  let group=[],until=-1; const result=[];
  const flush=()=>{const lanes=[];for(const part of group){let lane=lanes.findIndex(end=>end<=part.start);if(lane<0)lane=lanes.length;lanes[lane]=part.end;part.lane=lane;}for(const part of group)result.push({...part,lanes:lanes.length});group=[];};
  for(const part of parts){if(part.start>=until){flush();until=-1;}group.push(part);until=Math.max(until,part.end);}flush();return result;
}
export function monthDates(date) {
  const first=new Date(date.getFullYear(),date.getMonth(),1),start=addDays(first,-first.getDay());
  const rows=Math.ceil((first.getDay()+new Date(date.getFullYear(),date.getMonth()+1,0).getDate())/7);
  return Array.from({length:rows*7},(_,i)=>addDays(start,i));
}
