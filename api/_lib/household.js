import {normalizeCustomRecipe} from '../../recipes.js';
import {failure} from './google.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const date=s=>!s||/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(+new Date(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export function validateItem(e,members){
 if(!e||!uuid.test(e.id)||!['tasks','groceries','pantry','meals','recipes'].includes(e.kind)||typeof e.name!=='string'||!e.name.trim()||e.name.length>200)throw failure('Invalid household item.');
 if(e.assignedTo&&!members.includes(e.assignedTo))throw failure('Choose a household member for the task.');
 if(e.repeat&&!['none','daily','weekly','monthly'].includes(e.repeat))throw failure('Invalid chore repeat.');
 for(const key of ['due','expires','scheduledDue','seriesAnchor'])if(!date(e[key]))throw failure('Invalid '+key+' date.');
 for(const key of ['amount','servings'])if(e[key]!=null&&(!Number.isFinite(Number(e[key]))||Number(e[key])<0||Number(e[key])>(key==='servings'?20:100000)))throw failure('Invalid '+key+'.');
 if(e.kind==='meals'&&!(Number(e.servings)>=1))throw failure('Choose at least one serving.');
 if(e.kind==='tasks'&&e.repeat&&e.repeat!=='none'&&!e.due)throw failure('A recurring chore needs a due date.');
 if(e.rotation&&(!Array.isArray(e.rotation)||e.rotation.some(m=>!members.includes(m))||new Set(e.rotation).size!==e.rotation.length))throw failure('Invalid chore rotation.');
 const details={};for(const key of ['assignedTo','priority','repeat','recipeId','recipeSnapshot','servings','amount','unit','nextId','expires','aisle','scheduledDue','seriesAnchor','rotation','skipped'])if(e[key]!==undefined)details[key]=e[key];
 for(const key of ['amount','servings'])if(details[key]!=null)details[key]=Number(details[key]);
 if(details.priority&&!['normal','high','low'].includes(details.priority))throw failure('Invalid task priority.');
 if(details.unit&&String(details.unit).length>20)throw failure('Unit is too long.');
 if(details.aisle&&String(details.aisle).length>60)throw failure('Aisle is too long.');
 if(details.recipeId!=null&&!(typeof details.recipeId==='string'&&details.recipeId.length<=200||Number.isInteger(details.recipeId)&&details.recipeId>=0))throw failure('Invalid recipe reference.');
 try{
  if(details.recipeSnapshot)details.recipeSnapshot={...normalizeCustomRecipe(details.recipeSnapshot),custom:!!details.recipeSnapshot.custom};
  if(e.kind==='recipes'){const r=normalizeCustomRecipe(e);delete r.id;delete r.name;Object.assign(details,r);}
 }catch(error){throw failure(error.message);}
 return {id:e.id,kind:e.kind,name:e.name.trim(),done:!!e.done,due:e.due||'',quantity:String(e.quantity||'').slice(0,50),details};
}
export function validateChanges(changes,members){
 if(!Array.isArray(changes)||!changes.length||changes.length>200)throw failure('Choose between 1 and 200 changes.');
 const seen=new Set();return changes.map(c=>{if(seen.has(c.item?.id))throw failure('Duplicate item in operation.');seen.add(c.item?.id);return {item:validateItem(c.item,members),remove:!!c.remove};});
}
