// Keep the same Hearth API on PocketBase 0.19.2 and current releases.
function legacyApp(dao){
 return {
  findCollectionByNameOrId:name=>dao.findCollectionByNameOrId(name),
  findRecordById:(collection,id)=>dao.findRecordById(collection,id),
  findRecordsByFilter:(...args)=>dao.findRecordsByFilter(...args),
  save:record=>dao.saveRecord(record),
  delete:record=>dao.deleteRecord(record),
  runInTransaction:callback=>dao.runInTransaction(tx=>callback(legacyApp(tx)))
 };
}
module.exports.context=c=>{
 if(typeof $apis.requireAuth==='function')return c;
 return {app:legacyApp($app.dao()),auth:c.get('authRecord'),requestInfo:()=>({body:$apis.requestInfo(c).data}),json:(status,data)=>c.json(status,data)};
};
