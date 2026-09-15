import {guard,google,allPages,json,failure} from '../_lib/google.js';
export default async function handler(req,res){
 try{
  guard(req,res);
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  const {calendar,email,role}=req.body||{};
  if(typeof calendar!=='string'||!/^\S+@\S+\.\S+$/.test(email||'')||!['reader','writer','none'].includes(role))throw failure('Choose a calendar, valid email, and access level.');
  const c=await google(req,res,'/users/me/calendarList/'+encodeURIComponent(calendar));
  if(c.accessRole!=='owner')throw failure('Only the calendar owner can change sharing.',403);
  const path='/calendars/'+encodeURIComponent(calendar)+'/acl',address=email.trim().toLowerCase();
  const rules=await allPages(req,res,path),existing=rules.find(r=>r.scope?.type==='user'&&r.scope.value?.toLowerCase()===address);
  if(existing?.role==='owner')throw failure('Owner access cannot be changed here.');
  if(role==='none'){if(existing)await google(req,res,path+'/'+encodeURIComponent(existing.id),{method:'DELETE'});}
  else await google(req,res,path+(existing?'/'+encodeURIComponent(existing.id):'')+'?sendNotifications=false',{method:existing?'PATCH':'POST',body:JSON.stringify({role,scope:{type:'user',value:address}})});
  return json(res,200,{shared:role!=='none'});
 }catch(e){return json(res,e.status||500,{error:e.message});}
}
