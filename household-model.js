import {dateKey,parseDay,addDays} from './calendar-model.js';
import {normalizedFood,nextDue,stableUUID} from './planning.js';

export const kinds=['tasks','groceries','pantry','meals','recipes'];
export const foodKey=i=>normalizedFood(i.name)+'|'+i.unit;
export const quantity=n=>Math.round(Number(n)*100)/100;
export function recipeFor(meal,recipes){
 if(meal.recipeSnapshot)return meal.recipeSnapshot;
 const exact=recipes.find(r=>r.id===meal.recipeId);if(exact)return exact;
 const legacy=recipes[Number(meal.recipeId)];
 if(legacy&&(!meal.name||legacy.name===meal.name))return legacy;
 const named=recipes.filter(r=>r.name===meal.name);return named.length===1?named[0]:undefined;
}
export function migrateMeals(meals,recipes){return meals.map(m=>{const r=recipeFor(m,recipes);return r?{...m,recipeId:r.id,recipeSnapshot:structuredClone(r)}:m;});}
export function shoppingPreview(meals,recipes,pantry,groceries){
 const totals=new Map();
 for(const meal of meals){const r=recipeFor(meal,recipes);if(!r)throw Error('Choose a replacement recipe for '+meal.name+' before building shopping.');
  for(const p of r.portions){const key=foodKey(p),row=totals.get(key)||{...p,required:0};row.required+=p.amount*meal.servings/r.servings;totals.set(key,row);}}
 return [...totals.values()].map(row=>{
  const amount=list=>list.filter(i=>foodKey(i)===foodKey(row)).reduce((n,i)=>n+(Number(i.amount)||0),0);
  const owned=amount(pantry),listed=amount(groceries);
  return {...row,required:quantity(row.required),owned:quantity(owned),listed:quantity(listed),amount:quantity(Math.max(0,row.required-owned-listed)),warning:[...pantry,...groceries].some(i=>normalizedFood(i.name)===normalizedFood(row.name)&&i.unit!==row.unit)?'Different units also listed; review separately.':''};
 });
}
export function cookingPreview(meal,recipes,pantry){
 const r=recipeFor(meal,recipes);if(!r)throw Error('Choose a replacement recipe before cooking this meal.');
 const available=pantry.map(i=>({...i})).sort((a,b)=>(a.expires||'9999').localeCompare(b.expires||'9999'));
 const rows=[],warnings=[];
 for(const p of r.portions){let needed=quantity(p.amount*meal.servings/r.servings);
  for(const stock of available.filter(i=>foodKey(i)===foodKey(p))){const amount=Math.min(needed,stock.amount||0);if(amount>0){rows.push({...stock,amount,maximum:stock.amount});stock.amount-=amount;needed=quantity(needed-amount);}}
  if(needed>0)warnings.push(p.name+': '+needed+' '+p.unit+' not available in pantry.');
  if(available.some(i=>normalizedFood(i.name)===normalizedFood(p.name)&&i.unit!==p.unit))warnings.push(p.name+': other units need manual review.');
 }
 // A stock row can serve multiple recipe lines. Deduct it once.
 const merged=new Map();for(const row of rows){const prev=merged.get(row.id);if(prev)prev.amount=quantity(prev.amount+row.amount);else merged.set(row.id,{...row,maximum:pantry.find(i=>i.id===row.id).amount});}
 return {rows:[...merged.values()],warnings};
}
export function applyChanges(home,changes){const next=structuredClone(home);for(const {item,remove} of changes){next[item.kind]=(next[item.kind]||[]).filter(i=>i.id!==item.id);if(!remove)next[item.kind].push(item);}return next;}
export function fingerprint(home){return JSON.stringify(kinds.flatMap(k=>(home[k]||[]).map(i=>[k,i.id,i.updated_at||'',i.amount||0,i.done||false,i.due||'',i.expires||''])).sort((a,b)=>String(a).localeCompare(String(b))));}
export async function advanceChore(item,skipped=false){
 const completed={...item,done:true,skipped};if(!item.repeat||item.repeat==='none'||!item.due)return [{item:completed}];
 let due=nextDue(item.scheduledDue||item.due,item.repeat);
 if(item.repeat==='monthly'){const anchor=parseDay(item.seriesAnchor||item.scheduledDue||item.due).getDate(),d=parseDay(due);d.setDate(Math.min(anchor,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));due=dateKey(d);}
 const id=item.nextId||await stableUUID(item.id+'|'+due),rotation=item.rotation||[];
 const assignedTo=rotation.length>1?rotation[(Math.max(0,rotation.indexOf(item.assignedTo))+1)%rotation.length]:item.assignedTo;
 return [{item:{...completed,nextId:id}},{item:{...item,id,due,scheduledDue:due,seriesAnchor:item.seriesAnchor||item.scheduledDue||item.due,assignedTo,done:false,skipped:false,nextId:null,completedBy:null,completedAt:null,updated_at:undefined}}];
}
export function useSoon(pantry,today=dateKey(new Date())){const end=dateKey(addDays(parseDay(today),7));return pantry.filter(i=>i.expires&&i.expires<=end&&i.amount>0).sort((a,b)=>a.expires.localeCompare(b.expires));}
export function aisleFor(name){const n=normalizedFood(name);return /milk|cheese|yogurt|butter|egg/.test(n)?'Dairy & eggs':/chicken|beef|salmon|fish/.test(n)?'Meat & seafood':/tomato|potato|broccoli|spinach|carrot|onion|fruit|banana|lemon|cucumber|avocado|pepper|garlic/.test(n)?'Produce':/frozen/.test(n)?'Frozen':'Pantry & other';}
