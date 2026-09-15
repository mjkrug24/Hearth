// Account-bound durable operations. Retry order is preserved; failures remain reviewable.
export class Outbox{
 constructor(storage=localStorage){this.storage=storage;this.key='hearth-outbox-v1';this.running=false;this.rows=this.read();}
 read(){try{return JSON.parse(this.storage.getItem(this.key))||[];}catch{return [];}}
 persist(){this.storage.setItem(this.key,JSON.stringify(this.rows));}
 add(op){const row={id:crypto.randomUUID(),createdAt:Date.now(),status:'pending',...op};this.rows.push(row);try{this.persist();}catch(e){this.rows.pop();throw e;}return row;}
 remove(id){const old=this.rows;this.rows=this.rows.filter(x=>x.id!==id);try{this.persist();}catch(e){this.rows=old;throw e;}}
 forAccount(account){return this.rows.filter(op=>op.account===account);}
 async flush(account,send,onResult=()=>{}){
  if(this.running)return;this.running=true;
  try{for(const row of [...this.forAccount(account)]){
   if(!this.rows.some(x=>x.id===row.id))continue;
   if(row.notBefore>Date.now()||row.status==='failed')break;
   row.status='sending';this.persist();
   try{const result=await send(row);this.remove(row.id);await onResult(row,result);}
   catch(e){row.status=e.status&&e.status<500&&e.status!==429?'failed':'pending';row.error=e.message;this.persist();break;}
  }}finally{this.running=false;}
 }
}
