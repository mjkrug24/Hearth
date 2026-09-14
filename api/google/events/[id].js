import { google,json } from '../../_lib/google.js';
export default async function handler(req,res){try{if(req.method!=='DELETE')return json(res,405,{error:'Method not allowed'});await google(req,res,`/calendars/${encodeURIComponent(req.query.calendar||'primary')}/events/${encodeURIComponent(req.query.id)}`,{method:'DELETE'});res.status(204).end()}catch(e){json(res,500,{error:e.message})}}
