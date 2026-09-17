import './check-syntax.mjs';
import {copyFileSync,mkdirSync,readdirSync,realpathSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {publicFiles,isPublicImage} from './public-assets.mjs';

const root=realpathSync(new URL('../',import.meta.url));
const output=resolve(root,'public');
// Rebuild only this generated directory, including on Windows.
if(dirname(output)!==root)throw new Error('Build output must be inside the project.');
rmSync(output,{recursive:true,force:true});
mkdirSync(output,{recursive:true});
const files=[...publicFiles,...readdirSync(join(root,'images'),{recursive:true})
 .map(file=>'images/'+file.replaceAll('\\','/')).filter(isPublicImage)];
for(const file of files){
 const target=join(output,file);
 mkdirSync(dirname(target),{recursive:true});
 copyFileSync(join(root,file),target);
}
console.log(`Built ${files.length} browser assets in public/.`);
