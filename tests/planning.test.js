import test from 'node:test';
import assert from 'node:assert/strict';
import {nextDue,overlaps,shiftedEvent,expandLocal,mergePending,shoppingNeeds,normalizedFood,stableUUID} from '../planning.js';

test('nextDue advances the repeat and clamps month ends',()=>{
 assert.equal(nextDue('2026-09-15','daily'),'2026-09-16');
 assert.equal(nextDue('2026-09-15','weekly'),'2026-09-22');
 assert.equal(nextDue('2026-01-31','monthly'),'2026-02-28');
 assert.equal(nextDue('2026-01-15','monthly'),'2026-02-15');
 assert.equal(nextDue('2026-09-15','none'),'');
 assert.equal(nextDue('not-a-date','daily'),'');
});

test('overlaps uses exclusive bounds and understands all-day events',()=>{
 const a={date:'2026-09-15',endDate:'2026-09-15',time:'08:00',end:'09:00'};
 assert.equal(overlaps(a,{...a,time:'08:30',end:'10:00'}),true);
 assert.equal(overlaps(a,{...a,time:'09:00',end:'10:00'}),false);
 assert.equal(overlaps({allDay:true,date:'2026-09-15',endDate:'2026-09-16'},a),true);
 assert.equal(overlaps({allDay:true,date:'2026-09-15',endDate:'2026-09-16'},{allDay:true,date:'2026-09-16',endDate:'2026-09-17'}),false);
});

test('shiftedEvent moves and resizes, rejecting an end before the start',()=>{
 const e={date:'2026-09-15',endDate:'2026-09-15',time:'08:00',end:'09:00'};
 const moved=shiftedEvent(e,'2026-09-16',600);
 assert.equal(moved.date,'2026-09-16');assert.equal(moved.time,'10:00');assert.equal(moved.end,'11:00');
 const resized=shiftedEvent(e,'2026-09-15',630,true);
 assert.equal(resized.time,'08:00');assert.equal(resized.end,'10:30');
 assert.equal(shiftedEvent(e,'2026-09-15',300,true),null);
});

test('expandLocal expands repeats, honouring count and exclusions',()=>{
 const daily={id:'d',date:'2026-09-15',endDate:'2026-09-15',repeat:'daily',repeatCount:3};
 const expanded=expandLocal([daily],'2026-09-01','2026-09-30');
 assert.deepEqual(expanded.map(e=>e.date),['2026-09-15','2026-09-16','2026-09-17']);
 assert(expanded.every(e=>e.localParentId==='d'&&e.repeat==='none'&&e.occurrenceDate===e.date));
 const weekdays={id:'w',date:'2026-09-18',endDate:'2026-09-18',repeat:'weekdays',repeatCount:3};
 assert.deepEqual(expandLocal([weekdays],'2026-09-01','2026-09-30').map(e=>e.date),['2026-09-18','2026-09-21','2026-09-22']);
 const excluded={...daily,excludedDates:['2026-09-16']};
 assert.deepEqual(expandLocal([excluded],'2026-09-01','2026-09-30').map(e=>e.date),['2026-09-15','2026-09-17']);
});

test('expandLocal clamps a monthly repeat to the last day of short months',()=>{
 const monthly={id:'m',date:'2026-01-31',endDate:'2026-01-31',repeat:'monthly',repeatCount:3};
 assert.deepEqual(expandLocal([monthly],'2026-01-01','2026-05-01').map(e=>e.date),['2026-01-31','2026-02-28','2026-03-31']);
});

test('expandLocal passes non-repeating and Google-backed events through untouched',()=>{
 const plain={id:'p',date:'2026-09-15',endDate:'2026-09-15'};
 const synced={id:'g',date:'2026-09-15',endDate:'2026-09-15',repeat:'daily',repeatCount:3,googleEventId:'abc'};
 assert.deepEqual(expandLocal([plain,synced],'2026-09-01','2026-09-30').map(e=>e.id),['p','g']);
});

test('mergePending applies deletions and marks pending upserts',()=>{
 const events=[{id:'a'},{id:'b'}];
 assert.deepEqual(mergePending(events,[{type:'event',action:'delete',item:{id:'b'}}]).map(e=>e.id),['a']);
 const upserted=mergePending(events,[{type:'event',action:'upsert',item:{id:'c',title:'new'}}]);
 assert.deepEqual(upserted.map(e=>e.id),['a','b','c']);
 assert.equal(upserted.find(e=>e.id==='c').pending,true);
});

test('shoppingNeeds sums meals and subtracts matching pantry or groceries',()=>{
 const recipes=[{servings:2,portions:[{name:'tomato',amount:1,unit:'each'}]}];
 const meals=[{recipeId:0,servings:4}];
 assert.equal(shoppingNeeds(meals,recipes,[],[])[0].amount,2);
 assert.equal(shoppingNeeds(meals,recipes,[{name:'tomato',unit:'each',amount:1}],[])[0].amount,1);
 assert.equal(shoppingNeeds(meals,recipes,[{name:'tomatoes',unit:'each',amount:1}],[])[0].amount,1);
 assert.equal(shoppingNeeds(meals,recipes,[{name:'tomato',unit:'g',amount:5}],[])[0].amount,2);
 assert.equal(shoppingNeeds(meals,recipes,[{name:'tomato',unit:'each',amount:2}],[]).length,0);
});

test('stableUUID is deterministic and distinct per input',async()=>{
 const a=await stableUUID('chore|2026-09-16');
 assert.equal(a,await stableUUID('chore|2026-09-16'));
 assert.notEqual(a,await stableUUID('chore|2026-09-23'));
 assert.match(a,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('normalizedFood folds simple plurals and whitespace',()=>{
 assert.equal(normalizedFood('  Tomatoes '),'tomato');
 assert.equal(normalizedFood('EGGS'),'egg');
 assert.equal(normalizedFood('  brown   rice '),'brown rice');
});
