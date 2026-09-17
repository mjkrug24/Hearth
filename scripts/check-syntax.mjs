import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const files=readdirSync(root).filter(name=>name.endsWith('.js'));
for(const file of files){
 const result=spawnSync(process.execPath,['--check',join(root,file)],{stdio:'inherit',windowsHide:true});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
console.log(`Syntax checks passed for ${files.length} application files.`);
