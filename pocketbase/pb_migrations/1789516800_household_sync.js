// PocketBase 0.19.2 and 0.40.4: preserve existing rows and restrict Hearth collections.
migrate((dbOrApp) => {
  const legacy=typeof dbOrApp.findCollectionByNameOrId!=='function';
  const dao=legacy?new Dao(dbOrApp):null;
  const app=legacy?{
    findCollectionByNameOrId:name=>dao.findCollectionByNameOrId(name),
    findAllRecords:name=>dao.findRecordsByFilter(name,'id != ""','',0,0),
    save:model=>typeof model.collection==='function'?dao.saveRecord(model):dao.saveCollection(model)
  }:dbOrApp;
  function field(type,config){
    if(legacy){const {name,required=false,...options}=config;return new SchemaField({name,type,required,options});}
    const constructors={text:TextField,relation:RelationField,json:JSONField,bool:BoolField,date:DateField,number:NumberField};
    return new constructors[type](config);
  }
  const users = app.findCollectionByNameOrId('users');
  function collection(name, fields, readRule, indexes = []) {
    let c;
    try { c = app.findCollectionByNameOrId(name); }
    catch { c = new Collection({name, type: 'base'}); }
    for (const field of fields) {if(legacy){if(!c.schema.getFieldByName(field.name))c.schema.addField(field);}else if(!c.fields.getByName(field.name))c.fields.add(field);}
    if(!legacy)for (const name of ['created', 'updated']) if (!c.fields.getByName(name)) c.fields.add(new AutodateField({name, onCreate: true, onUpdate: name === 'updated'}));
    c.listRule = c.viewRule = readRule;
    c.createRule = c.updateRule = c.deleteRule = null;
    c.indexes = [...c.indexes, ...indexes.filter(i => !c.indexes.includes(i))];
    app.save(c); return c;
  }
  const homes = collection('hearth_households', [
    field('text',{name:'name', required:true, max:100}),
    field('relation',{name:'members', collectionId:users.id, maxSelect:100}),
    field('relation',{name:'owner', collectionId:users.id, maxSelect:1})
  ], 'members.id ?= @request.auth.id && @request.auth.id != ""');
  const owner = '@request.auth.id != "" && user = @request.auth.id';
  const common = () => [field('text',{name:'client_id',max:200}), field('text',{name:'version',max:40}), field('json',{name:'data',maxSize:2000000}), field('relation',{name:'user',collectionId:users.id,maxSelect:1})];
  collection('hearth_items', [...common(),field('relation',{name:'household',collectionId:homes.id,maxSelect:1}),field('text',{name:'kind',max:20}),field('text',{name:'name',max:200}),field('json',{name:'details'}),field('bool',{name:'done'}),field('text',{name:'due'}),field('text',{name:'quantity'}),field('text',{name:'assignedTo'})], '@request.auth.id != "" && household.members.id ?= @request.auth.id');
  collection('hearth_events', [...common(),field('text',{name:'title',max:500}),field('text',{name:'date'}),field('text',{name:'endDate'}),field('text',{name:'time'}),field('text',{name:'end'}),field('bool',{name:'allDay'}),field('text',{name:'location'}),field('text',{name:'notes'}),field('text',{name:'repeat'}),field('number',{name:'repeatCount'}),field('text',{name:'reminder'}),field('text',{name:'timeZone'})],owner);
  collection('hearth_settings',[field('relation',{name:'user',collectionId:users.id,maxSelect:1}),field('json',{name:'settings',maxSize:2000000})],owner);
  collection('hearth_operations',[field('text',{name:'scope',required:true}),field('text',{name:'operation',required:true}),field('json',{name:'result',maxSize:10000000})],null,['CREATE UNIQUE INDEX idx_hearth_operation ON hearth_operations (scope, operation)']);
  collection('hearth_invites',[field('text',{name:'token',required:true}),field('relation',{name:'household',collectionId:homes.id,maxSelect:1}),field('date',{name:'expires'}),field('bool',{name:'used'})],null,['CREATE UNIQUE INDEX idx_hearth_invite ON hearth_invites (token)']);
  // Historical ownership is the only safe automatic membership signal. Unowned
  // rows remain intact and inaccessible until a superuser assigns a household.
  const byUser = {};
  for (const item of app.findAllRecords('hearth_items')) {
    const uid=item.getString('user'); if (!uid || item.getString('household')) continue;
    if (!byUser[uid]) {const h=new Record(homes);h.set('name','My home');h.set('owner',uid);h.set('members',[uid]);app.save(h);byUser[uid]=h.id;}
    item.set('household',byUser[uid]);app.save(item);
  }
}, () => { throw new Error('Restore a backup to roll back household authorization; do not reopen the old public rules.'); });
