import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
// Render the vector master; no external image service or font is needed.
const browser=await chromium.launch();
try{
 const page=await browser.newPage(),svg=await fs.readFile(new URL('../icon.svg',import.meta.url),'utf8');
 for(const [file,size,maskable] of [['icon-192.png',192,false],['icon-512.png',512,false],['icon-maskable.png',512,true],['apple-touch-icon.png',180,true],['favicon.png',32,false]]){
  await page.setViewportSize({width:size,height:size});
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:${maskable?'#234b3c':'transparent'}}svg{width:${maskable?'80':'100'}%;height:${maskable?'80':'100'}%;${maskable?'margin:10%;':''}</style>${svg}`);
  await page.screenshot({path:fileURLToPath(new URL('../'+file,import.meta.url)),omitBackground:!maskable});
 }
 const png=await fs.readFile(new URL('../favicon.png',import.meta.url)),header=Buffer.alloc(22);
 header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header[6]=32;header[7]=32;header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
 await fs.writeFile(new URL('../favicon.ico',import.meta.url),Buffer.concat([header,png]));await fs.unlink(new URL('../favicon.png',import.meta.url));
}finally{await browser.close();}
