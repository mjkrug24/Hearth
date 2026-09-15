import {test,expect} from '@playwright/test';
const calendars=[{id:'mine',name:'Personal',accessRole:'owner',primary:true,backgroundColor:'#1967d2',foregroundColor:'#ffffff'},{id:'work',name:'Work calendar',accessRole:'writer',backgroundColor:'#33aa55',foregroundColor:'#000000'}];
const day='2026-09-15';
const work={id:'work::1',googleEventId:'1',googleCalendarId:'work',title:'Work shift',date:day,endDate:day,time:'08:00',end:'17:00',startDateTime:day+'T13:00:00Z',endDateTime:day+'T22:00:00Z',allDay:false,eventType:'default',etag:'a'};
async function setup(page,connected=true){
 await page.clock.install({time:new Date(day+'T14:00:00Z')});
 await page.route('**/api/google/status',r=>r.fulfill({json:{configured:true,connected}}));
 await page.route('**/api/household',r=>r.fulfill({json:{shared:false,items:[]}}));
 await page.route('**/api/google/events?*',r=>r.fulfill({json:{calendars,events:[work,{...work,id:'mine::2',googleEventId:'2',googleCalendarId:'mine',title:'Lunch',startDateTime:day+'T17:00:00Z',endDateTime:day+'T18:00:00Z'}]}}));
 await page.goto('/');await expect(page.locator('#syncStatus')).toContainText(connected?'Synced':'Sign in');
}
test('24h timeline and event geometry align; overlapping events split',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);
 await page.selectOption('#viewSelect','day');await expect(page.locator('.timed-event')).toHaveCount(2);
 const geometry=await page.evaluate(()=>{const body=document.querySelector('.time-day').getBoundingClientRect(),event=[...document.querySelectorAll('.timed-event')].find(e=>e.textContent.includes('Work shift')).getBoundingClientRect(),label=document.querySelector('[data-hour="8"]').getBoundingClientRect();return {top:event.top-body.top,height:event.height,label:label.top+label.height/2-body.top,body:body.height,width:event.width,dayWidth:body.width,scroll:document.querySelector('#calendarContent').scrollHeight};});
 expect(geometry.top).toBe(480);expect(geometry.height).toBe(540);expect(geometry.label).toBeCloseTo(480,0);expect(geometry.body).toBe(1440);expect(geometry.width).toBeLessThan(geometry.dayWidth*.6);expect(geometry.scroll).toBeGreaterThan(1440);expect(errors).toEqual([]);
 await page.locator('#calendarContent').evaluate(e=>e.scrollTop=e.scrollHeight);
 await expect(page.locator('[data-hour="23"]')).toBeInViewport();
});
test('Calendar visibility survives sync and all unchecked means empty',async({page})=>{
 await setup(page);await page.locator('[data-calendar="work"]').uncheck();await page.locator('[data-calendar="mine"]').uncheck();await expect(page.locator('[data-event]')).toHaveCount(0);await page.click('#connectBtn');await expect(page.locator('[data-calendar="work"]')).not.toBeChecked();await expect(page.locator('[data-event]')).toHaveCount(0);
});
test('Google edit retains calendar, failed save leaves form open',async({page})=>{
 await setup(page);await page.locator('[data-event="work::1"]').first().click();await expect(page.locator('#eventCalendar')).toHaveValue('work');await expect(page.locator('#eventTime')).toHaveValue('08:00');
 let sent;await page.route('**/api/google/events',r=>{sent=r.request().postDataJSON();return r.fulfill({status:412,json:{error:'Changed in Google; sync and retry.'}});});
 await page.fill('#eventTitle','Work edited');await page.click('#saveEventBtn');await expect(page.locator('#eventError')).toContainText('Changed in Google');expect(sent.googleCalendarId).toBe('work');expect(sent.startDateTime).toBe(day+'T13:00:00.000Z');await expect(page.locator('#eventDialog')).toBeVisible();
});
test('Local creation validates overnight dates and no HTML executes',async({page})=>{
 await setup(page,false);await page.click('#createBtn');await page.fill('#eventTitle','<img src=x onerror=alert(1)>');await page.fill('#eventTime','23:00');await page.fill('#eventEnd','01:00');await page.click('#saveEventBtn');await expect(page.locator('#eventError')).toContainText('End must be after start');await page.fill('#eventEndDate','2026-09-16');await page.click('#saveEventBtn');await expect(page.locator('#eventDialog')).not.toBeVisible();await expect(page.locator('.event-chip img')).toHaveCount(0);await expect(page.locator('.event-chip')).toHaveCount(2);
});
test('Navigation advances the correct period and six-row months are complete',async({page})=>{
 await setup(page,false);await page.selectOption('#viewSelect','day');await page.click('#nextBtn');await expect(page.locator('#periodTitle')).toContainText('16');await page.click('#todayBtn');await expect(page.locator('#periodTitle')).toContainText('15');await page.selectOption('#viewSelect','month');await page.click('#prevBtn');await expect(page.locator('.day-cell')).toHaveCount(42);await expect(page.locator('[data-new-day="2026-08-31"]').first()).toBeVisible();
});
test('Household workflows and recipe details work; theme persists',async({page})=>{
 await setup(page,false);await page.getByRole('button',{name:'Home',exact:true}).click();
 await page.getByLabel('Task name',{exact:true}).fill('Take out recycling');await page.locator('#taskForm button').click();await expect(page.locator('#taskList')).toContainText('Take out recycling');await page.selectOption('#taskFilter','all');await page.getByLabel('Complete Take out recycling').check();
 await page.getByLabel('Grocery item',{exact:true}).fill('eggs');await page.locator('#groceryForm button').click();await page.getByRole('button',{name:/Vegetable omelet/}).click();await expect(page.locator('#recipeDetails')).toContainText('Whisk 4 eggs');await page.click('#addIngredients');await expect(page.locator('#groceryList')).toContainText('spinach');
 await page.click('#themeBtn');const theme=await page.locator('html').getAttribute('data-theme');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
});
test('Add, view, scale, add ingredients, and delete custom recipe',async({page})=>{
 await setup(page,false);
 await page.getByRole('button',{name:'Home',exact:true}).click();
 await page.click('#addRecipeBtn');
 await expect(page.locator('#customRecipeDialog')).toBeVisible();
 await page.fill('#customRecipeName','Garlic Butter Salmon');
 await page.fill('#customRecipeMinutes','20');
 await page.fill('#customRecipeServings','2');
 const amountInputs=page.locator('#customRecipeIngredientsList .ing-amount');
 const unitSelects=page.locator('#customRecipeIngredientsList .ing-unit');
 const nameInputs=page.locator('#customRecipeIngredientsList .ing-name');
 await amountInputs.nth(0).fill('2');
 await unitSelects.nth(0).selectOption('fillet');
 await nameInputs.nth(0).fill('salmon');
 await amountInputs.nth(1).fill('2');
 await unitSelects.nth(1).selectOption('clove');
 await nameInputs.nth(1).fill('garlic');
 await page.click('#addIngredientRowBtn');
 await amountInputs.nth(2).fill('2');
 await unitSelects.nth(2).selectOption('tbsp');
 await nameInputs.nth(2).fill('butter');
 await page.fill('#customRecipeSteps','Melt butter with minced garlic in skillet.\nCook salmon fillets for 4 minutes each side.\nServe warm.');
 await page.click('#saveCustomRecipeBtn');
 await expect(page.locator('#customRecipeDialog')).not.toBeVisible();
 const recipeBtn=page.getByRole('button',{name:/Garlic Butter Salmon/});
 await expect(recipeBtn).toBeVisible();
 await expect(recipeBtn.locator('.custom-badge')).toContainText('Custom');
 await recipeBtn.click();
 await expect(page.locator('#recipeDialog')).toBeVisible();
 await expect(page.locator('#recipeDetails')).toContainText('fillet salmon');
 await expect(page.locator('#recipeDetails')).toContainText('Melt butter with minced garlic');
 await expect(page.locator('#deleteRecipeBtn')).toBeVisible();
 await expect(page.locator('#editRecipeBtn')).toBeVisible();
 await page.fill('#recipeServings','4');
 await expect(page.locator('#recipeDetails')).toContainText('4 fillet salmon');
 await page.click('#addIngredients');
 await expect(page.locator('#recipeDialog')).not.toBeVisible();
 await expect(page.locator('#groceryList')).toContainText('salmon');
 await expect(page.locator('#groceryList')).toContainText('butter');
 page.on('dialog',d=>d.accept());
 await recipeBtn.click();
 await page.click('#deleteRecipeBtn');
 await expect(page.locator('#recipeDialog')).not.toBeVisible();
 await expect(page.getByRole('button',{name:/Garlic Butter Salmon/})).toHaveCount(0);
});
test('Mobile navigation, settings and day timeline remain reachable',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page,false);await page.click('#settingsBtn');await expect(page.locator('#settingsDialog')).toBeVisible();await page.getByRole('button',{name:'Close settings'}).click();await page.getByRole('button',{name:'Home',exact:true}).click();await expect(page.locator('#homeWorkspace')).toBeVisible();await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.selectOption('#viewSelect','day');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});
test('Server does not expose secrets or source through static routes',async({request})=>{for(const path of ['/.env','/.hearth-calendar-data.json','/.git/config','/server.js'])expect((await request.get(path)).status()).toBe(404);});
test('All-day rows do not shift the event-to-hour alignment',async({page})=>{
 await setup(page);await page.route('**/api/google/events?*',r=>r.fulfill({json:{calendars,events:[work,{id:'holiday',googleEventId:'h',googleCalendarId:'mine',title:'Holiday',allDay:true,date:day,endDate:'2026-09-16'}]}}));
 await page.selectOption('#viewSelect','day');await expect(page.locator('.all-day .event-chip')).toHaveCount(1);
 expect(await page.locator('.timed-event').evaluate(e=>e.getBoundingClientRect().top-e.parentElement.getBoundingClientRect().top)).toBe(480);
 await expect(page.locator('.time-day .event-chip')).toHaveCount(0);
});
test('Read-only events cannot be edited or deleted',async({page})=>{
 await setup(page);await page.route('**/api/google/events?*',r=>r.fulfill({json:{calendars:[{...calendars[1],accessRole:'reader'}],events:[work]}}));await page.click('#connectBtn');await page.locator('[data-event="work::1"]').click();await expect(page.locator('#eventTitle')).toBeDisabled();await expect(page.locator('#saveEventBtn')).not.toBeVisible();await expect(page.locator('#deleteBtn')).not.toBeVisible();
});
test('A resync replaces changed Google events without deleting remote events',async({page})=>{
 await setup(page);const deletes=[];page.on('request',r=>{if(r.method()==='DELETE')deletes.push(r.url());});await page.route('**/api/google/events?*',r=>r.fulfill({json:{calendars,events:[{...work,title:'Changed remotely'}]}}));await page.click('#connectBtn');await expect(page.locator('[data-event]')).toHaveCount(1);await expect(page.locator('[data-event]')).toContainText('Changed remotely');expect(deletes).toEqual([]);
});
test('Visual review captures calendar, home and mobile dark mode',async({page})=>{
 await setup(page);await page.selectOption('#viewSelect','week');await page.screenshot({path:'test-results/calendar.png'});
 await page.getByRole('button',{name:'Home',exact:true}).click();await page.screenshot({path:'test-results/home.png'});
 await page.setViewportSize({width:390,height:844});await page.click('#themeBtn');await page.screenshot({path:'test-results/mobile.png'});
});
