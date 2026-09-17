// PocketBase lightweight client for Hearth (auth, CRUD, real-time SSE sync)

const STORAGE_URL = 'hearth-pb-url';
const STORAGE_AUTH = 'hearth-pb-auth';

function getStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {}
  return null;
}

function readJson(key, fallback = null) {
  try {
    const storage = getStorage();
    if (!storage) return fallback;
    return JSON.parse(storage.getItem(key)) ?? fallback;
  } catch { return fallback; }
}

function writeJson(key, val) {
  try {
    const storage = getStorage();
    if (storage) storage.setItem(key, JSON.stringify(val));
  } catch {}
}

export class PocketBaseClient {
  constructor() {
    this.listeners = new Map(); // topic -> Set(callbacks)
    this.sse = null;
    this.clientId = null;
    let defaultUrl = 'https://ebook.krugcloud.com';
    try {
      if (typeof location !== 'undefined') {
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
          defaultUrl = 'http://localhost:8090';
        }
      }
    } catch {}
    const storage = getStorage();
    this.url = (storage ? storage.getItem(STORAGE_URL) : null) || defaultUrl;
    this.auth = readJson(STORAGE_AUTH, null);
  }

  getUrl() {
    let u = (this.url || '').trim().replace(/\/+$/, '');
    if (u && !/^https?:\/\//i.test(u)) {
      const isHttps = typeof location !== 'undefined' && location.protocol === 'https:';
      u = (isHttps ? 'https://' : 'http://') + u;
    }
    // Strip trailing /_ or /_/ from admin UI copy-paste
    u = u.replace(/\/_+$/, '');
    return u;
  }

  setUrl(newUrl) {
    let clean = (newUrl || '').trim().replace(/\/+$/, '');
    if (clean && !/^https?:\/\//i.test(clean)) {
      const isHttps = typeof location !== 'undefined' && location.protocol === 'https:';
      clean = (isHttps ? 'https://' : 'http://') + clean;
    }
    clean = clean.replace(/\/_+$/, '');
    if(clean!==this.getUrl())this.logout();
    this.url = clean;
    const storage = getStorage();
    if (storage) storage.setItem(STORAGE_URL, this.url);
    if (this.sse) {
      this.disconnectRealtime();
      if (this.isAuthenticated()) this.connectRealtime();
    }
  }

  getAuth() {
    return this.auth;
  }

  isAuthenticated() {
    return !!(this.auth && this.auth.token);
  }

  user() {
    return this.auth?.record || null;
  }

  async request(path, options = {}) {
    const directUrl = this.getUrl() + path;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (this.auth?.token) {
      headers['Authorization'] = this.auth.token;
    }

    const res = await fetch(directUrl, { ...options, headers });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.message || data.error || (data.data && Object.values(data.data).map(v => v?.message).join(', ')) || `PocketBase error (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async login(email, password) {
    const data = await this.request('/api/collections/users/auth-with-password', {
      method: 'POST',
      body: JSON.stringify({ identity: email.trim(), password })
    });
    this.auth = { token: data.token, record: data.record };
    writeJson(STORAGE_AUTH, this.auth);
    this.connectRealtime();
    return this.auth;
  }

  async register(email, password) {
    await this.request('/api/collections/users/records', {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim(),
        password,
        passwordConfirm: password
      })
    });
    return this.login(email, password);
  }

  logout() {
    this.disconnectRealtime();
    this.auth = null;
    const storage = getStorage();
    if (storage) storage.removeItem(STORAGE_AUTH);
  }

  // --- Generic Collection Helpers ---

  async getFullList(collection, query = {}) {
    const items=[];let page=1,totalPages=1;
    do {
      const params=new URLSearchParams({perPage:'500',...query,page:String(page)});
      const res=await this.request('/api/collections/'+encodeURIComponent(collection)+'/records?'+params);
      items.push(...(res.items||[]));totalPages=res.totalPages||1;page++;
    }while(page<=totalPages);
    return items;
  }

  async create(collection, record) {
    return this.request(`/api/collections/${encodeURIComponent(collection)}/records`, {
      method: 'POST',
      body: JSON.stringify(record)
    });
  }

  async update(collection, id, record) {
    return this.request(`/api/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(record)
    });
  }

  async delete(collection, id) {
    return this.request(`/api/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  }

  // --- Real-time SSE Subscriptions ---

  connectRealtime() {
    if (this.sse || typeof EventSource === 'undefined') return;
    try {
      // Connect to SSE directly
      const sseUrl = this.getUrl() + '/api/realtime';
      this.sse = new EventSource(sseUrl);
      this.sse.addEventListener('PB_CONNECT', async e => {
        try {
          const data = JSON.parse(e.data);
          this.clientId = data.clientId;
          await this.submitSubscriptions();
        } catch (err) {
          console.warn('PocketBase realtime connect error:', err);
        }
      });

      for(const topic of ['hearth_settings','hearth_items','hearth_events','hearth_households'])this.sse.addEventListener(topic+'/*',e=>{try{this.notify(topic,JSON.parse(e.data));}catch{}});
      this.sse.onmessage = e => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.action && payload.record) {
            this.notify(payload.record?.collectionName || '*', payload);
          }
        } catch {}
      };

      this.sse.onerror = () => {
        this.clientId = null;
      };
    } catch (err) {
      console.warn('PocketBase realtime unavailable:', err);
    }
  }

  disconnectRealtime() {
    if (this.sse) {
      this.sse.close();
      this.sse = null;
      this.clientId = null;
    }
  }

  async submitSubscriptions() {
    if (!this.clientId) return;
    const subs = ['hearth_settings/*', 'hearth_items/*', 'hearth_events/*', 'hearth_households/*'];
    await this.request('/api/realtime', {
      method: 'POST',
      body: JSON.stringify({
        clientId: this.clientId,
        subscriptions: subs
      })
    }).catch(() => {});
  }

  subscribe(topic, callback) {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, new Set());
    }
    this.listeners.get(topic).add(callback);
    if (this.isAuthenticated() && !this.sse) {
      this.connectRealtime();
    }
    return () => this.unsubscribe(topic, callback);
  }

  unsubscribe(topic, callback) {
    const set = this.listeners.get(topic);
    if (set) {
      set.delete(callback);
      if (!set.size) this.listeners.delete(topic);
    }
  }

  notify(topic, payload) {
    const callbacks = this.listeners.get(topic);
    if (callbacks) {
      for (const cb of callbacks) {
        try { cb(payload); } catch (err) { console.error('PocketBase listener error:', err); }
      }
    }
    const wildcard = this.listeners.get('*');
    if (wildcard) {
      for (const cb of wildcard) {
        try { cb(payload); } catch (err) { console.error('PocketBase wildcard listener error:', err); }
      }
    }
  }

  // --- Hearth-specific Methods ---

  async fetchSettings() {
    const userId = this.user()?.id;
    const filter = userId ? `user = "${userId}"` : '';
    const list = await this.getFullList('hearth_settings', { filter, sort: '-created' });
    return list[0] || null;
  }

  saveSettings(settingsPayload) { return this.request('/api/hearth/settings',{method:'POST',body:JSON.stringify(settingsPayload)}); }
  snapshot(){return this.request('/api/hearth/snapshot');}
  apply(operation){return this.request('/api/hearth/apply',{method:'POST',body:JSON.stringify(operation)});}
  invite(){return this.request('/api/hearth/invite',{method:'POST',body:'{}'});}
  join(code){return this.request('/api/hearth/join',{method:'POST',body:JSON.stringify({code})});}
  resetPassword(email){return this.request('/api/collections/users/request-password-reset',{method:'POST',body:JSON.stringify({email:email.trim()})});}

  async fetchItems() {
    return this.getFullList('hearth_items', { sort: 'name' });
  }

  async fetchEvents() {
    const userId = this.user()?.id;
    const filter = userId ? `user = "${userId}"` : '';
    return this.getFullList('hearth_events', { filter, sort: 'date' });
  }
}

export const pb = new PocketBaseClient();
