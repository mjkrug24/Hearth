import crypto from 'node:crypto';
import {guard,tokens,google,json,failure} from '../_lib/google.js';

export function derivePocketBasePassword(email, secret){
  if(!secret)throw failure('TOKEN_ENCRYPTION_KEY is required to derive credentials.', 500);
  const hmac=crypto.createHmac('sha256', secret);
  hmac.update('hearth:pb:v1:'+email.trim().toLowerCase());
  return hmac.digest('base64url')+'!Aa1';
}

export default async function handler(req, res){
  try{
    guard(req, res);
    if(req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const token = tokens(req);
    if(!token && !req.googleAccess) throw failure('Please sign in with Google.', 401);

    // Retrieve verified Google primary account email
    const primaryCal = await google(req, res, '/calendars/primary');
    const email = primaryCal?.id?.trim().toLowerCase();
    if(!email || !/^\S+@\S+\.\S+$/.test(email)){
      throw failure('Could not determine verified Google account email.', 400);
    }

    // Target PocketBase URL (default: https://ebook.krugcloud.com)
    let pbUrl = (req.body?.pbUrl || process.env.POCKETBASE_URL || 'https://ebook.krugcloud.com').trim().replace(/\/+$/, '').replace(/\/_+$/, '');
    if(!/^https?:\/\//i.test(pbUrl)){
      const isHttps = req.headers['x-forwarded-proto'] === 'https' || (process.env.APP_BASE_URL || '').startsWith('https');
      pbUrl = (isHttps ? 'https://' : 'http://') + pbUrl;
    }

    const secret = process.env.TOKEN_ENCRYPTION_KEY;
    const derivedPassword = derivePocketBasePassword(email, secret);

    // 1. Attempt login with derived credentials
    let authRes;
    try {
      authRes = await fetch(`${pbUrl}/api/collections/users/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: email, password: derivedPassword })
      });
    } catch {
      throw failure('Could not reach PocketBase server at ' + pbUrl, 502);
    }

    if(authRes.ok){
      const data = await authRes.json();
      return json(res, 200, { token: data.token, record: data.record });
    }

    // 2. If 400 (not found or wrong password), try registering new user with derived password
    if(authRes.status === 400){
      let regRes;
      try {
        regRes = await fetch(`${pbUrl}/api/collections/users/records`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password: derivedPassword,
            passwordConfirm: derivedPassword,
            name: email.split('@')[0]
          })
        });
      } catch {
        throw failure('Could not reach PocketBase server at ' + pbUrl, 502);
      }

      if(regRes.ok){
        // Registered! Now authenticate to obtain the JWT token and record
        const loginRes = await fetch(`${pbUrl}/api/collections/users/auth-with-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identity: email, password: derivedPassword })
        });
        if(loginRes.ok){
          const data = await loginRes.json();
          return json(res, 200, { token: data.token, record: data.record });
        }
      } else {
        const regData = await regRes.json().catch(() => ({}));
        // If registration fails with validation error on email, user exists with manual password
        if(regData.data?.email || regRes.status === 400){
          return json(res, 409, {
            collision: true,
            email,
            error: 'An account with this email already exists on PocketBase with a custom password.'
          });
        }
      }
    }

    const errData = await authRes.json().catch(() => ({}));
    throw failure(errData.message || 'PocketBase authentication failed.', authRes.status || 500);
  }catch(e){
    return json(res, e.status || 500, { error: e.message });
  }
}
