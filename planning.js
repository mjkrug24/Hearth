import {dateKey,parseDay,addDays,clock} from './calendar-model.js';
export function nextDue(due,repeat){
 const d=parseDay(due);if(!Number.isFinite(+d)||repeat==='none')return '';
 if(repeat==='daily')return dateKey(addDays(d,1));
 if(repeat==='weekly')return dateKey(addDays(d,7));
 if(repeat==='monthly'){const result=new Date(d.getFullYear(),d.getMonth()+1,1);result.setDate(Math.min(d.getDate(),new Date(result.getFullYear(),result.getMonth()+1,0).getDate()));return dateKey(result);}return '';
}
export function overlaps(a,b){
 const bounds=e=>e.allDay?[+parseDay(e.date),+parseDay(e.endDate)]:[+new Date(e.date+'T'+e.time),+new Date(e.endDate+'T'+e.end)];
 const [a0,a1]=bounds(a),[b0,b1]=bounds(b);return a0<b1&&b0<a1;
}
export function shiftedEvent(e,day,minutes,resize=false){
 const start=new Date(e.date+'T'+e.time),end=new Date(e.endDate+'T'+e.end);
 if(resize){const target=addDays(parseDay(day),Math.floor(minutes/1440));target.setMinutes(minutes%1440);if(target<=start)return null;end.setTime(+target);}
 else{const deltaDays=Math.round((parseDay(day)-parseDay(e.date))/86400000);const duration=end-start;start.setTime(+addDays(start,deltaDays));start.setHours(Math.floor(minutes/60),minutes%60,0,0);end.setTime(+start+duration);}
 return {...e,date:dateKey(start),time:clock(start),endDate:dateKey(end),end:clock(end),startDateTime:start.toISOString(),endDateTime:end.toISOString()};
}
export function expandLocal(events,from,to){
 const result=[];
 for(const e of events){
  if(!e.repeat||e.repeat==='none'||e.googleEventId){result.push(e);continue;}
  const count=Math.min(365,Math.max(1,e.repeatCount||12)),anchor=parseDay(e.date),last=parseDay(to),daySpan=Math.round((parseDay(e.endDate)-anchor)/86400000);
  let ordinal=0;
  for(let cursor=new Date(anchor);cursor<=last&&ordinal<count;cursor=addDays(cursor,1)){
   const days=Math.round((cursor-anchor)/86400000),match=e.repeat==='daily'||e.repeat==='weekdays'&&![0,6].includes(cursor.getDay())||e.repeat==='weekly'&&days%7===0||e.repeat==='monthly'&&(cursor.getDate()===anchor.getDate()||cursor.getDate()===new Date(cursor.getFullYear(),cursor.getMonth()+1,0).getDate()&&anchor.getDate()>cursor.getDate());
   if(!match)continue;ordinal++;const key=dateKey(cursor);if(key<from||e.excludedDates?.includes(key))continue;
   result.push({...e,id:e.id+'@'+key,localParentId:e.id,occurrenceDate:key,repeat:'none',date:key,endDate:dateKey(addDays(cursor,daySpan)),startDateTime:null,endDateTime:null});
  }
 }
 return result;
}
export async function stableUUID(text){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));const hex=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,32);return hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20);}
export function mergePending(events,queue){
 const result=new Map(events.map(e=>[e.id,e]));
 for(const op of queue.filter(x=>x.type==='event')){
  result.delete(op.before?.id||op.item.id);
  if(op.action!=='delete')result.set(op.item.id,{...op.item,pending:true});
 }
 return [...result.values()];
}
export function normalizedFood(s){return String(s||'').toLowerCase().trim().replace(/tomatoes/g,'tomato').replace(/potatoes/g,'potato').replace(/eggs/g,'egg').replace(/chickpeas/g,'chickpea').replace(/\s+/g,' ');}
export function shoppingNeeds(meals,recipes,pantry,groceries){
 const total=new Map();
 for(const meal of meals){const r=recipes[Number(meal.recipeId)] || (Array.isArray(recipes) ? recipes.find(x=>x&&(x.id===meal.recipeId||x.name===meal.name)) : null);if(!r)continue;for(const ingredient of r.portions){const key=normalizedFood(ingredient.name)+'|'+ingredient.unit;const row=total.get(key)||{...ingredient,amount:0};row.amount+=ingredient.amount*Number(meal.servings||r.servings)/r.servings;total.set(key,row);}}
 const needs=[];
 for(const row of total.values()){let required=row.amount;
  for(const item of [...pantry,...groceries])if(normalizedFood(item.name)===normalizedFood(row.name)&&item.unit===row.unit&&Number(item.amount)>0)required-=Number(item.amount);
  if(required>0.001)needs.push({...row,amount:Math.round(required*100)/100});
 }
 return needs;
}
