import test from 'node:test';
import assert from 'node:assert/strict';
import {PocketBaseClient} from '../pocketbase.js';

test('Full list pagination and changing servers do not lose rows or reuse credentials',async()=>{
 const original=globalThis.fetch,client=new PocketBaseClient();let calls=0;
 try{client.auth={token:'old-server-token',record:{id:'user'}};client.setUrl('https://another.example');assert.equal(client.isAuthenticated(),false);
 globalThis.fetch=async(url,options)=>{assert.equal(options.headers.Authorization,undefined);calls++;return {ok:true,status:200,json:async()=>({totalPages:2,items:[{id:new URL(url).searchParams.get('page')}]})};};
 assert.deepEqual((await client.getFullList('hearth_items')).map(i=>i.id),['1','2']);assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});

// In-memory mock storage
class MockStorage {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.get(k) ?? null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
}

test('PocketBase client URL management and initial state', () => {
  const client = new PocketBaseClient();
  assert.equal(client.isAuthenticated(), false);
  assert.equal(client.user(), null);
  assert.equal(client.getAuth(), null);

  client.setUrl('http://192.168.1.50:8090/');
  assert.equal(client.getUrl(), 'http://192.168.1.50:8090');

  client.setUrl('https://pb.example.com///');
  assert.equal(client.getUrl(), 'https://pb.example.com');
});

test('PocketBase auth lifecycle: login, register, and logout', async () => {
  const requests = [];
  const origFetch = globalThis.fetch;
  const mockStorage = new MockStorage();
  globalThis.localStorage = mockStorage;

  globalThis.fetch = async (url, opts) => {
    requests.push({ url, ...opts });
    if (url.includes('/api/collections/users/auth-with-password')) {
      const body = JSON.parse(opts.body);
      if (body.identity === 'test@example.com' && body.password === 'secret123') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ token: 'mock-jwt-token', record: { id: 'user-1', email: 'test@example.com' } })
        };
      }
      return {
        ok: false,
        status: 400,
        json: async () => ({ message: 'Failed to authenticate.' })
      };
    }
    if (url.includes('/api/collections/users/records')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'user-1', email: 'test@example.com' })
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  try {
    const client = new PocketBaseClient();
    client.setUrl('http://localhost:8090');

    // Failed login
    await assert.rejects(
      async () => client.login('bad@example.com', 'wrong'),
      /Failed to authenticate/
    );
    assert.equal(client.isAuthenticated(), false);

    // Successful login
    const auth = await client.login('test@example.com', 'secret123');
    assert.equal(auth.token, 'mock-jwt-token');
    assert.equal(client.isAuthenticated(), true);
    assert.equal(client.user().email, 'test@example.com');

    // Logout
    client.logout();
    assert.equal(client.isAuthenticated(), false);
    assert.equal(client.user(), null);

    // Register calls create then login
    const regAuth = await client.register('test@example.com', 'secret123');
    assert.equal(regAuth.token, 'mock-jwt-token');
    assert.equal(client.isAuthenticated(), true);

    // setAuth helper persists credentials and connects
    client.setAuth('direct-token', { id: 'user-2', email: 'google-user@example.com' });
    assert.equal(client.isAuthenticated(), true);
    assert.equal(client.user().email, 'google-user@example.com');
    assert.equal(JSON.parse(mockStorage.getItem('hearth-pb-auth')).token, 'direct-token');

    // setAuth with object payload
    client.setAuth({ token: 'obj-token', record: { id: 'user-3', email: 'obj@example.com' } });
    assert.equal(client.user().id, 'user-3');
    assert.equal(client.isAuthenticated(), true);

    // setAuth with null clears
    client.setAuth(null);
    assert.equal(client.isAuthenticated(), false);
    assert.equal(client.user(), null);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('PocketBase CRUD helpers attach Authorization header and handle responses', async () => {
  const requests = [];
  const origFetch = globalThis.fetch;

  globalThis.fetch = async (url, opts) => {
    requests.push({ url, ...opts });
    if (opts.method === 'DELETE') {
      return { ok: true, status: 204 };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ items: [{ id: 'rec-1', name: 'Eggs' }], id: 'rec-new', ...JSON.parse(opts.body || '{}') })
    };
  };

  try {
    const client = new PocketBaseClient();
    client.setUrl('http://localhost:8090');
    client.auth = { token: 'auth-token-xyz', record: { id: 'usr-1' } };

    // getFullList
    const list = await client.getFullList('hearth_items', { filter: 'kind="groceries"' });
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Eggs');
    assert.ok(requests[0].headers.Authorization === 'auth-token-xyz');
    assert.ok(requests[0].url.includes('perPage=500'));

    // create
    const created = await client.create('hearth_items', { name: 'Milk', kind: 'groceries' });
    assert.equal(created.name, 'Milk');
    assert.equal(requests[1].method, 'POST');

    // update
    const updated = await client.update('hearth_items', 'rec-1', { done: true });
    assert.equal(updated.done, true);
    assert.equal(requests[2].method, 'PATCH');
    assert.ok(requests[2].url.includes('/records/rec-1'));

    // delete
    const delRes = await client.delete('hearth_items', 'rec-1');
    assert.equal(delRes, null);
    assert.equal(requests[3].method, 'DELETE');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('PocketBase typed Hearth methods: fetchSettings, saveSettings, fetchItems, fetchEvents', async () => {
  const records = { hearth_settings: [], hearth_items: [], hearth_events: [] };
  const origFetch = globalThis.fetch;

  globalThis.fetch = async (url, opts) => {
    if(url.endsWith('/api/hearth/settings')){records.hearth_settings=[{id:'settings',user:'user-123',settings:JSON.parse(opts.body)}];return {ok:true,status:200,json:async()=>records.hearth_settings[0]};}
    const colMatch = url.match(/\/api\/collections\/([^/?]+)/);
    const col = colMatch?.[1];
    if (opts.method === 'POST') {
      const rec = { id: 'id-' + Date.now(), ...JSON.parse(opts.body) };
      records[col].push(rec);
      return { ok: true, status: 200, json: async () => rec };
    }
    if (opts.method === 'PATCH') {
      const idMatch = url.match(/\/records\/([^?]+)/);
      const rec = records[col].find(r => r.id === idMatch[1]);
      Object.assign(rec, JSON.parse(opts.body));
      return { ok: true, status: 200, json: async () => rec };
    }
    return { ok: true, status: 200, json: async () => ({ items: records[col] || [] }) };
  };

  try {
    const client = new PocketBaseClient();
    client.setUrl('http://localhost:8090');
    client.auth = { token: 'tok', record: { id: 'user-123' } };

    // Initially no settings
    const initialSettings = await client.fetchSettings();
    assert.equal(initialSettings, null);

    // Save settings (creates new record)
    await client.saveSettings({ theme: 'dark', view: 'week' });
    const saved = await client.fetchSettings();
    assert.ok(saved);
    assert.equal(saved.settings.theme, 'dark');
    assert.equal(saved.settings.view, 'week');

    // Save settings again (updates existing record)
    await client.saveSettings({ theme: 'light', view: 'month' });
    const updated = await client.fetchSettings();
    assert.equal(updated.settings.theme, 'light');
    assert.equal(records.hearth_settings.length, 1);

    // Items and Events
    records.hearth_items.push({ id: 'i1', name: 'Task 1', kind: 'tasks' });
    records.hearth_events.push({ id: 'e1', title: 'Doctor', date: '2026-09-20' });

    const items = await client.fetchItems();
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'Task 1');

    const events = await client.fetchEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].title, 'Doctor');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('PocketBase pub/sub listener dispatching and unsubscription', () => {
  const client = new PocketBaseClient();
  const receivedItems = [];
  const receivedWildcard = [];

  const unsubItems = client.subscribe('hearth_items', payload => receivedItems.push(payload));
  const unsubWildcard = client.subscribe('*', payload => receivedWildcard.push(payload));

  client.notify('hearth_items', { action: 'create', record: { id: '1', name: 'Apples' } });
  client.notify('hearth_events', { action: 'create', record: { id: '2', title: 'Dentist' } });

  assert.equal(receivedItems.length, 1);
  assert.equal(receivedItems[0].record.name, 'Apples');

  assert.equal(receivedWildcard.length, 2);

  // Unsubscribe items
  unsubItems();
  client.notify('hearth_items', { action: 'update', record: { id: '1', name: 'Bananas' } });

  assert.equal(receivedItems.length, 1); // Not called again
  assert.equal(receivedWildcard.length, 3); // Wildcard still called

  unsubWildcard();
});
