import handler from '../household.js';
export default async function batch(req,res){if(req.method!=='POST'||!Array.isArray(req.body?.changes)){res.statusCode=400;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({error:'A batch requires POST with changes.'}));}return handler(req,res);}
