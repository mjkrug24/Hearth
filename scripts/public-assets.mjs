// Shared by the local server and the deployment build.
export const publicFiles=[
 'index.html','styles.css','warm.css','app.js','pocketbase.js',
 'household-store.js','quick-add.js','cooking-mode.js','calendar-model.js',
 'recipes.js','planning.js','offline.js','sw.js','household-ui.js',
 'household-model.js','manifest.json','icon.svg','favicon.ico',
 'icon-192.png','icon-512.png','icon-maskable.png','apple-touch-icon.png'
];
export const isPublicImage=file=>/^images\/[\w\-\/]+\.(jpg|jpeg|png|webp|svg)$/i.test(file);
