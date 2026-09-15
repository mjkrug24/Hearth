import test from 'node:test';
import assert from 'node:assert/strict';
import {monthDates,dateKey,occursOn,layoutEvents,normalizeEvent} from '../calendar-model.js';
import {matches,mealGroups} from '../recipes.js';
test('Six-row months include the last day',()=>{const days=monthDates(new Date(2026,7,1));assert.equal(days.length,42);assert(days.some(d=>dateKey(d)==='2026-08-31'));});
test('Nine hour event covers 480 through 1020; overlaps get lanes',()=>{const day='2026-09-15',e={id:'work',date:day,endDate:day,time:'08:00',end:'17:00'};const result=layoutEvents([e,{...e,id:'lunch',time:'12:00',end:'13:00'}],day);assert.equal(result[0].start,480);assert.equal(result[0].end,1020);assert.equal(result[0].lanes,2);assert.notEqual(result[0].lane,result[1].lane);});
test('Overnight and exclusive all-day ends',()=>{const e={date:'2026-09-15',endDate:'2026-09-16',time:'23:00',end:'01:00'};assert.equal(layoutEvents([e],'2026-09-15')[0].end,1440);assert.equal(layoutEvents([e],'2026-09-16')[0].end,60);assert(!occursOn({...e,allDay:true},'2026-09-16'));});
test('Google timestamp normalization uses local date, not its text offset',()=>{const timestamp='2026-09-16T00:30:00+09:00',e=normalizeEvent({startDateTime:timestamp,endDateTime:'2026-09-16T01:30:00+09:00'}),d=new Date(timestamp);assert.equal(e.date,dateKey(d));assert.equal(Number(e.time.slice(0,2)),d.getHours());});
test('Recipes match ingredient words and have actionable methods',()=>{const result=matches([{name:'2 eggs'},{name:'spinach'},{name:'cheese'},{name:'bell pepper'}]);assert.equal(result[0].name,'Vegetable omelet');assert.equal(result[0].missing.length,0);assert(result[0].steps.length>1);assert.equal(mealGroups('eggplant')[1].found.length,0);});
