import {callbackUrl,storeTokens,cookies,appendCookie,cookieOptions} from '../_lib/google.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const saved=cookies(req);
 for(const name of ['hearth_oauth_state','hearth_oauth_verifier'])appendCookie(res,`${name}=; ${cookieOptions()}; Max-Age=0`);
 try{
  if(!req.query.state||req.query.state!==saved.hearth_oauth_state||!saved.hearth_oauth_verifier)return res.redirect('/?sync=invalid-state');
  if(req.query.error)return res.redirect('/?sync=cancelled');
  if(!req.query.code)return res.redirect('/?sync=failed');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:req.query.code,client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:callbackUrl(),grant_type:'authorization_code',code_verifier:saved.hearth_oauth_verifier})}),token=await r.json();
  if(!r.ok)return res.redirect('/?sync=failed');
  storeTokens(res,{...token,expiry:Date.now()+token.expires_in*1000});res.redirect('/?sync=connected');
 }catch{res.redirect('/?sync=failed');}
}
