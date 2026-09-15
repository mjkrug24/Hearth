import {guard,google,json,failure} from './_lib/google.js';
import {validateChanges} from './_lib/household.js';
import {randomUUID} from 'node:crypto';
const flatten=row=>({...row,...row.details,id:row.id,name:row.name,createdBy:row.created_by,updatedBy:row.updated_by,completedBy:row.completed_by});
export default async function handler(req,res){
 try{guard(req,res);
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY||!process.env.HOUSEHOLD_MEMBERS){if(req.method==='GET')return json(res,200,{shared:false,configured:false,items:[]});throw failure('Household storage is not configured.',503);}
  const primary=await google(req,res,'/calendars/primary'),email=primary.id.toLowerCase();
  if(req.body?.account&&req.body.account.toLowerCase()!==email)throw failure('This change belongs to a different Google account.',403);
  const members=process.env.HOUSEHOLD_MEMBERS.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(!members.includes(email)){if(req.method==='GET')return json(res,200,{shared:false,configured:true,items:[]});throw failure('This Google account is not a member of this household.',403);}
  const household=process.env.HOUSEHOLD_ID||'home',headers={apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
  const root=process.env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1';
  async function db(url,options={}){const result=await fetch(url,{headers,...options});if(!result.ok){const data=await result.json().catch(()=>({}));if(data.message?.includes('STALE_PREVIEW'))throw failure('Household changed. Refresh and review this operation again.',409);throw failure('Shared storage unavailable. Apply the latest supabase.sql migration and check project settings.',502);}return result.status===204?[]:result.json();}
  if(req.method==='GET'){let items=[],page;do{page=await db(root+'/hearth_items?household=eq.'+encodeURIComponent(household)+'&order=id&limit=500&offset='+items.length);items.push(...page);}while(page.length===500);return json(res,200,{shared:true,configured:true,account:email,members,items:items.map(flatten)});}
  if(!['POST','DELETE'].includes(req.method))return json(res,405,{error:'Method not allowed'});
  const e=req.body||{},batch=Array.isArray(e.changes);
  const changes=validateChanges(batch?e.changes:[{item:e,remove:req.method==='DELETE'}],members);
  const operation=e.operationId||(!batch&&randomUUID());if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operation))throw failure('Invalid operation ID.');
  if(batch&&!Array.isArray(e.expected))throw failure('A batch operation needs a household snapshot.');
  if(batch&&e.expected.some(i=>!i||!/^[0-9a-f-]{36}$/i.test(i.id)||i.updated_at!==null&&!Number.isFinite(Date.parse(i.updated_at))))throw failure('Invalid household snapshot.');
  const items=await db(root+'/rpc/hearth_apply_operation',{method:'POST',body:JSON.stringify({p_household:household,p_actor:email,p_operation:operation,p_changes:changes,p_expected:batch?e.expected:null})});
  return json(res,200,{shared:true,items:items.map(flatten),batch});
 }catch(e){return json(res,e.status||500,{error:e.message});}
}
