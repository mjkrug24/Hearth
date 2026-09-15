import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('Database migration, atomic rollback, stale previews, receipts, and household isolation',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon; create role authenticated; create role service_role;');
 const migration=await fs.readFile(new URL('../supabase.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 const id=crypto.randomUUID(),item={id,kind:'pantry',name:'Rice',done:false,due:'',quantity:'',details:{amount:10,unit:'cup'}};
 const run=async(changes,expected=null,op=crypto.randomUUID(),home='home')=>(await db.query('select hearth_apply_operation($1,$2,$3,$4::jsonb,$5::jsonb) as result',[home,'owner@example.com',op,JSON.stringify(changes),expected===null?null:JSON.stringify(expected)])).rows[0].result;
 const first=await run([{item}]);assert.equal(first[0].details.amount,10);
 const expected=first.map(i=>({id:i.id,updated_at:i.updated_at})),op=crypto.randomUUID();
 const cooked=await run([{item:{...item,details:{amount:7,unit:'cup'}}}],expected,op);assert.equal(cooked[0].details.amount,7);
 assert.deepEqual(await run([{item:{...item,details:{amount:7,unit:'cup'}}}],expected,op),cooked);
 await assert.rejects(run([{item:{...item,details:{amount:4,unit:'cup'}}}],expected),/STALE_PREVIEW/);
 await assert.rejects(run([{item:{...item,details:{amount:1}}},{item:{...item,id:crypto.randomUUID(),kind:'invalid'}}]),/check constraint/);
 assert.equal((await db.query('select details from hearth_items where id=$1',[id])).rows[0].details.amount,7);
 await run([{item:{...item,name:'Other household'}}],null,crypto.randomUUID(),'other');
 assert.equal((await db.query('select count(*)::int as n from hearth_items')).rows[0].n,2);
 await db.exec('set role anon;');await assert.rejects(db.query('select * from hearth_items'),/permission denied/);await assert.rejects(db.query("select hearth_apply_operation('home','attacker',gen_random_uuid(),'[]',null)"),/permission denied/);await db.exec('reset role;');
 }finally{await db.close();}
});
