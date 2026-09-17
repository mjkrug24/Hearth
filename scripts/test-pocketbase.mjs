import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,cp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const legacyVersion=process.argv.includes('--legacy');
const binary=process.env.HEARTH_PB_BIN||path.join(tmpdir(),'hearth-pocketbase-'+(legacyVersion?'0.19.2':'0.40.4'),'pocketbase.exe');
const dir=await mkdtemp(path.join(tmpdir(),'hearth-integration-'));
const root=process.cwd(),base='http://127.0.0.1:8199';
const migrationDir=path.join(dir,'test-migrations');
await cp(path.join(root,'pocketbase/pb_migrations'),migrationDir,{recursive:true});
await writeFile(path.join(migrationDir,'1750000000_legacy_fixture.js'),`migrate(dbOrApp=>{
 const legacy=typeof dbOrApp.findCollectionByNameOrId!=='function',dao=legacy?new Dao(dbOrApp):null;
 const app=legacy?{findCollectionByNameOrId:name=>dao.findCollectionByNameOrId(name),save:model=>typeof model.collection==='function'?dao.saveRecord(model):dao.saveCollection(model)}:dbOrApp;
 const users=app.findCollectionByNameOrId('users'),user=new Record(users);user.set('email','legacy@example.com');if(legacy)user.set('username','legacytest');user.setPassword('Disposable-test-123');app.save(user);
 const c=new Collection({name:'hearth_items',type:'base'});if(legacy){for(const f of [{name:'user',type:'relation',options:{collectionId:users.id,maxSelect:1}},{name:'client_id',type:'text'},{name:'kind',type:'text'},{name:'name',type:'text'},{name:'details',type:'json'}])c.schema.addField(new SchemaField(f));}else{for(const f of [new RelationField({name:'user',collectionId:users.id,maxSelect:1}),new TextField({name:'client_id'}),new TextField({name:'kind'}),new TextField({name:'name'}),new JSONField({name:'details'})])c.fields.add(f);}app.save(c);
 const item=new Record(c);item.set('user',user.id);item.set('client_id','legacy-rice');item.set('kind','pantry');item.set('name','Rice');item.set('details',{amount:4,unit:'cup',expires:'2026-10-01'});app.save(item);
 const orphan=new Record(c);orphan.set('client_id','orphan');orphan.set('kind','tasks');orphan.set('name','Retained orphan');app.save(orphan);
},()=>{});`);
// Reapplying the additive migration must leave rows and household ownership intact.
await writeFile(path.join(migrationDir,'1789516801_rerun.js'),await readFile(path.join(root,'pocketbase/pb_migrations/1789516800_household_sync.js')));
const proc=spawn(binary,['serve','--http=127.0.0.1:8199',legacyVersion?'--debug=false':'--dev=false','--dir='+dir,'--migrationsDir='+migrationDir,'--hooksDir='+path.join(root,'pocketbase/pb_hooks')],{windowsHide:true});let logs='';proc.stdout.on('data',b=>logs+=b);proc.stderr.on('data',b=>logs+=b);
async function request(route,token,body,expected=200){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:token||''},body:body?JSON.stringify(body):undefined});const t=await r.text();assert.equal(r.status,expected,t);return t?JSON.parse(t):null;}
async function user(email){await request('/api/collections/users/records','',{email,password:'Disposable-test-123',passwordConfirm:'Disposable-test-123'});return request('/api/collections/users/auth-with-password','',{identity:email,password:'Disposable-test-123'});}
try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const a=await user('owner@example.com'),b=await user('partner@example.com'),c=await user('stranger@example.com');
 const snapshot=token=>request('/api/hearth/snapshot',token);
 const legacy=await request('/api/collections/users/auth-with-password','',{identity:'legacy@example.com',password:'Disposable-test-123'}),migrated=await snapshot(legacy.token);
 assert.equal(migrated.items.length,1);assert.equal(migrated.items[0].amount,4);assert.equal(migrated.items[0].expires,'2026-10-01');
 let s=await snapshot(a.token);assert.ok(s.household.id);assert.equal((await snapshot(a.token)).household.id,s.household.id);
 const op={operationId:crypto.randomUUID(),household:s.household.id,collection:'items',expected:[],changes:[{item:{id:'rice',kind:'pantry',name:'Rice',unit:'cup',amount:3}}]};
 const saved=await request('/api/hearth/apply',a.token,op);assert.equal(saved.items[0].amount,3);assert.deepEqual(await request('/api/hearth/apply',a.token,op),saved);assert.equal((await snapshot(a.token)).items.length,1);
 assert.equal((await snapshot(c.token)).items.length,0);assert.equal((await request('/api/collections/hearth_items/records',c.token)).items.length,0);
 await request('/api/collections/hearth_items/records',c.token,{name:'Bypass',kind:'tasks'},403);
 const invite=await request('/api/hearth/invite',a.token,{});await request('/api/hearth/join',b.token,{code:invite.code});assert.equal((await snapshot(b.token)).items[0].name,'Rice');await request('/api/hearth/join',c.token,{code:invite.code},400);
 await request('/api/hearth/apply',a.token,{...op,operationId:crypto.randomUUID()},409);
 s=await snapshot(a.token);const expected=s.items.map(({id,updated_at})=>({id,updated_at}));
 await request('/api/hearth/apply',a.token,{...op,operationId:crypto.randomUUID(),expected,changes:[{item:{id:'rice',kind:'pantry',name:'Rice',amount:1,unit:'cup'}},{item:{id:'bad',kind:'pantry',name:'Bad',amount:-1}}]},400);assert.equal((await snapshot(a.token)).items[0].amount,3);
 await request('/api/hearth/settings',a.token,{theme:'dark',destination:'shopping'});assert.equal((await snapshot(b.token)).settings.theme,undefined);assert.equal((await snapshot(a.token)).settings.destination,undefined);
 await request('/api/hearth/apply',b.token,{...op,operationId:crypto.randomUUID(),expected,changes:[{item:{id:'rice'},remove:true}]});assert.equal((await snapshot(a.token)).items.length,0);
 console.log('PASS: real PocketBase account isolation, membership, transaction rollback, retry receipts, stale snapshots, settings ownership, and empty lists.');
}catch(e){await writeFile(path.join(dir,'test-server.log'),logs);console.error('Server diagnostics:',path.join(dir,'test-server.log'));throw e;}finally{proc.kill();}
