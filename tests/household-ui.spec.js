import {test,expect} from '@playwright/test';
import {recipes} from '../recipes.js';
const day='2026-09-15';
const id=()=>crypto.randomUUID();
const meal=(extra={})=>({id:id(),kind:'meals',name:recipes[2].name,recipeId:recipes[2].id,recipeSnapshot:recipes[2],servings:2,due:day,done:false,...extra});
async function local(page,home={}){await page.clock.install({time:new Date(day+'T14:00:00Z')});await page.addInitScript(data=>{localStorage.setItem('hearth-guest','1');if(!localStorage.getItem('seeded')){localStorage.setItem('hearth-home',JSON.stringify(data));localStorage.setItem('seeded','yes');}},home);await page.route('**/api/google/status',r=>r.fulfill({json:{configured:true,connected:false}}));await page.route('**/api/household',r=>r.fulfill({json:{shared:false,items:[]}}));await page.goto('/');await expect(page.locator('#homeStatus')).toHaveText('Saved on this device');}
const go=(page,name)=>page.getByRole('button',{name,exact:true}).click();
test('Home first visit, persistent destinations, searchable picker retains chosen date and favorites',async({page})=>{
 await local(page);await expect(page.locator('[data-app=home]')).toHaveAttribute('aria-current','page');await go(page,'Meals');await page.locator('#mealWeekGrid [data-plan-day="2026-09-18"]').click();await expect(page.locator('#pickerDate')).toContainText('September 18');await page.locator('#pickerSearch').fill('omelet');await page.locator('[data-pick]').click();await expect(page.locator('#recipeDate')).toHaveValue('2026-09-18');await page.click('#favoriteRecipe');await page.click('#planRecipe');await expect(page.locator('#mealWeekGrid')).toContainText('Vegetable omelet');await page.check('#recipeFavorites');await expect(page.locator('#recipeList .recipe-button')).toHaveCount(1);await page.reload();await expect(page.locator('[data-app=meals]')).toHaveAttribute('aria-current','page');
});
test('Shopping preview is editable, purchased items transfer once, cooking previews consume pantry',async({page})=>{
 await local(page,{meals:[meal()],pantry:[{id:id(),kind:'pantry',name:'eggs',amount:2,unit:'each',expires:'2026-09-16'}]});await go(page,'Meals');await page.click('#buildShopping');await expect(page.locator('#previewDialog')).toBeVisible();await expect(page.locator('#previewRows')).toContainText('At home 2');await page.getByLabel('eggs quantity',{exact:true}).fill('3');await page.click('#confirmPreview');await go(page,'Shopping');await page.getByLabel('Complete eggs',{exact:true}).check();await page.click('#transferPurchased');await page.click('#confirmPreview');await expect(page.getByLabel('Complete eggs',{exact:true})).toHaveCount(0);const home=await page.evaluate(()=>JSON.parse(localStorage.getItem('hearth-home')));expect(home.pantry.filter(i=>i.name==='eggs').reduce((n,i)=>n+i.amount,0)).toBe(5);await go(page,'Meals');await page.locator('#mealWeekGrid [data-cook]').click();await expect(page.locator('#previewRows')).toContainText('Expires 2026-09-16');await expect(page.locator('#previewWarnings')).toContainText('not available');await page.click('#confirmPreview');await expect(page.locator('#mealWeekGrid')).toContainText('Cooked');const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('hearth-home')));expect(after.pantry.filter(i=>i.name==='eggs').reduce((n,i)=>n+i.amount,0)).toBe(1);expect(after.pantry.every(i=>i.amount>=0)).toBe(true);
});
test('Recurring chore creation, postponement and skip preserve its original date',async({page})=>{
 await local(page);await go(page,'Tasks');await page.getByLabel('Task name',{exact:true}).fill('Water plants');await page.getByLabel('Task due date').fill(day);await page.locator('.task-options summary').click();await page.locator('#taskForm [name=repeat]').selectOption('weekly');await page.locator('#taskForm .primary').click();await page.getByRole('button',{name:'Postpone',exact:true}).click();await page.locator('#postponeDate').fill('2026-09-17');await page.getByRole('button',{name:'Save date',exact:true}).click();await page.getByRole('button',{name:'Skip',exact:true}).click();await expect(page.locator('#taskList')).toContainText('2026-09-22');const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('hearth-home')));expect(data.tasks).toHaveLength(2);expect(data.tasks.find(t=>t.done).skipped).toBe(true);expect(data.tasks.find(t=>!t.done).due).toBe('2026-09-22');
});
test('Legacy recipe migration is repeat-safe and deletion survives reload',async({page})=>{
 const custom={...recipes[0],id:'old-custom',name:'Family dinner',custom:true};await page.addInitScript(r=>{if(!localStorage.getItem('legacySeeded')){localStorage.setItem('hearth-custom-recipes',JSON.stringify([r]));localStorage.setItem('legacySeeded','1');}},custom);await local(page,{meals:[{id:id(),kind:'meals',name:'Family dinner',recipeId:8,due:day,servings:2}]});await go(page,'Meals');await page.getByRole('button',{name:/Family dinner.*Custom/}).click();page.on('dialog',d=>d.accept());await page.click('#deleteRecipeBtn');await page.clock.fastForward(11000);await page.reload();await expect(page.locator('#recipeList')).not.toContainText('Family dinner');await page.locator('#mealWeekGrid [data-planned-meal]').click();await expect(page.locator('#recipeDetails')).toContainText('chicken');
});
test('Mobile screens avoid page overflow and icon assets are served with correct types',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await local(page,{meals:[meal()]});for(const dest of ['Home','Tasks','Meals','Shopping']){await go(page,dest);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await expect(page.locator('[data-app='+dest.toLowerCase()+']')).toBeInViewport();}await go(page,'Meals');expect(await page.locator('#mealWeekGrid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length)).toBe(1);await page.click('#settingsBtn');await page.selectOption('#themeSelect','dark');await page.getByRole('button',{name:'Close settings',exact:true}).click();await page.screenshot({path:'test-results/hearth-meals-mobile-dark.png'});for(const [path,type] of [['/icon.svg','image/svg+xml'],['/icon-192.png','image/png'],['/icon-maskable.png','image/png'],['/apple-touch-icon.png','image/png'],['/manifest.json','application/manifest+json'],['/favicon.ico','image/x-icon']]){const r=await request.get(path);expect(r.ok()).toBe(true);expect(r.headers()['content-type']).toContain(type);}
});

test('Groceries panel displays quantity and notes fields directly without dropdown', async({page})=>{
 await local(page);
 await go(page, 'Shopping');

 // Verify details and summary dropdowns are not present in grocery form
 await expect(page.locator('#groceryForm summary')).toHaveCount(0);
 await expect(page.locator('#groceryForm details')).toHaveCount(0);

 // Verify quantity, unit, and notes inputs are directly visible
 const nameInput = page.getByLabel('Grocery item', {exact: true});
 const amountInput = page.getByLabel('Grocery quantity', {exact: true});
 const unitSelect = page.getByLabel('Grocery unit', {exact: true});
 const notesInput = page.getByLabel('Grocery notes (optional)', {exact: true});

 await expect(nameInput).toBeVisible();
 await expect(amountInput).toBeVisible();
 await expect(unitSelect).toBeVisible();
 await expect(notesInput).toBeVisible();

 // Fill in grocery item with quantity, unit, and notes
 await nameInput.fill('Organic Milk');
 await amountInput.fill('2');
 await unitSelect.selectOption('carton');
 await notesInput.fill('Whole milk, store brand');
 await page.locator('#groceryForm button').click();

 // Verify item appears in grocery list with quantity and notes
 const groceryItem = page.locator('#groceryList .list-row').filter({hasText: 'Organic Milk'});
 await expect(groceryItem).toBeVisible();
 await expect(groceryItem).toContainText('2 carton');
 await expect(groceryItem).toContainText('Whole milk, store brand');
});

async function sharedSetup(page,store,account='owner@example.com'){
 await page.addInitScript(account=>{localStorage.setItem('hearth-guest','1');if(!localStorage.getItem('hearth-pb-auth'))localStorage.setItem('hearth-pb-auth',JSON.stringify({token:'test-token',record:{id:account,email:account}}));},account);
 await page.route('**/api/realtime*',r=>r.abort());
 await page.route('**/api/hearth/settings',r=>r.fulfill({json:{}}));
 await page.route('**/api/hearth/snapshot',r=>r.fulfill({json:{household:{id:'household-test',name:'Our home',owner:account},members:[{id:'owner@example.com',email:'owner@example.com'},{id:'partner@example.com',email:'partner@example.com'}],items:account==='stranger@example.com'?[]:store.items,events:[],settings:{}}}));
 await page.clock.install({time:new Date(day+'T14:00:00Z')});
 await page.route('**/api/google/status',r=>r.fulfill({json:{connected:true,configured:true,account,members:['owner@example.com','partner@example.com']}}));
 await page.route('**/api/google/events?*',r=>r.fulfill({json:{calendars:[{id:account,primary:true,name:'Personal',accessRole:'owner',backgroundColor:'#285740',foregroundColor:'#fff'}],events:[]}}));
 await page.route('**/api/household',async r=>{if(r.request().method()==='GET')return r.fulfill({json:{shared:true,items:store.items,members:['owner@example.com','partner@example.com']}});const item=r.request().postDataJSON();if(r.request().method()==='DELETE'){store.items=store.items.filter(i=>i.id!==item.id);return r.fulfill({json:{shared:true,items:[]}});}const saved={...item,updated_at:new Date(++store.revision).toISOString()};store.items=store.items.filter(i=>i.id!==item.id).concat(saved);return r.fulfill({json:{shared:true,items:[saved]}});});
 await page.route('**/api/hearth/apply',async r=>{const op=r.request().postDataJSON();store.calls.push(op);if(store.offline)return r.abort('failed');if(store.receipts.has(op.operationId))return r.fulfill({json:store.receipts.get(op.operationId)});const expected=op.expected.map(i=>[i.id,i.updated_at]).sort(),actual=store.items.map(i=>[i.id,i.updated_at]).sort();if(store.conflict||JSON.stringify(expected)!==JSON.stringify(actual))return r.fulfill({status:409,json:{message:'Household changed. Refresh and review this operation again.'}});const saved=[];for(const c of op.changes){store.items=store.items.filter(i=>i.id!==c.item.id);if(!c.remove){const item={...c.item,updated_at:new Date(++store.revision).toISOString()};saved.push(item);store.items.push(item);}}const result={items:saved,removed:op.changes.filter(c=>c.remove).map(c=>c.item.id)};store.receipts.set(op.operationId,result);return r.fulfill({json:result});});
 await page.goto('/');await expect(page.locator('#homeStatus')).toContainText('Household synced');
}
const sharedStore=items=>({items:items.map(i=>({...i,updated_at:'2026-09-15T00:00:00.000Z'})),revision:Date.parse('2026-09-15T00:00:00Z'),receipts:new Map(),calls:[]});
test('Two household sessions share imported recipes and keep planned snapshots after deletion',async({browser})=>{
 const store=sharedStore([]),a=await browser.newContext(),b=await browser.newContext(),p=await a.newPage(),q=await b.newPage();try{await p.addInitScript(r=>localStorage.setItem('hearth-home',JSON.stringify({recipes:[r],legacyRecipeMigrationComplete:true})),{...recipes[0],id:id(),kind:'recipes',name:'Our recipe',custom:true});await sharedSetup(p,store);await go(p,'Meals');await p.click('#importRecipes');await expect(p.locator('#recipeList')).toContainText('Our recipe');await sharedSetup(q,store,'partner@example.com');await go(q,'Meals');await q.getByRole('button',{name:/Our recipe/}).click();await q.click('#planRecipe');await expect.poll(()=>store.items.find(i=>i.kind==='meals')?.recipeSnapshot?.name).toBe('Our recipe');await p.reload();await p.click('#importRecipes');expect(store.items.filter(i=>i.kind==='recipes')).toHaveLength(1);p.on('dialog',d=>d.accept());await p.locator('#recipeList').getByRole('button',{name:/Our recipe/}).click();await p.click('#deleteRecipeBtn');await p.clock.fastForward(11000);await q.reload();await expect(q.locator('#recipeList')).not.toContainText('Our recipe');await q.locator('#mealWeekGrid [data-planned-meal]').click();await expect(q.locator('#recipeDetails')).toContainText('chicken');}finally{await a.close();await b.close();}
});
test('Offline batch retries keep their operation ID and stale previews remain reviewable',async({page})=>{
 const store=sharedStore([meal()]);await sharedSetup(page,store);await go(page,'Meals');await page.click('#buildShopping');store.offline=true;await page.click('#confirmPreview');await expect(page.locator('#homeStatus')).toContainText('Sync needs attention');await expect.poll(()=>store.calls.length).toBeGreaterThan(0);const operationId=store.calls[0].operationId;store.offline=false;await page.clock.fastForward(16000);await expect(page.locator('#homeStatus')).toContainText('synced');expect(store.calls.at(-1).operationId).toBe(operationId);expect(store.items.filter(i=>i.kind==='groceries')).toHaveLength(4);await page.click('#buildShopping');await page.getByLabel('eggs quantity',{exact:true}).fill('1');store.conflict=true;await page.click('#confirmPreview');await expect(page.locator('#previewError')).toContainText('Household changed');expect(store.items.find(i=>i.name==='eggs').amount).toBe(4);
});
test('Account switching hides shared recipes and keeps pending operations bound to their owner',async({page})=>{
 const recipe={...recipes[0],id:id(),kind:'recipes',name:'Private household recipe',custom:true},store=sharedStore([recipe,meal()]);await sharedSetup(page,store);await go(page,'Meals');await page.click('#buildShopping');store.offline=true;await page.click('#confirmPreview');await page.route('**/api/google/status',r=>r.fulfill({json:{connected:true,configured:true,account:'stranger@example.com'}}));await page.route('**/api/household',r=>r.fulfill({json:{shared:false,items:[]}}));await page.evaluate(()=>{localStorage.setItem('hearth-pb-auth',JSON.stringify({token:'other-token',record:{id:'stranger@example.com',email:'stranger@example.com'}}));});await page.route('**/api/hearth/snapshot',r=>r.fulfill({json:{household:{id:'other'},members:[],items:[],events:[],settings:{}}}));await page.reload();await expect(page.locator('#recipeList')).not.toContainText('Private household recipe');const queue=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('hearth-sync-v2:')).map(k=>({key:k,data:JSON.parse(localStorage.getItem(k))})));expect(queue.find(q=>q.key.endsWith(':owner@example.com')).data.queue.length).toBe(1);
});
test('Multiple offline chore operations rebase snapshots in queue order',async({page})=>{
 const tasks=['Water plants','Vacuum'].map(name=>({id:id(),kind:'tasks',name,due:day,scheduledDue:day,repeat:'weekly',done:false})),store=sharedStore(tasks);await sharedSetup(page,store);await go(page,'Tasks');store.offline=true;await page.getByLabel('Complete Water plants',{exact:true}).click();await page.getByLabel('Complete Vacuum',{exact:true}).click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('hearth-sync-v2:')))).queue.length)).toBe(2);store.offline=false;await page.clock.fastForward(16000);await expect(page.locator('#homeStatus')).toContainText('synced');expect(store.items.filter(t=>t.done)).toHaveLength(2);expect(store.items.filter(t=>!t.done)).toHaveLength(2);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('hearth-sync-v2:')))).queue.length)).toBe(0);
});
test('Legacy shared meals acquire stable snapshots without importing local recipes',async({page})=>{
 const store=sharedStore([{id:id(),kind:'meals',name:recipes[2].name,recipeId:2,servings:2,due:day}]);await sharedSetup(page,store);await expect.poll(()=>store.items[0].recipeSnapshot?.name).toBe(recipes[2].name);expect(store.items[0].recipeId).toBe(recipes[2].id);expect(store.items.filter(i=>i.kind==='recipes')).toHaveLength(0);
});
test('Re-completing an older chore preserves its already-completed successor',async({page})=>{
 await local(page,{tasks:[{id:id(),kind:'tasks',name:'Laundry',due:day,scheduledDue:day,repeat:'weekly',done:false}]});await go(page,'Tasks');await page.getByLabel('Complete Laundry',{exact:true}).click();await page.getByLabel('Complete Laundry',{exact:true}).click();await page.selectOption('#taskFilter','all');const boxes=page.getByLabel('Complete Laundry',{exact:true});const older=page.locator('#taskList .list-row').filter({hasText:'2026-09-15'}).locator('input[type=checkbox]');await older.click();await older.click();const tasks=await page.evaluate(()=>JSON.parse(localStorage.getItem('hearth-home')).tasks);expect(tasks).toHaveLength(3);expect(tasks.filter(t=>t.done)).toHaveLength(2);
});
test('Event options expand for keyboard validation and dialogs keep focus',async({page})=>{
 await local(page);await go(page,'Calendar');await page.click('#createBtn');await expect(page.locator('#eventTitle')).toBeFocused();await expect(page.locator('#eventMore')).not.toHaveAttribute('open','');await page.fill('#eventTitle','A quiet evening');await page.locator('#eventMore summary').click();await page.selectOption('#eventRepeat','weekly');await page.fill('#eventRepeatCount','0');await page.locator('#eventMore summary').click();await page.click('#saveEventBtn');await expect(page.locator('#eventMore')).toHaveAttribute('open','');await expect(page.locator('#eventRepeatCount')).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('#eventDialog')).not.toBeVisible();
});
