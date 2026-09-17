const hearthAuth=typeof $apis.requireAuth==='function'?$apis.requireAuth('users'):$apis.requireRecordAuth('users');
routerAdd('GET','/api/hearth/snapshot',e=>require(__hooks+'/hearth.js').snapshot(require(__hooks+'/compat.js').context(e)),hearthAuth);
routerAdd('POST','/api/hearth/apply',e=>require(__hooks+'/hearth.js').apply(require(__hooks+'/compat.js').context(e)),hearthAuth);
routerAdd('POST','/api/hearth/settings',e=>require(__hooks+'/hearth.js').settings(require(__hooks+'/compat.js').context(e)),hearthAuth);
routerAdd('POST','/api/hearth/invite',e=>require(__hooks+'/hearth.js').invite(require(__hooks+'/compat.js').context(e)),hearthAuth);
routerAdd('POST','/api/hearth/join',e=>require(__hooks+'/hearth.js').join(require(__hooks+'/compat.js').context(e)),hearthAuth);
