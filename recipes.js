export const recipes = [
 {name:'Chicken & broccoli rice bowls',minutes:30,ingredients:['chicken','broccoli','brown rice','olive oil'],steps:['Cook 1 cup brown rice according to the package.','Cut 300 g chicken into bite-size pieces. Sauté in 1 tablespoon olive oil until cooked through (165°F / 74°C).','Steam 2 cups broccoli until tender. Divide everything between two bowls. Season to taste.']},
 {name:'Tomato & spinach pasta',minutes:25,ingredients:['pasta','tomato','spinach','garlic','olive oil'],steps:['Cook 180 g pasta, reserving a little cooking water.','Soften 2 chopped garlic cloves in 1 tablespoon oil. Add 3 chopped tomatoes and simmer for 10 minutes.','Fold in 2 handfuls spinach, then pasta. Loosen with cooking water. Serves two.']},
 {name:'Vegetable omelet',minutes:15,ingredients:['eggs','spinach','bell pepper','cheese'],steps:['Soften half a diced pepper in a lightly oiled pan. Add a handful of spinach.','Whisk 4 eggs, pour into the pan, and cook gently until set.','Add 2 tablespoons grated cheese, fold, and divide into two servings.']},
 {name:'Bean & rice bowls',minutes:25,ingredients:['black beans','rice','tomato','avocado'],steps:['Cook 1 cup rice following package directions.','Warm one drained can black beans with a splash of water.','Divide rice and beans between two bowls. Top with 1 diced tomato and 1 sliced avocado.']},
 {name:'Lentil vegetable soup',minutes:40,ingredients:['lentils','carrot','onion','tomato'],steps:['Soften 1 chopped onion and 2 carrots in a little oil.','Add 1 cup rinsed lentils, 1 can tomatoes, and 4 cups water or stock.','Simmer 25–30 minutes until lentils are tender, adding water as needed. Makes about four servings.']},
 {name:'Chickpea cucumber salad',minutes:10,ingredients:['chickpeas','cucumber','tomato','lemon','olive oil'],steps:['Drain one can chickpeas. Dice half a cucumber and 2 tomatoes.','Toss with 1 tablespoon olive oil and juice of half a lemon.','Season to taste. Serves two; refrigerate leftovers.']},
 {name:'Peanut oat breakfast',minutes:10,ingredients:['oats','milk','banana','peanut butter'],steps:['Simmer 1 cup oats in 2 cups milk or a suitable alternative until soft.','Stir in 2 tablespoons peanut butter.','Divide into two bowls and top with sliced banana. Contains peanuts; substitute as needed.']},
 {name:'Baked salmon & potatoes',minutes:35,ingredients:['salmon','potato','broccoli','olive oil'],steps:['Heat oven to 400°F / 200°C. Dice 2 potatoes, toss with oil, and roast 15 minutes.','Add 2 salmon fillets and broccoli florets to the tray. Roast until salmon reaches 145°F / 63°C and vegetables are tender.','Divide into two servings.']}
];
const aliases={eggs:['egg','eggs'],tomato:['tomato','tomatoes'],potato:['potato','potatoes'],chickpeas:['chickpea','chickpeas','garbanzo'], 'black beans':['black bean','black beans','beans'], 'bell pepper':['bell pepper','bell peppers','pepper'], oats:['oat','oats','oatmeal']};
export function hasIngredient(items,ingredient){return items.some(item=>(aliases[ingredient]||[ingredient]).some(alias=>new RegExp('(^|\\W)'+alias+'(s)?($|\\W)','i').test(item.name)));}
export function matches(items){return recipes.map((r,id)=>({...r,id,missing:r.ingredients.filter(i=>!hasIngredient(items,i))})).sort((a,b)=>(a.missing.length/a.ingredients.length)-(b.missing.length/b.ingredients.length));}
export function mealGroups(text){const groups={'Vegetables / fruit':['broccoli','spinach','carrot','tomato','pepper','cucumber','banana','apple','fruit','vegetable'],'Protein':['chicken','fish','salmon','egg','tofu','lentil','beans','chickpea','beef','yogurt'],'Whole grains':['brown rice','whole wheat','whole grain','oats','quinoa'],'Unsaturated fat sources':['olive oil','avocado','nuts','peanut','seeds']};return Object.entries(groups).map(([name,words])=>({name,found:words.filter(w=>new RegExp('(^|\\W)'+w+'(s)?($|\\W)','i').test(text))}));}
// Quantities match the base methods above. Servings scale the ingredient list, not cooking time.
const quantities=[
 [['chicken',300,'g'],['broccoli',2,'cup'],['brown rice',1,'cup'],['olive oil',1,'tbsp']],
 [['pasta',180,'g'],['tomato',3,'each'],['spinach',2,'cup'],['garlic',2,'clove'],['olive oil',1,'tbsp']],
 [['eggs',4,'each'],['spinach',1,'cup'],['bell pepper',0.5,'each'],['cheese',2,'tbsp']],
 [['black beans',1,'can'],['rice',1,'cup'],['tomato',1,'each'],['avocado',1,'each']],
 [['lentils',1,'cup'],['carrot',2,'each'],['onion',1,'each'],['tomato',1,'can']],
 [['chickpeas',1,'can'],['cucumber',0.5,'each'],['tomato',2,'each'],['lemon',0.5,'each'],['olive oil',1,'tbsp']],
 [['oats',1,'cup'],['milk',2,'cup'],['banana',1,'each'],['peanut butter',2,'tbsp']],
 [['salmon',2,'fillet'],['potato',2,'each'],['broccoli',2,'cup'],['olive oil',1,'tbsp']]
];
recipes.forEach((r,i)=>{r.servings=i===4?4:2;r.portions=quantities[i].map(([name,amount,unit])=>({name,amount,unit}));});
