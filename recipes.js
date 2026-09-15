export const recipes = [
 {name:'Chicken & broccoli rice bowls',minutes:30,servings:2,ingredients:['chicken','broccoli','brown rice','olive oil'],portions:[{name:'chicken',amount:300,unit:'g'},{name:'broccoli',amount:2,unit:'cup'},{name:'brown rice',amount:1,unit:'cup'},{name:'olive oil',amount:1,unit:'tbsp'}],steps:['Cook 1 cup brown rice according to the package.','Cut 300 g chicken into bite-size pieces. Sauté in 1 tablespoon olive oil until cooked through (165°F / 74°C).','Steam 2 cups broccoli until tender. Divide everything between two bowls. Season to taste.']},
 {name:'Tomato & spinach pasta',minutes:25,servings:2,ingredients:['pasta','tomato','spinach','garlic','olive oil'],portions:[{name:'pasta',amount:180,unit:'g'},{name:'tomato',amount:3,unit:'each'},{name:'spinach',amount:2,unit:'cup'},{name:'garlic',amount:2,unit:'clove'},{name:'olive oil',amount:1,unit:'tbsp'}],steps:['Cook 180 g pasta, reserving a little cooking water.','Soften 2 chopped garlic cloves in 1 tablespoon oil. Add 3 chopped tomatoes and simmer for 10 minutes.','Fold in 2 handfuls spinach, then pasta. Loosen with cooking water. Serves two.']},
 {name:'Vegetable omelet',minutes:15,servings:2,ingredients:['eggs','spinach','bell pepper','cheese'],portions:[{name:'eggs',amount:4,unit:'each'},{name:'spinach',amount:1,unit:'cup'},{name:'bell pepper',amount:0.5,unit:'each'},{name:'cheese',amount:2,unit:'tbsp'}],steps:['Soften half a diced pepper in a lightly oiled pan. Add a handful of spinach.','Whisk 4 eggs, pour into the pan, and cook gently until set.','Add 2 tablespoons grated cheese, fold, and divide into two servings.']},
 {name:'Bean & rice bowls',minutes:25,servings:2,ingredients:['black beans','rice','tomato','avocado'],portions:[{name:'black beans',amount:1,unit:'can'},{name:'rice',amount:1,unit:'cup'},{name:'tomato',amount:1,unit:'each'},{name:'avocado',amount:1,unit:'each'}],steps:['Cook 1 cup rice following package directions.','Warm one drained can black beans with a splash of water.','Divide rice and beans between two bowls. Top with 1 diced tomato and 1 sliced avocado.']},
 {name:'Lentil vegetable soup',minutes:40,servings:4,ingredients:['lentils','carrot','onion','tomato'],portions:[{name:'lentils',amount:1,unit:'cup'},{name:'carrot',amount:2,unit:'each'},{name:'onion',amount:1,unit:'each'},{name:'tomato',amount:1,unit:'can'}],steps:['Soften 1 chopped onion and 2 carrots in a little oil.','Add 1 cup rinsed lentils, 1 can tomatoes, and 4 cups water or stock.','Simmer 25–30 minutes until lentils are tender, adding water as needed. Makes about four servings.']},
 {name:'Chickpea cucumber salad',minutes:10,servings:2,ingredients:['chickpeas','cucumber','tomato','lemon','olive oil'],portions:[{name:'chickpeas',amount:1,unit:'can'},{name:'cucumber',amount:0.5,unit:'each'},{name:'tomato',amount:2,unit:'each'},{name:'lemon',amount:0.5,unit:'each'},{name:'olive oil',amount:1,unit:'tbsp'}],steps:['Drain one can chickpeas. Dice half a cucumber and 2 tomatoes.','Toss with 1 tablespoon olive oil and juice of half a lemon.','Season to taste. Serves two; refrigerate leftovers.']},
 {name:'Peanut oat breakfast',minutes:10,servings:2,ingredients:['oats','milk','banana','peanut butter'],portions:[{name:'oats',amount:1,unit:'cup'},{name:'milk',amount:2,unit:'cup'},{name:'banana',amount:1,unit:'each'},{name:'peanut butter',amount:2,unit:'tbsp'}],steps:['Simmer 1 cup oats in 2 cups milk or a suitable alternative until soft.','Stir in 2 tablespoons peanut butter.','Divide into two bowls and top with sliced banana. Contains peanuts; substitute as needed.']},
 {name:'Baked salmon & potatoes',minutes:35,servings:2,ingredients:['salmon','potato','broccoli','olive oil'],portions:[{name:'salmon',amount:2,unit:'fillet'},{name:'potato',amount:2,unit:'each'},{name:'broccoli',amount:2,unit:'cup'},{name:'olive oil',amount:1,unit:'tbsp'}],steps:['Heat oven to 400°F / 200°C. Dice 2 potatoes, toss with oil, and roast 15 minutes.','Add 2 salmon fillets and broccoli florets to the tray. Roast until salmon reaches 145°F / 63°C and vegetables are tender.','Divide into two servings.']}
];
const aliases={eggs:['egg','eggs'],tomato:['tomato','tomatoes'],potato:['potato','potatoes'],chickpeas:['chickpea','chickpeas','garbanzo'], 'black beans':['black bean','black beans','beans'], 'bell pepper':['bell pepper','bell peppers','pepper'], oats:['oat','oats','oatmeal']};
export function hasIngredient(items,ingredient){return items.some(item=>(aliases[ingredient]||[ingredient]).some(alias=>new RegExp('(^|\\W)'+alias+'(s)?($|\\W)','i').test(item.name)));}
export function matches(items, list = recipes){return list.map((r,id)=>({...r,id,missing:r.ingredients.filter(i=>!hasIngredient(items,i))})).sort((a,b)=>(a.missing.length/a.ingredients.length)-(b.missing.length/b.ingredients.length));}
export function normalizeCustomRecipe(recipe){
 if(!recipe||typeof recipe!=='object')throw new Error('Invalid recipe data.');
 const name=String(recipe.name||'').trim();
 if(!name||name.length>100)throw new Error('Recipe name must be between 1 and 100 characters.');
 const minutes=Math.max(1,Math.min(720,Math.round(Number(recipe.minutes)||30)));
 const servings=Math.max(1,Math.min(20,Math.round(Number(recipe.servings)||2)));
 const portions=[];
 for(const p of recipe.portions||[]){
  const pName=String(p.name||'').trim().toLowerCase();
  const amount=Number(p.amount);
  const unit=String(p.unit||'each').trim().toLowerCase();
  if(pName&&Number.isFinite(amount)&&amount>0&&unit){
   portions.push({name:pName,amount:Math.round(amount*100)/100,unit});
  }
 }
 if(!portions.length)throw new Error('Recipe must have at least one ingredient with a valid amount.');
 const ingredients=portions.map(p=>p.name);
 const rawSteps=Array.isArray(recipe.steps)?recipe.steps:String(recipe.steps||'').split('\n');
 const steps=rawSteps.map(s=>String(s).trim()).filter(Boolean);
 if(!steps.length)throw new Error('Recipe must have at least one instruction step.');
 return {
  id:recipe.id||('recipe-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)),
  name,
  minutes,
  servings,
  ingredients,
  portions,
  steps,
  custom:true
 };
}
export function mealGroups(text){const groups={'Vegetables / fruit':['broccoli','spinach','carrot','tomato','pepper','cucumber','banana','apple','fruit','vegetable'],'Protein':['chicken','fish','salmon','egg','tofu','lentil','beans','chickpea','beef','yogurt'],'Whole grains':['brown rice','whole wheat','whole grain','oats','quinoa'],'Unsaturated fat sources':['olive oil','avocado','nuts','peanut','seeds']};return Object.entries(groups).map(([name,words])=>({name,found:words.filter(w=>new RegExp('(^|\\W)'+w+'(s)?($|\\W)','i').test(text))}));}

