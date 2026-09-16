routerAdd('GET','/api/hearth/snapshot',e=>require(__hooks+'/hearth.js').snapshot(e),$apis.requireAuth('users'));
routerAdd('POST','/api/hearth/apply',e=>require(__hooks+'/hearth.js').apply(e),$apis.requireAuth('users'));
routerAdd('POST','/api/hearth/settings',e=>require(__hooks+'/hearth.js').settings(e),$apis.requireAuth('users'));
routerAdd('POST','/api/hearth/invite',e=>require(__hooks+'/hearth.js').invite(e),$apis.requireAuth('users'));
routerAdd('POST','/api/hearth/join',e=>require(__hooks+'/hearth.js').join(e),$apis.requireAuth('users'));
