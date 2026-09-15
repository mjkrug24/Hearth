import crypto from 'node:crypto';
import {callbackUrl,configured,cookieOptions,appendCookie} from '../_lib/google.js';
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!configured())return res.redirect('/?sync=configuration-required');
 const state=crypto.randomBytes(24).toString('base64url'),verifier=crypto.randomBytes(32).toString('base64url');
 appendCookie(res,`hearth_oauth_state=${state}; ${cookieOptions()}; Max-Age=600`);
 appendCookie(res,`hearth_oauth_verifier=${verifier}; ${cookieOptions()}; Max-Age=600`);
 const query=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:callbackUrl(),response_type:'code',scope:'https://www.googleapis.com/auth/calendar',access_type:'offline',prompt:'consent',state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
 res.redirect('https://accounts.google.com/o/oauth2/v2/auth?'+query);
}
