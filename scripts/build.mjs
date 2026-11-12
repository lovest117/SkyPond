import {cp,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await import('./embed.mjs');
// Replace only the web files; dist/ also holds the Android APK and other packaged output.
const files=['index.html','style.css','pages.css','core.js','art.js','gl.js','scene.js','now.js','audio.js','app.js','project.json','manifest.json','sw.js','_headers','about/index.html','download/index.html','privacy/index.html','changelog/index.html','assets/pond.webp','assets/pond-spring.webp','assets/pond-summer.webp','assets/pond-autumn.webp','assets/pond-winter.webp','assets/pond-data.js','assets/preview.jpg','assets/favicon.svg','assets/app-icon-192.png','assets/app-icon-512.png','assets/qr-site.svg','assets/ARTWORK.md'];
for(const file of files)await rm(`${root}dist/${file}`,{force:true});
for(const dir of ['assets','about','download','privacy','changelog'])await mkdir(`${root}dist/${dir}`,{recursive:true});
for(const file of files)await cp(`${root}${file}`,`${root}dist/${file}`);
console.log('静态项目已构建至 dist/；可直接打开 index.html 或导入 Wallpaper Engine。');
