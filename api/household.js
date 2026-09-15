import {guard,google,json,failure} from './_lib/google.js';
const ready=()=>!!(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY&&process.env.HOUSEHOLD_MEMBERS);
export default async function handler(req,res){
 try{guard(req,res);
  if(!ready()){if(req.method==='GET')return json(res,200,{shared:false,items:[]});throw failure('Household storage is not configured.',503);}
  const primary=await google(req,res,'/calendars/primary'),email=primary.id.toLowerCase();
  const members=process.env.HOUSEHOLD_MEMBERS.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(!members.includes(email)){if(req.method==='GET')return json(res,200,{shared:false,items:[]});throw failure('This Google account is not a member of this household.',403);}
  const household=process.env.HOUSEHOLD_ID||'home';
  const headers={apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:'return=representation'};
  const endpoint=process.env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/hearth_items';
  let url=endpoint+'?household=eq.'+encodeURIComponent(household),method=req.method,body;
  if(method==='POST'){
   const e=req.body||{};if(!/^[0-9a-f-]{36}$/i.test(e.id)||!['tasks','groceries'].includes(e.kind)||typeof e.name!=='string'||!e.name.trim()||e.name.length>200)throw failure('Invalid list item.');
   // Upsert has a composite key, so it cannot overwrite another household.
   url=endpoint+'?on_conflict=household,id';headers.Prefer='resolution=merge-duplicates,return=representation';
   body=JSON.stringify({household,id:e.id,kind:e.kind,name:e.name.trim(),done:!!e.done,due:String(e.due||'').slice(0,10),quantity:String(e.quantity||'').slice(0,50)});
  }else if(method==='DELETE'){if(!/^[0-9a-f-]{36}$/i.test(req.body?.id||''))throw failure('Invalid item ID.');url+='&id=eq.'+encodeURIComponent(req.body.id);}
  else if(method!=='GET')return json(res,405,{error:'Method not allowed'});
  const result=await fetch(url,{method,headers,body});if(!result.ok)throw failure('Shared storage is unavailable. Check the Supabase table and project settings.',502);
  const items=await result.json();return json(res,200,{shared:true,items});
 }catch(e){return json(res,e.status||500,{error:e.message});}
}
