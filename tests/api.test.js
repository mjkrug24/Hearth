import test from 'node:test';
import assert from 'node:assert/strict';
import {eventToGoogle,storeTokens,tokens,allPages} from '../api/_lib/google.js';
import handler from '../api/google/events/index.js';
import household from '../api/household.js';
process.env.APP_BASE_URL='https://example.test';
process.env.TOKEN_ENCRYPTION_KEY='only-a-test-key';
function response(){const headers={};return {headers,statusCode:200,setHeader(k,v){headers[k]=v;},getHeader(k){return headers[k];},status(n){this.statusCode=n;return this;},json(x){this.data=x;},end(){}};}
test('Timed writes retain a real instant and empty fields clear old text',()=>{const e=eventToGoogle({title:'Work',startDateTime:'2026-09-15T08:00:00-05:00',endDateTime:'2026-09-15T17:00:00-05:00',reminder:'30'});assert.equal(e.start.dateTime,'2026-09-15T13:00:00.000Z');assert.equal(e.location,'');assert.equal(e.reminders.overrides[0].minutes,30);});
test('Reject negative durations',()=>assert.throws(()=>eventToGoogle({title:'Wrong',startDateTime:'2026-09-15T18:00Z',endDateTime:'2026-09-15T17:00Z'})));
test('Encrypted cookie round trips and rejects tampering',()=>{const res=response();storeTokens(res,{access_token:'fake',refresh_token:'fake-refresh',expiry:Date.now()+100000});const cookie=res.headers['Set-Cookie'][0].split(';')[0];assert.equal(tokens({headers:{cookie}}).refresh_token,'fake-refresh');assert.equal(tokens({headers:{cookie:cookie+'a'}}),null);assert(!cookie.includes('fake-refresh'));});
test('Pagination does not lose events after the first page',async()=>{const original=global.fetch;const req={headers:{},googleAccess:Promise.resolve('fake')};let calls=0;global.fetch=async url=>{calls++;return new Response(JSON.stringify(url.includes('pageToken=')?{items:[{id:2}]}:{items:[{id:1}],nextPageToken:'next'}));};try{assert.equal((await allPages(req,response(),'/calendars/test/events?maxResults=1')).length,2);assert.equal(calls,2);}finally{global.fetch=original;}});
test('Updates use PATCH on the original calendar with conflict protection',async()=>{const original=global.fetch;let captured;global.fetch=async(url,options)=>{captured={url,options};return new Response(JSON.stringify({id:'event',summary:'Changed',start:{date:'2026-09-15'},end:{date:'2026-09-16'}}));};try{const res=response();await handler({method:'POST',headers:{origin:'https://example.test'},query:{},googleAccess:Promise.resolve('fake'),body:{title:'Changed',googleCalendarId:'other@example.com',googleEventId:'event',etag:'old',allDay:true,date:'2026-09-15',endDate:'2026-09-16'}},res);assert.equal(res.statusCode,200);assert(captured.url.includes('other%40example.com'));assert.equal(captured.options.method,'PATCH');assert.equal(captured.options.headers['If-Match'],'old');}finally{global.fetch=original;}});
test('Cross-site mutation is rejected before Google is called',async()=>{const res=response();await handler({method:'POST',headers:{origin:'https://untrusted.test'},query:{}},res);assert.equal(res.statusCode,403);});
test('Household denies nonmembers and never sends them database rows',async()=>{const original=global.fetch;process.env.SUPABASE_URL='https://database.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';process.env.HOUSEHOLD_MEMBERS='owner@example.com,partner@example.com';const calls=[];global.fetch=async url=>{calls.push(url);return new Response(JSON.stringify({id:'stranger@example.com'}));};try{const res=response();await household({method:'GET',headers:{},googleAccess:Promise.resolve('fake')},res);assert.equal(res.data.shared,false);assert(calls.every(url=>!url.includes('database.test')));}finally{global.fetch=original;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.HOUSEHOLD_MEMBERS;}});
test('Household edits write one row into the configured household',async()=>{const original=global.fetch;process.env.SUPABASE_URL='https://database.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';process.env.HOUSEHOLD_MEMBERS='owner@example.com,partner@example.com';let payload;global.fetch=async(url,options={})=>{if(url.includes('googleapis'))return new Response(JSON.stringify({id:'partner@example.com'}));if(!options.method||options.method==='GET')return new Response(JSON.stringify([]));payload=JSON.parse(options.body);return new Response(JSON.stringify(payload.p_changes.map(c=>({...c.item,household:payload.p_household}))));};try{const res=response();await household({method:'POST',headers:{origin:'https://example.test'},googleAccess:Promise.resolve('fake'),body:{id:'d247d892-f015-4a79-ab23-d6cd0dce9669',kind:'tasks',name:'Test task',household:'attacker-supplied'}},res);assert.equal(res.statusCode,200);assert.equal(payload.p_household,'home');assert.equal(payload.p_changes[0].item.name,'Test task');}finally{global.fetch=original;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.HOUSEHOLD_MEMBERS;}});

test('Google-PocketBase password derivation is deterministic, case-insensitive, and distinct per account', async () => {
  const {derivePocketBasePassword} = await import('../api/google/pocketbase.js');
  const p1 = derivePocketBasePassword('user@example.com', 'test-secret');
  const p2 = derivePocketBasePassword('USER@EXAMPLE.COM', 'test-secret');
  const p3 = derivePocketBasePassword('other@example.com', 'test-secret');
  assert.equal(p1, p2);
  assert.notEqual(p1, p3);
  assert(p1.length >= 20);
  assert(/[A-Z]/.test(p1) && /[a-z]/.test(p1) && /\d/.test(p1) && /[^A-Za-z0-9]/.test(p1));
});

test('Google-PocketBase bridge authenticates existing user or registers new user', async () => {
  const {default: pbBridge} = await import('../api/google/pocketbase.js');
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    if (url.includes('googleapis.com')) {
      return new Response(JSON.stringify({ id: 'family@google.com' }));
    }
    if (url.includes('/api/collections/users/auth-with-password')) {
      return new Response(JSON.stringify({ token: 'pb-auth-token-123', record: { id: 'usr-1', email: 'family@google.com' } }));
    }
    return new Response(JSON.stringify({}), { status: 404 });
  };
  try {
    const res = response();
    await pbBridge({
      method: 'POST',
      headers: { origin: 'https://example.test' },
      googleAccess: Promise.resolve('fake-token'),
      body: { pbUrl: 'https://pb.test' }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.token, 'pb-auth-token-123');
    assert.equal(res.data.record.email, 'family@google.com');
  } finally {
    global.fetch = original;
  }
});

