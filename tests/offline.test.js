import test from 'node:test';
import assert from 'node:assert/strict';
import {Outbox} from '../offline.js';

const key='hearth-outbox-v1';
function memoryStorage(){const data={};return {data,getItem:k=>Object.prototype.hasOwnProperty.call(data,k)?data[k]:null,setItem:(k,v)=>{data[k]=v;}};}
const op=extra=>({type:'event',action:'upsert',item:{id:'e1',title:'Event'},account:'me',...extra});

test('add persists a pending row and remove drops it',()=>{
 const storage=memoryStorage(),outbox=new Outbox(storage);
 const row=outbox.add(op());
 assert.equal(row.status,'pending');
 assert.equal(outbox.rows.length,1);
 assert.equal(JSON.parse(storage.data[key]).length,1);
 outbox.remove(row.id);
 assert.equal(outbox.rows.length,0);
 assert.equal(JSON.parse(storage.data[key]).length,0);
});

test('persist bumps a revision so caches can detect changes',()=>{
 const outbox=new Outbox(memoryStorage());
 const before=outbox.revision;
 outbox.add(op());
 assert.equal(outbox.revision>before,true);
});

test('forAccount isolates operations per account',()=>{
 const outbox=new Outbox(memoryStorage());
 outbox.add(op({account:'a'}));
 outbox.add(op({account:'b'}));
 assert.deepEqual(outbox.forAccount('a').map(o=>o.account),['a']);
 assert.equal(outbox.rows.length,2);
});

test('add rolls back when storage rejects the write',()=>{
 const storage=memoryStorage();let reject=true;
 const outbox=new Outbox({getItem:storage.getItem,setItem:(k,v)=>{if(reject)throw new Error('quota');storage.setItem(k,v);}});
 assert.throws(()=>outbox.add(op()));
 assert.equal(outbox.rows.length,0);
});

test('flush sends in order and removes completed operations',async()=>{
 const outbox=new Outbox(memoryStorage());
 outbox.add(op({item:{id:'e1'}}));
 outbox.add(op({item:{id:'e2'}}));
 const sent=[];
 await outbox.flush('me',async row=>{sent.push(row.item.id);return {ok:true};});
 assert.deepEqual(sent,['e1','e2']);
 assert.equal(outbox.rows.length,0);
});

test('flush stops at a permanent failure and leaves later work pending',async()=>{
 const outbox=new Outbox(memoryStorage());
 outbox.add(op({item:{id:'e1'}}));
 outbox.add(op({item:{id:'e2'}}));
 await outbox.flush('me',async row=>{if(row.item.id==='e1')throw Object.assign(new Error('bad request'),{status:400});return {};});
 assert.equal(outbox.rows.length,2);
 assert.equal(outbox.rows[0].status,'failed');
 assert.equal(outbox.rows[0].error,'bad request');
 assert.equal(outbox.rows[1].status,'pending');
});

test('flush retries a server error instead of marking it failed',async()=>{
 const outbox=new Outbox(memoryStorage());
 outbox.add(op({item:{id:'e1'}}));
 await outbox.flush('me',async()=>{throw Object.assign(new Error('boom'),{status:500});});
 assert.equal(outbox.rows[0].status,'pending');
});

test('flush skips operations held back by notBefore',async()=>{
 const outbox=new Outbox(memoryStorage());
 outbox.add(op({item:{id:'e1'},notBefore:Date.now()+60000}));
 let called=false;
 await outbox.flush('me',async()=>{called=true;return {};});
 assert.equal(called,false);
 assert.equal(outbox.rows.length,1);
});

test('a completed flush reports results back to the caller',async()=>{
 const outbox=new Outbox(memoryStorage());
 outbox.add(op({item:{id:'e1'}}));
 const results=[];
 await outbox.flush('me',async()=>({saved:true}),async(row,result)=>{results.push([row.item.id,result.saved]);});
 assert.deepEqual(results,[['e1',true]]);
 assert.equal(outbox.rows.length,0);
});
