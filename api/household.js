import {guard,google,json,failure} from './_lib/google.js';
const ready=()=>!!(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY&&process.env.HOUSEHOLD_MEMBERS);
const flatten=row=>({...row,...row.details,createdBy:row.created_by,updatedBy:row.updated_by,completedBy:row.completed_by});
export default async function handler(req,res){
 try{guard(req,res);
  if(!ready()){if(req.method==='GET')return json(res,200,{shared:false,configured:false,items:[]});throw failure('Household storage is not configured.',503);}
  const primary=await google(req,res,'/calendars/primary'),email=primary.id.toLowerCase();
  if(req.body?.account&&req.body.account.toLowerCase()!==email)throw failure('This change belongs to a different Google account.',403);
  const members=process.env.HOUSEHOLD_MEMBERS.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(!members.includes(email)){if(req.method==='GET')return json(res,200,{shared:false,configured:true,items:[]});throw failure('This Google account is not a member of this household.',403);}
  const household=process.env.HOUSEHOLD_ID||'home',headers={apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:'return=representation'};
  const endpoint=process.env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/hearth_items',base=endpoint+'?household=eq.'+encodeURIComponent(household);
  async function db(url,options={}){const result=await fetch(url,{headers,...options});if(!result.ok)throw failure('Shared storage unavailable. Run the latest supabase.sql migration and check project settings.',502);return result.status===204?[]:result.json();}
  if(req.method==='GET'){let items=[],page;do{page=await db(base+'&order=id&limit=500&offset='+items.length);items.push(...page);}while(page.length===500);return json(res,200,{shared:true,configured:true,account:email,members,items:items.map(flatten)});}
  const e=req.body||{};
  if(!/^[0-9a-f-]{36}$/i.test(e.id))throw failure('Invalid list item ID.');
  const rowURL=base+'&id=eq.'+encodeURIComponent(e.id);
  if(req.method==='DELETE'){await db(rowURL,{method:'DELETE',headers});return json(res,200,{shared:true,items:[]});}
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  if(!['tasks','groceries','pantry','meals'].includes(e.kind)||typeof e.name!=='string'||!e.name.trim()||e.name.length>200)throw failure('Invalid list item.');
  if(e.assignedTo&&!members.includes(e.assignedTo))throw failure('Choose a household member for the task.');
  if(e.repeat&&!['none','daily','weekly','monthly'].includes(e.repeat))throw failure('Invalid chore repeat.');
  const existing=(await db(rowURL))[0];
  const details={assignedTo:e.assignedTo||'',priority:['low','normal','high'].includes(e.priority)?e.priority:'normal',repeat:e.repeat||'none',recipeId:Number.isInteger(Number(e.recipeId))&&Number(e.recipeId)>=0?Number(e.recipeId):null,servings:Math.max(1,Math.min(20,Number(e.servings)||2)),amount:Math.max(0,Math.min(100000,Number(e.amount)||0)),unit:String(e.unit||'each').slice(0,20),nextId:e.nextId||null,completedAt:e.done?(existing?.details?.completedAt||new Date().toISOString()):null};
  const payload={household,id:e.id,kind:e.kind,name:e.name.trim(),done:!!e.done,due:String(e.due||'').slice(0,10),quantity:String(e.quantity||'').slice(0,50),details,created_by:existing?.created_by||email,updated_by:email,completed_by:e.done?(existing?.completed_by||email):null,updated_at:new Date().toISOString()};
  const items=await db(endpoint+'?on_conflict=household,id',{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(payload)});
  return json(res,200,{shared:true,items:items.map(flatten)});
 }catch(e){return json(res,e.status||500,{error:e.message});}
}
