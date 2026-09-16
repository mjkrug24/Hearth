// PocketBase 0.40+: preserve legacy rows and restrict every Hearth collection.
migrate((app) => {
  const users = app.findCollectionByNameOrId('users');
  function collection(name, fields, readRule, indexes = []) {
    let c;
    try { c = app.findCollectionByNameOrId(name); }
    catch { c = new Collection({name, type: 'base'}); }
    for (const field of fields) if (!c.fields.getByName(field.name)) c.fields.add(field);
    for (const name of ['created', 'updated']) if (!c.fields.getByName(name)) c.fields.add(new AutodateField({name, onCreate: true, onUpdate: name === 'updated'}));
    c.listRule = c.viewRule = readRule;
    c.createRule = c.updateRule = c.deleteRule = null;
    c.indexes = [...c.indexes, ...indexes.filter(i => !c.indexes.includes(i))];
    app.save(c); return c;
  }
  const homes = collection('hearth_households', [
    new TextField({name:'name', required:true, max:100}),
    new RelationField({name:'members', collectionId:users.id, maxSelect:100}),
    new RelationField({name:'owner', collectionId:users.id, maxSelect:1})
  ], 'members.id ?= @request.auth.id && @request.auth.id != ""');
  const owner = '@request.auth.id != "" && user = @request.auth.id';
  const common = () => [new TextField({name:'client_id',max:200}), new TextField({name:'version',max:40}), new JSONField({name:'data',maxSize:2000000}), new RelationField({name:'user',collectionId:users.id,maxSelect:1})];
  collection('hearth_items', [...common(),new RelationField({name:'household',collectionId:homes.id,maxSelect:1}),new TextField({name:'kind',max:20}),new TextField({name:'name',max:200}),new JSONField({name:'details'}),new BoolField({name:'done'}),new TextField({name:'due'}),new TextField({name:'quantity'}),new TextField({name:'assignedTo'})], '@request.auth.id != "" && household.members.id ?= @request.auth.id');
  collection('hearth_events', [...common(),new TextField({name:'title',max:500}),new TextField({name:'date'}),new TextField({name:'endDate'}),new TextField({name:'time'}),new TextField({name:'end'}),new BoolField({name:'allDay'}),new TextField({name:'location'}),new TextField({name:'notes'}),new TextField({name:'repeat'}),new NumberField({name:'repeatCount'}),new TextField({name:'reminder'}),new TextField({name:'timeZone'})],owner);
  collection('hearth_settings',[new RelationField({name:'user',collectionId:users.id,maxSelect:1}),new JSONField({name:'settings',maxSize:2000000})],owner);
  collection('hearth_operations',[new TextField({name:'scope',required:true}),new TextField({name:'operation',required:true}),new JSONField({name:'result',maxSize:10000000})],null,['CREATE UNIQUE INDEX idx_hearth_operation ON hearth_operations (scope, operation)']);
  collection('hearth_invites',[new TextField({name:'token',required:true}),new RelationField({name:'household',collectionId:homes.id,maxSelect:1}),new DateField({name:'expires'}),new BoolField({name:'used'})],null,['CREATE UNIQUE INDEX idx_hearth_invite ON hearth_invites (token)']);
  // Historical ownership is the only safe automatic membership signal. Unowned
  // rows remain intact and inaccessible until a superuser assigns a household.
  const byUser = {};
  for (const item of app.findAllRecords('hearth_items')) {
    const uid=item.getString('user'); if (!uid || item.getString('household')) continue;
    if (!byUser[uid]) {const h=new Record(homes);h.set('name','My home');h.set('owner',uid);h.set('members',[uid]);app.save(h);byUser[uid]=h.id;}
    item.set('household',byUser[uid]);app.save(item);
  }
}, () => { throw new Error('Restore a backup to roll back household authorization; do not reopen the old public rules.'); });
