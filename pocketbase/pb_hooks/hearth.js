function find(app,col,filter,args){return Array.from(app.findRecordsByFilter(col,filter,'',0,0,args));}
function home(app,user){
  const existing=find(app,'hearth_households','members.id ?= {:user}',{user});if(existing.length)return existing[0];
  const h=new Record(app.findCollectionByNameOrId('hearth_households'));h.set('name','My home');h.set('owner',user);h.set('members',[user]);app.save(h);return h;
}
function plain(r,events=false){
  const saved=JSON.parse(r.getString('data')||'null');let value=saved&&typeof saved==='object'?JSON.parse(JSON.stringify(saved)):null;
  if(!value||!value.id){value={};const keys=events?['title','date','endDate','time','end','allDay','location','notes','repeat','repeatCount','reminder','timeZone']:['kind','name','done','due','quantity','assignedTo'];for(const k of keys)value[k]=r.get(k);if(!events)Object.assign(value,JSON.parse(r.getString('details')||'{}'));}
  return Object.assign(value,{id:r.getString('client_id')||r.id,updated_at:r.getString('version')||r.getString('updated')});
}
function rows(app,h,user,events){return find(app,events?'hearth_events':'hearth_items',events?'user = {:scope}':'household = {:scope}',{scope:events?user:h.id});}
function members(app,h){return Array.from(h.getStringSlice('members')).map(id=>{const u=app.findRecordById('users',id);return {id,email:u.email()};});}
function validate(item,events){
  if(!item||typeof item.id!=='string'||!item.id||item.id.length>200)throw new BadRequestError('Invalid item ID.');
  const name=events?item.title:item.name;if(typeof name!=='string'||!name.trim()||name.length>(events?500:200))throw new BadRequestError('A name is required.');
  if(!events&&!['tasks','groceries','pantry','meals','recipes'].includes(item.kind))throw new BadRequestError('Invalid item kind.');
  for(const k of ['amount','servings'])if(item[k]!=null&&(!Number.isFinite(Number(item[k]))||Number(item[k])<0||Number(item[k])>100000))throw new BadRequestError('Invalid quantity.');
  for(const k of ['due','expires','scheduledDue','seriesAnchor'])if(item[k]&&(!/^\d{4}-\d{2}-\d{2}$/.test(item[k])||!Number.isFinite(Date.parse(item[k]))))throw new BadRequestError('Invalid date.');
  if(item.repeat&&!['none','daily','weekdays','weekly','monthly'].includes(item.repeat))throw new BadRequestError('Invalid repeat.');
  if(item.kind==='tasks'&&item.repeat&&item.repeat!=='none'&&!item.due)throw new BadRequestError('A recurring chore needs a due date.');
  if(item.kind==='meals'&&(!(item.servings>=1)||item.servings>20))throw new BadRequestError('Choose 1–20 servings.');
  if(item.kind==='recipes'||item.recipeSnapshot){const r=item.kind==='recipes'?item:item.recipeSnapshot;if(!Array.isArray(r.portions)||!r.portions.length||!Array.isArray(r.steps)||!r.steps.length||!(r.servings>=1))throw new BadRequestError('Recipe ingredients and steps are required.');if(r.portions.some(p=>!p.name||!p.unit||!Number.isFinite(p.amount)||p.amount<=0))throw new BadRequestError('Invalid recipe ingredient.');}
  if(events){if(!/^\d{4}-\d{2}-\d{2}$/.test(item.date)||!/^\d{4}-\d{2}-\d{2}$/.test(item.endDate))throw new BadRequestError('Invalid event date.');const start=Date.parse(item.date+(item.allDay?'T00:00':('T'+item.time))),end=Date.parse(item.endDate+(item.allDay?'T00:00':('T'+item.end)));if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new BadRequestError('Event end must be after start.');}
}
module.exports={
 snapshot(e){let result;e.app.runInTransaction(app=>{const h=home(app,e.auth.id),settings=find(app,'hearth_settings','user = {:user}',{user:e.auth.id});result={household:{id:h.id,name:h.getString('name'),owner:h.getString('owner')},members:members(app,h),items:rows(app,h,e.auth.id,false).map(r=>plain(r)),events:rows(app,h,e.auth.id,true).map(r=>plain(r,true)),settings:JSON.parse(settings[0]?.getString('settings')||'{}')};});return e.json(200,result);},
 apply(e){const b=e.requestInfo().body;let result;e.app.runInTransaction(app=>{
  const h=home(app,e.auth.id),events=b.collection==='events';if(!['items','events'].includes(b.collection)||b.household!==h.id||typeof b.operationId!=='string'||!/^[a-zA-Z0-9-]{15,60}$/.test(b.operationId))throw new BadRequestError('Invalid operation or household.');
  const scope=e.auth.id+'|'+h.id+'|'+b.collection,receipt=find(app,'hearth_operations','scope = {:scope} && operation = {:op}',{scope,op:b.operationId});if(receipt.length){result=JSON.parse(receipt[0].getString('result'));return;}
  if(!Array.isArray(b.changes)||!b.changes.length||b.changes.length>200||!Array.isArray(b.expected))throw new BadRequestError('An operation needs changes and a snapshot.');
  const current=rows(app,h,e.auth.id,events),signature=list=>JSON.stringify(list.map(i=>[i.id,i.updated_at||null]).sort((a,b)=>a[0].localeCompare(b[0])));
  if(signature(current.map(r=>plain(r,events)))!==signature(b.expected))throw new ApiError(409,'Your household changed. Refresh and review these changes.');
  const saved=[],removed=[],seen=new Set(),allowed=members(app,h).map(m=>m.email);
  for(const change of b.changes){const item=change.item;if(!item||seen.has(item.id))throw new BadRequestError('Duplicate item.');seen.add(item.id);let record=current.find(r=>(r.getString('client_id')||r.id)===item.id);
   if(change.remove){if(record)app.delete(record);removed.push(item.id);continue;}
   validate(item,events);if(!events&&(item.assignedTo&&!allowed.includes(item.assignedTo)||item.rotation?.some(m=>!allowed.includes(m))))throw new BadRequestError('Choose a household member.');
   if(!record)record=new Record(app.findCollectionByNameOrId(events?'hearth_events':'hearth_items'));
   const data=JSON.parse(JSON.stringify(item));delete data.pending;delete data.pb_id;delete data.updated_at;
   record.set('client_id',item.id);record.set('user',e.auth.id);record.set('version',$security.randomString(24));record.set('data',data);
   if(events){record.set('title',item.title);record.set('date',item.date);}else{record.set('household',h.id);record.set('name',item.name);record.set('kind',item.kind);}
   app.save(record);saved.push(plain(record,events));
  }
  result={items:saved,removed};const receiptRecord=new Record(app.findCollectionByNameOrId('hearth_operations'));receiptRecord.set('scope',scope);receiptRecord.set('operation',b.operationId);receiptRecord.set('result',result);app.save(receiptRecord);
 });return e.json(200,result);},
 settings(e){const data=e.requestInfo().body;delete data.destination;let result;e.app.runInTransaction(app=>{const existing=find(app,'hearth_settings','user = {:user}',{user:e.auth.id});const r=existing[0]||new Record(app.findCollectionByNameOrId('hearth_settings'));r.set('user',e.auth.id);r.set('settings',data);app.save(r);result=r;});return e.json(200,result);},
 invite(e){let token;e.app.runInTransaction(app=>{const h=home(app,e.auth.id);if(h.getString('owner')!==e.auth.id)throw new ForbiddenError('Only the household owner can invite members.');const r=new Record(app.findCollectionByNameOrId('hearth_invites'));token=$security.randomString(32);r.set('token',token);r.set('household',h.id);r.set('expires',new Date(Date.now()+86400000).toISOString());app.save(r);});return e.json(200,{code:token,expiresInHours:24});},
 join(e){const token=e.requestInfo().body.code;if(typeof token!=='string'||token.length!==32)throw new BadRequestError('Enter a valid invitation code.');e.app.runInTransaction(app=>{const invites=find(app,'hearth_invites','token = {:token}',{token});const invite=invites[0];if(!invite||invite.getBool('used')||Date.parse(invite.getString('expires'))<Date.now())throw new BadRequestError('This invitation is invalid or expired.');const target=app.findRecordById('hearth_households',invite.getString('household')),old=home(app,e.auth.id);if(target.id===old.id)return;if(old.getStringSlice('members').length>1)throw new BadRequestError('Ask your administrator to move membership from your existing shared household.');for(const item of rows(app,old,e.auth.id,false)){item.set('household',target.id);app.save(item);}target.set('members',[...target.getStringSlice('members'),e.auth.id]);app.save(target);old.set('members',[]);app.save(old);invite.set('used',true);app.save(invite);});return e.json(200,{joined:true});}
};
