// Durable, server/account-bound operations. A server receipt makes lost responses safe to retry.
export const versions=rows=>rows.map(({id,updated_at})=>({id,updated_at:updated_at||null})).sort((a,b)=>a.id.localeCompare(b.id));
const changeRows=(rows,changes)=>{const map=new Map(rows.map(i=>[i.id,i]));for(const c of changes)c.remove?map.delete(c.item.id):map.set(c.item.id,c.item);return [...map.values()];};
export class HouseholdStore {
 constructor(client,storage,onChange=()=>{}){this.client=client;this.storage=storage;this.onChange=onChange;this.key='hearth-sync-v2:'+encodeURIComponent(client.getUrl())+':'+client.user().id;this.data=JSON.parse(storage.getItem(this.key)||'null')||{items:[],events:[],queue:[],settings:{}};this.busy=false;this.active=true;}
 persist(){this.storage.setItem(this.key,JSON.stringify(this.data));this.onChange();}
 view(collection){let rows=this.data[collection]||[];for(const op of this.data.queue){if(op.status==='failed')break;if(op.collection===collection)rows=changeRows(rows,op.changes.map(c=>({...c,item:{...c.item,pending:true}})));}return rows;}
 async refresh(){if(this.busy||!this.active)return;this.busy=true;try{const snapshot=await this.client.snapshot();if(!this.active)return;Object.assign(this.data,snapshot);this.error='';this.persist();}catch(e){this.error=e.message;this.onChange();throw e;}finally{this.busy=false;if(this.requested){this.requested=false;queueMicrotask(()=>this.flush());}}}
 enqueue(collection,changes,label,{delay=0,expected=null}={}){if(!this.active)throw Error('Sign in again.');if(!this.data.household)throw Error('Connect once before making offline household changes.');if(this.data.queue.some(o=>o.status==='failed'))throw Error('Open Sync details to discard the failed changes, then refresh and review.');if(expected&&JSON.stringify(versions(expected))!==JSON.stringify(versions(this.view(collection))))throw Error('Household changed. Refresh and review this operation again.');const op={operationId:crypto.randomUUID(),household:this.data.household.id,collection,changes:structuredClone(changes),expected:expected||versions(this.view(collection)),label,status:'pending',notBefore:Date.now()+delay};this.data.queue.push(op);try{this.persist();}catch(e){this.data.queue.pop();throw e;}return op;}
 saveSettings(settings){this.data.pendingSettings=structuredClone(settings);this.persist();}
 discard(id){const i=this.data.queue.findIndex(o=>o.operationId===id);if(i<0||this.busy)throw Error('Wait for the current sync to finish.');if(this.data.queue[i].attempted&&this.data.queue[i].status!=='failed')throw Error('Retry this operation first to find out whether it reached the server.');/* Later previews depend on this one. */this.data.queue.splice(i);this.persist();}
 async flush(){if(!this.active)return;if(this.busy){this.requested=true;return;}this.busy=true;try{
  while(this.active&&this.data.queue.length){const op=this.data.queue[0];if(op.status==='failed'||op.notBefore>Date.now())break;op.attempted=true;this.persist();let result;try{result=await this.client.apply(op);}catch(e){op.error=e.message;op.status=e.status&&e.status<500&&![401,429].includes(e.status)?'failed':'pending';this.error=e.message;this.persist();break;}
   if(!this.active)return;this.data[op.collection]=changeRows(this.data[op.collection], [...result.removed.map(id=>({item:{id},remove:true})),...result.items.map(item=>({item}))]);this.data.queue.shift();
   // Replace only versions changed by our acknowledged operation; external changes still conflict.
   for(const next of this.data.queue.filter(o=>o.collection===op.collection)){for(const item of result.items){const v=next.expected.find(i=>i.id===item.id);if(v)v.updated_at=item.updated_at;}next.expected=next.expected.filter(i=>!result.removed.includes(i.id));}
   this.error='';this.persist();
  }
  if(this.active&&this.data.pendingSettings){const pending=this.data.pendingSettings;try{await this.client.saveSettings(pending);if(this.data.pendingSettings===pending)delete this.data.pendingSettings;this.persist();}catch(e){this.error=e.message;this.onChange();}}
 }finally{this.busy=false;this.onChange();if(this.requested){this.requested=false;queueMicrotask(()=>this.flush());}}}
 close(){this.active=false;}
}
