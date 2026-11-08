'use strict';
const {PALETTES,weatherFromCode,clamp,createFish,createSilverCarpShoal,PondSimulation,sanitizeSave,randomSeed,POND_CAP,QUEUE_CAP,GROW_DAYS,createFry,frySize,growthStage,queueDrain}=PondCore;
const $=s=>document.querySelector(s);
const ICONS={
  fish:'M3 12c4-7 11-8 16-3l3-4v14l-3-4C14 20 7 19 3 12Z M8 11h.01 M13 6l-2-3 M13 18l-2 3',
  feed:'M5 13c0 5 3 8 7 8s7-3 7-8H5Z M3 13h18 M9 3v2 M15 5v2 M12 8v1',
  trophy:'M8 3h8v7a4 4 0 0 1-8 0V3Z M8 5H4v3a4 4 0 0 0 4 4 M16 5h4v3a4 4 0 0 1-4 4 M12 14v6 M8 21h8',
  sun:'M12 3V1 M12 23v-2 M3 12H1 M23 12h-2 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2 M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  cloudy:'M7 18a5 5 0 1 1 1-10 6 6 0 0 1 11 3 3.5 3.5 0 0 1 0 7H7Z',
  rain:'M5 15a4 4 0 0 1 1-8 6 6 0 0 1 11 1 4 4 0 0 1 2 7 M7 18l-1 3 M12 17l-1 3 M17 18l-1 3',
  snow:'M12 2v20 M3 7l18 10 M3 17 21 7 M9 4l3 3 3-3 M9 20l3-3 3 3 M3 10l4-1 1-4 M16 19l1-4 4-1 M3 14l4 1 1 4 M16 5l1 4 4 1',
  moon:'M20 14a8.5 8.5 0 1 1-10-11 7 7 0 0 0 10 11Z',
  sliders:'M5 3v4 M5 11v10 M12 3v10 M12 17v4 M19 3v3 M19 10v11 M2 7h6v4H2V7Z M9 13h6v4H9v-4Z M16 6h6v4h-6V6Z',
  'sound-off':'M11 4 5 9H2v6h3l6 5V4Z M16 9l6 6 M22 9l-6 6',
  sound:'M11 4 5 9H2v6h3l6 5V4Z M15 8a6 6 0 0 1 0 8 M18 5a10 10 0 0 1 0 14',
  expand:'M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5',
  close:'M6 6l12 12 M18 6 6 18'
};
const icon=n=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n]||ICONS.sun}"/></svg>`;
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));}
icons();
const STORAGE_KEYS=['skypond-v1','bichi-pond-v1','xitan-pond-v1','bitan-pond-v1'];
let saved=null;try{saved=sanitizeSave(JSON.parse(STORAGE_KEYS.map(k=>localStorage.getItem(k)).find(v=>v)));}catch{}
// 手动可选的池塘底图；默认图优先用内嵌 base64，四季图为外部文件，所有图同为 1672x941。
const BACKGROUNDS=[
  {id:'default',label:'默认',src:window.POND_IMAGE||'assets/pond.webp'},
  {id:'spring',label:'春 · 新荷',src:'assets/pond-spring.webp'},
  {id:'summer',label:'夏 · 盛荷',src:'assets/pond-summer.webp'},
  {id:'autumn',label:'秋 · 残荷',src:'assets/pond-autumn.webp'},
  {id:'winter',label:'冬 · 枯荷',src:'assets/pond-winter.webp'}
];
const BACKGROUND_IDS=BACKGROUNDS.map(b=>b.id);
// 竖排诗句库：tags 为应景情境（天气/季节），空数组表示通用；切换天气或季节时在应景+通用句中随机。
const VERSES=[
  {a:'水清鱼读月',b:'山静鸟谈天',tags:['night']},
  {a:'池清鱼读月',b:'林静鸟谈天',tags:['night']},
  {a:'鱼跃波心月',b:'鸟啼雨后山',tags:['rain','night']},
  {a:'鱼戏莲叶间',b:'鸟鸣池畔树',tags:['summer','sunny']},
  {a:'闲看鱼戏水',b:'静听鸟谈天',tags:[]},
  {a:'半塘天影动',b:'一鉴云光浮',tags:['cloudy']},
  {a:'云影塘中过',b:'天光水底回',tags:['cloudy','sunny']},
  {a:'半塘藏日月',b:'一鉴纳云光',tags:['night','cloudy']},
  {a:'天光浮水面',b:'云影落波心',tags:['sunny','cloudy']},
  {a:'一塘开晓镜',b:'半亩纳云光',tags:['sunny','cloudy']},
  {a:'观鱼临半塘',b:'望云忘四时',tags:[]},
  {a:'塘小堪观景',b:'水清可读月',tags:['night']},
  {a:'一池分四季',b:'半亩纳天光',tags:[]},
  {a:'临塘观万物',b:'对影识四时',tags:[]},
  {a:'半亩方塘一鉴开',b:'天光云影共徘徊',tags:[]},
  {a:'云影半塘开晓镜',b:'天光一鉴纳清辉',tags:['cloudy','sunny']},
  {a:'鱼戏方塘波弄影',b:'鸟啼深树雨如烟',tags:['rain']},
  {a:'一池月色清如洗',b:'半亩云光淡欲秋',tags:['autumn','night']},
  {a:'听雨观鱼心自静',b:'看云悟道意偏闲',tags:['rain']}
];
let verseIndex=-1;
const defaults={background:'default',weather:'sunny',speed:1,turtles:true,crabs:true,silverCarp:true,butterflies:true,names:false,quality:'high',autoWeather:false,location:null,night:false,moonPhase:'full',water:true,waterType:'stream',waterVol:.6,weatherSound:true,weatherVol:.6,music:'guqin',musicVol:.5,noiseType:'off',noiseVol:.5,sfx:true,volume:.7,rainAmount:.5,snowAmount:.5,soundOn:false};
const settings={...defaults};
// Copy valid values from a stored settings object (this page's save, or one written by another window).
function readSettings(src){for(const key of ['turtles','crabs','silverCarp','butterflies','names','autoWeather','night','sfx','water','weatherSound','soundOn'])if(typeof src[key]==='boolean')settings[key]=src[key];
  if(PondAudio.MUSIC.includes(src.music))settings.music=src.music;if(PondAudio.WATERS.includes(src.waterType))settings.waterType=src.waterType;if(PondAudio.NOISE_TYPES.includes(src.noiseType)||PondAudio.CUSTOM_SOUNDS.some(s=>s.id===src.noiseType))settings.noiseType=src.noiseType;for(const key of ['volume','waterVol','weatherVol','musicVol','noiseVol','rainAmount','snowAmount'])if(Number.isFinite(src[key]))settings[key]=clamp(src[key],0,1);
  if(['sunny','cloudy','rain','snow'].includes(src.weather))settings.weather=src.weather;
  if(BACKGROUND_IDS.includes(src.background))settings.background=src.background;
  settings.speed=clamp(Number(src.speed)||1,.3,2);
  if(['high','eco'].includes(src.quality))settings.quality=src.quality;
  if(['new','quarter','full'].includes(src.moonPhase))settings.moonPhase=src.moonPhase;
  const l=src.location;if(l&&typeof l.name==='string'&&Number.isFinite(l.latitude)&&Number.isFinite(l.longitude))settings.location={name:l.name.slice(0,80),latitude:clamp(l.latitude,-90,90),longitude:clamp(l.longitude,-180,180)};
}
if(saved)readSettings(saved.settings);
function dayKey(){return new Date().toLocaleDateString('en-CA');}
let daily=saved?.daily?.date===dayKey()?{date:dayKey(),count:clamp(Number(saved.daily.count)||0,0,999999)}:{date:dayKey(),count:0};
// A first visit gets the same 24 koi in every window that opens at once (each desktop screen, say), so they agree from the start.
const fish=saved?.fish||Array.from({length:24},(_,i)=>({...createFish(i,randomSeed(i*7+3)),id:`koi-${i+1}`}));
// 池塘满了以后新鱼先在岸边排队；队列跟着存档走，重开还在。
let queue=Array.isArray(saved?.queue)?saved.queue.slice(0,QUEUE_CAP):[];
const sound=new PondAudio.PondAudio();sound.configure(settings);
let canvas=$('#world');const labels=$('#labels'),labelCtx=labels.getContext('2d');
const simulation=new PondSimulation(fish,innerWidth,innerHeight,Math.random,createSilverCarpShoal(),settings.silverCarp);
let width=innerWidth,height=innerHeight,dpr=1,feedMode=true,zen=false,paused=false,activePanel='',last=0,time=0,lastFrame=0,hostFps=60;
let previewFish=null,previewCanvas=null,previewSprite=null,previewKey='',weatherData=null,toastTimer=0,persistTimer=0,weatherRequest=0,citySearchController=null;
let renderer=null,scene=null,bedImage=null;const sprites=PondArt.miscSprites(),spriteCache=new Map(),PREVIEW_K=4.6;
const prefersReduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
// ?mode=wallpaper: the pond as a desktop or phone live wallpaper. No controls (the home screen has its own);
// taps on empty desktop space arrive through pondTap. The host stops drawing it whenever it is hidden.
const wallpaperMode=new URLSearchParams(location.search).get('mode')==='wallpaper';
if(wallpaperMode)document.body.classList.add('wallpaper');
if(prefersReduced&&!saved){settings.speed=.4;settings.quality='eco';document.body.classList.add('reduced-motion');}
// Several pages can share one pond (the desktop wallpaper on each screen plus its interactive window, the Android
// wallpaper and its app, or browser tabs); each host passes a page's saves to the others (see __pondSync).
// rev stamps the last change a person made (settings, names, fish added or let go); eating only bumps counts, which merge.
const editSignature=()=>JSON.stringify([settings,simulation.fish.map(f=>[f.id,f.name,f.palette,f.size,f.seed,marksHash(f.marks)]),queue.map(q=>[q.name,q.palette,q.adultSize])]);
let rev=Number(saved?.rev)||0,editSig=editSignature();
function persist(){const sig=editSignature();if(sig!==editSig)rev=Date.now();editSig=sig;const data=JSON.stringify({rev,fish:simulation.fish.map(({id,name,palette,size,seed,eaten,marks,adultSize,fry,fedDates})=>({id,name,palette,size,seed,eaten,marks,adultSize,fry,fedDates})),queue,settings,daily});
  try{localStorage.setItem('skypond-v1',data);}catch{toast('浏览器暂时无法保存，下次打开可能无法恢复记录');}
  try{window.webkit?.messageHandlers?.pond?.postMessage(data);}catch{}try{window.PondHost?.postMessage(data);}catch{}try{window.chrome?.webview?.postMessage(data);}catch{}}
// Take in a save written by another page: its settings and collection if its edit is newer, and the larger meal counts either way.
function applyExternalSave(raw){let data;try{data=JSON.parse(raw);}catch{return;}const s=sanitizeSave(data);if(!s)return;
  const newer=(Number(data.rev)||0)>rev,byId=new Map(simulation.fish.map(f=>[f.id,f]));
  if(s.daily?.date===daily.date)daily.count=Math.max(daily.count,clamp(Number(s.daily.count)||0,0,999999));
  if(newer){rev=Number(data.rev);const quality=settings.quality,auto=settings.autoWeather;readSettings(s.settings);
    const next=s.fish.map(src=>{const f=byId.get(src.id);if(!f)return src;const look=f.palette!==src.palette||f.seed!==src.seed||f.size!==src.size||marksHash(f.marks)!==marksHash(src.marks);
      Object.assign(f,{name:src.name,palette:src.palette,size:src.size,seed:src.seed,marks:src.marks,eaten:Math.max(f.eaten,src.eaten),adultSize:src.adultSize,fry:src.fry,fedDates:src.fedDates});if(look)f.spriteReady=false;return f;});
    for(const f of simulation.fish)if(!next.includes(f)&&scene){scene.drop(f.x*width,f.y*height,12*scene.scale,.8);scene.wakes.delete(f);}
    simulation.fish.splice(0,simulation.fish.length,...next);queue=Array.isArray(s.queue)?s.queue.slice(0,QUEUE_CAP):[];drainQueue();simulation.residentsOn=settings.silverCarp;simulation.allFish.forEach((f,i)=>{if(f.spriteCell!==i)f.spriteReady=false;});uploadSprites();
    if(settings.quality!==quality)resize();applyWeather();if(settings.autoWeather&&!auto)fetchWeather();syncSound();
  }else for(const src of s.fish){const f=byId.get(src.id);if(f)f.eaten=Math.max(f.eaten,src.eaten);}
  editSig=editSignature();updateMeta();if(activePanel==='ranking')renderRanking();}
window.__pondSync=applyExternalSave;
addEventListener('storage',e=>{if(STORAGE_KEYS.includes(e.key)&&e.newValue)applyExternalSave(e.newValue);});
function scheduleSave(){clearTimeout(persistTimer);persistTimer=setTimeout(persist,500);}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200);}
// Draw at the screen's full pixel density (phones are 2.5–3.5×; the canvas size cap in the renderer keeps big
// desktop screens in check). A device that cannot keep up steps down in two stages, never below 1×, for this session.
const perf={t:0,n:0,level:0,scales:[1,.72,.5]};
// 月下模式默认更安静：画面走节能档（缓冲更小、30 帧），鱼游得更慢、更常歇着。
const effectiveQuality=()=>settings.night?'eco':settings.quality;
const targetFps=()=>Math.min(hostFps,effectiveQuality()==='eco'?30:60);
function resize(){
  width=innerWidth;height=innerHeight;dpr=effectiveQuality()==='eco'?1:Math.max(1,Math.min(devicePixelRatio||1,3)*perf.scales[perf.level]);
  simulation.width=width;simulation.height=height;simulation.scale=clamp(Math.min(width,height)/720,.66,1.25);
  labels.width=Math.round(width*dpr);labels.height=Math.round(height*dpr);
  if(renderer){renderer.resize(width,height,dpr,effectiveQuality());scene.layout(width,height);}
}
addEventListener('resize',resize);resize();
// Sprites are keyed by what they depict; pond fish never change after creation, the preview does.
function marksHash(marks){let h=marks?marks.length:0;if(marks)for(const m of marks)h=(h*31+Math.round(m.x*10)*7+Math.round(m.y*10)*13+m.r*17+parseInt(m.color.slice(1),16))|0;return h;}
const spriteKey=f=>`${f.species||'koi'}:${f.palette}:${f.seed}:${marksHash(f.marks)}`;
function fishCanvas(f){const key=spriteKey(f);let c=spriteCache.get(key);if(!c){c=PondArt.fishSprite(f,PondGL.FISH_PPU);spriteCache.set(key,c);if(spriteCache.size>120)spriteCache.delete(spriteCache.keys().next().value);}return c;}
function uploadSprites(){if(!renderer)return;simulation.allFish.forEach((f,i)=>{if(!f.spriteReady||f.spriteCell!==i){renderer.setFish(i,fishCanvas(f));f.spriteReady=true;f.spriteCell=i;}});}
function bindCanvas(){canvas.addEventListener('pointerdown',e=>feedAt(e.clientX,e.clientY));canvas.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();feedAt(width*.5,height*.5);}});}
bindCanvas();
function createPond(){
  renderer=PondGL.createRenderer(canvas,bedImage,sprites,()=>{renderer=null;createPond();},PondScene.floatMask(bedImage.naturalWidth,bedImage.naturalHeight));
  if(!renderer){toast('当前浏览器无法绘制池塘');return;}
  if(renderer.canvas!==canvas){canvas=renderer.canvas;bindCanvas();}
  document.body.classList.toggle('gl',renderer.kind==='webgl2');
  if(scene)scene.R=renderer;else scene=new PondScene.PondScene(renderer,simulation);
  resize();scene.update(0,settings);scene.setLook(settings.weather,settings.night,undefined,settings);
  simulation.allFish.forEach(f=>f.spriteReady=false);uploadSprites();
}
function drawLabels(){
  if(!settings.names){if(labels.dataset.on){labelCtx.clearRect(0,0,labels.width,labels.height);labels.dataset.on='';}return;}
  labels.dataset.on='1';labelCtx.setTransform(dpr,0,0,dpr,0,0);labelCtx.clearRect(0,0,width,height);
  labelCtx.font='11px "PingFang SC","Microsoft YaHei",sans-serif';labelCtx.textAlign='center';labelCtx.lineJoin='round';labelCtx.lineWidth=3;labelCtx.strokeStyle='rgba(34,52,45,.55)';labelCtx.fillStyle='#fbf9ec';
  for(const f of simulation.allFish){const x=f.x*width,y=f.y*height-16*f.size*simulation.scale;labelCtx.strokeText(f.name,x,y);labelCtx.fillText(f.name,x,y);}
}
function drawPreview(dt){
  if(!previewCanvas||!previewFish||!dialog.open)return;
  const c=previewCanvas.getContext('2d'),key=spriteKey(previewFish);c.clearRect(0,0,previewCanvas.width,previewCanvas.height);
  if(key!==previewKey){previewSprite=PondArt.fishSprite(previewFish,5,previewSprite);previewKey=key;}
  if(!previewFish.painting)previewFish.phase+=dt*4.2;
  PondScene.drawKoi2D(c,previewFish,previewSprite,sprites,previewCanvas.width*.53,previewCanvas.height*.5,0,previewFish.size*PREVIEW_K,previewFish.painting?0:.5);
}
function frame(now){requestAnimationFrame(frame);const frameInterval=1000/Math.min(hostFps,effectiveQuality()==='eco'?30:60);if(now-lastFrame<frameInterval*.8)return;lastFrame=now;const dt=last?Math.min((now-last)/1000,.05):.016;last=now;if(paused||document.hidden||!renderer)return;time+=dt;
  // Judge smoothness against the frame rate this pond aims for, not a fixed number (a 30 fps host is not "slow").
  if(time>4&&perf.level<2&&dpr>1){perf.t+=dt;perf.n++;if(perf.t>5){const fps=perf.n/perf.t;if(fps<targetFps()*.75){perf.level++;resize();if(!wallpaperMode)toast('已自动调低画面精度，让池塘保持流畅');}perf.log=fps;perf.t=perf.n=0;}}
  // A status line in the host's log now and then (Android logcat, WebView2 dev tools) for checking a device.
  if(time>=(perf.next??8)){perf.next=time+60;console.info(`[pond] ${Math.round(perf.log||0)} fps · ${dpr.toFixed(2)}x · ${renderer.canvas.width}×${renderer.canvas.height} · level ${perf.level}`);}
  const eaten=simulation.totalEaten;simulation.step(dt,settings.speed,settings.night?1:0);if(eaten!==simulation.totalEaten)scheduleSave();
  for(const e of simulation.events.splice(0))if(e.type==='eat'){scene.drop(e.x,e.y,5*scene.scale,.3);if(sound.active)sound.gulp();}
  scene.setLook(settings.weather,settings.night,dt,settings);scene.update(dt,settings);
  for(const e of scene.events.splice(0))if(e.type==='thunder')sound.thunderAfter(e.delay,e.strength);
  scene.draw(settings);renderer.render(time,dt,scene.look);
  drawLabels();drawPreview(dt);
}
async function start(){
  bedImage=new Image();bedImage.src=window.POND_IMAGE||'assets/pond.webp';
  await new Promise(resolve=>{bedImage.onload=resolve;bedImage.onerror=resolve;if(bedImage.complete)resolve();});
  if(!bedImage.naturalWidth){toast('池塘底图加载失败');return;}
  createPond();applyBackground();pickVerse(false);if(queue.length)drainQueue(true);requestAnimationFrame(frame);
}
start();
function updateMeta(){if(daily.date!==dayKey())daily={date:dayKey(),count:0};const fryCount=simulation.fish.filter(f=>f.fry).length;$('#fish-count').textContent=`${simulation.fish.length} 尾锦鲤${fryCount?` · ${fryCount} 尾苗期`:''}${queue.length?` · ${queue.length} 尾待入池`:''}${settings.silverCarp?` · ${simulation.residents.length} 尾青鲢`:''}`;$('#fed-count').textContent=`今日投喂 ${daily.count} 次`;}
function feedAt(x,y){if(!scene)return;scene.startle(x,y);if(!feedMode){scene.drop(x,y,9*scene.scale,.9);simulation.scare(x,y,170*scene.scale);sound.tap();return;}scene.drop(x,y,7*scene.scale,.5);const before=simulation.food.length;if(simulation.feed(x,y)){for(const p of simulation.food.slice(before))scene.drop(p.x,p.y,3*scene.scale,.22);if(daily.date!==dayKey())daily={date:dayKey(),count:0};daily.count++;updateMeta();scheduleSave();if(sound.active)sound.plop();}else toast('鱼食还没吃完，让小鱼慢慢享用吧');}
$('#feed-button').addEventListener('click',()=>{feedMode=!feedMode;$('#feed-button').classList.toggle('active',feedMode);$('#feed-button').setAttribute('aria-pressed',feedMode);$('#pond-hint').textContent=feedMode?'轻点水面，投下一点欢喜':'轻点水面，泛起一圈涟漪';toast(feedMode?'投喂已开启，轻点水面试试':'观鱼模式 · 轻点水面，鱼儿会受惊游开');});
// 应用手动选择的池塘底图：更新 CSS 背景（2D 降级路径）并在 WebGL 路径重新上传纹理。
function applyBackground(){
  const bg=BACKGROUNDS.find(b=>b.id===settings.background)||BACKGROUNDS[0];
  const bed=$('.pond-bed');
  if(bed)bed.style.backgroundImage=`url('${bg.src}')`;
  if(renderer&&renderer.kind==='webgl2'){
    const img=new Image();
    img.onload=()=>{if(renderer&&renderer.setBedImage)renderer.setBedImage(img);};
    img.src=bg.src;
  }
}
// 当前应景情境：夜间优先 night，否则取天气；另加当前季节背景。
function verseContext(){
  const tags=[];
  if(settings.night)tags.push('night');else tags.push(settings.weather);
  if(settings.background!=='default')tags.push(settings.background);
  return tags;
}
// manual=true 时点击诗句：从全库随机；否则在应景+通用句中随机，且避开当前句。
function pickVerse(manual){
  const context=verseContext();
  let pool=VERSES.map((_,i)=>i).filter(i=>manual||!VERSES[i].tags.length||VERSES[i].tags.some(t=>context.includes(t)));
  if(pool.length<=1)pool=VERSES.map((_,i)=>i);
  let choices=pool.filter(i=>i!==verseIndex);
  if(!choices.length)choices=pool;
  verseIndex=choices[Math.floor(Math.random()*choices.length)];
  renderVerse();
}
function renderVerse(){
  const v=VERSES[verseIndex],box=$('#verse');
  if(!v)return;
  const spans=box.querySelectorAll('span');
  spans[0].textContent=v.a;spans[1].textContent=v.b;
  box.classList.toggle('long',v.a.length>5);
  box.classList.remove('show');void box.offsetWidth;box.classList.add('show');
}
$('#verse').addEventListener('click',()=>pickVerse(true));
$('#verse').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pickVerse(true);}});
function applyWeather(){document.body.classList.remove('sunny','cloudy','rain','snow','night');document.body.classList.add(settings.weather);document.body.classList.toggle('night',settings.night);const labels={sunny:'晴日',cloudy:'多云',rain:rainLabel(),snow:snowLabel()};const notes={sunny:'风轻水暖，正宜观鱼',cloudy:'云影悠悠，偷得浮生闲',rain:settings.rainAmount>.67?'骤雨打荷，满池飞珠':'一池细雨，满塘清欢',snow:settings.snowAmount>.67?'大雪纷飞，一池素白':'落雪无声，岁月安然'};$('#weather-symbol').innerHTML=icon(settings.night?'moon':settings.weather==='sunny'?'sun':settings.weather);$('#weather-label').textContent=labels[settings.weather];$('#temperature').textContent=settings.autoWeather&&weatherData?`${Math.round(weatherData.temperature_2m)}°C`:'随心天气';$('#weather-location').textContent=settings.autoWeather&&settings.location?settings.location.name:'池畔时光';$('#weather-note').textContent=settings.night&&settings.weather!=='rain'?`月色如水 · ${PondScene.MOON_LABELS[settings.moonPhase]||PondScene.moonPhase().name}当空`:notes[settings.weather];sound.configure(settings);}
function rainLabel(){return settings.rainAmount<.34?'小雨':settings.rainAmount<.67?'中雨':'大雨';}
function snowLabel(){return settings.snowAmount<.34?'小雪':settings.snowAmount<.67?'中雪':'大雪';}
function clockTick(){const date=new Date();$('#clock').textContent=date.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});$('#clock').dateTime=date.toISOString();$('#calendar').textContent=date.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});updateMeta();}clockTick();setInterval(clockTick,1000);applyWeather();
const dialog=$('#panel');
document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.panel)));
$('.close-panel').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>{activePanel='';previewCanvas=null;previewFish=null;citySearchController?.abort();});
function openPanel(type){activePanel=type;previewCanvas=null;previewFish=null;const names={fish:['我的锦鲤','MEET YOUR LITTLE FRIENDS'],ranking:['锦鲤食量榜','A LITTLE APPETITE, A LOT OF JOY'],weather:['池塘天气','EVERY WEATHER HAS ITS POETRY'],settings:['池塘设置','MAKE YOURSELF AT HOME']};$('#panel-title').textContent=names[type][0];$('#panel-eyebrow').textContent=names[type][1];({fish:renderFish,ranking:renderRanking,weather:renderWeather,settings:renderSettings})[type]();if(!dialog.open)dialog.showModal();}
function thumbnail(f,width=120,height=60){const c=document.createElement('canvas');c.width=width*2;c.height=height*2;c.style.width=`${width}px`;c.style.height=`${height}px`;const context=c.getContext('2d');context.scale(2,2);const s=Math.min(f.size*.95,width*.86/96);PondScene.drawKoi2D(context,{...f,phase:1},fishCanvas(f),sprites,width*.5+12*s,height*.5-1.4*s,-.12,s,.35);return c;}
function renderFish(){const content=$('#panel-content');content.innerHTML=`<p class="description">为你的池塘添一尾锦鲤。新鱼以苗期入水，连着喂它 ${GROW_DAYS} 天就会长大；池塘满了会先在岸边排队。</p><div class="fish-preview"><canvas id="preview" width="880" height="290" aria-label="锦鲤外观预览"></canvas><span class="preview-label">一鱼一色 · 各有欢喜</span></div><div class="form-row"><label>锦鲤花色</label><div class="palette">${PALETTES.map((p,i)=>`<button type="button" class="swatch ${i===0?'selected':''}" style="background:${p.spot}" data-palette="${i}" aria-label="${p.name}" aria-pressed="${i===0}"></button>`).join('')}</div><span id="palette-name" class="small-note">红白</span></div><div class="form-row"><label for="fish-size">锦鲤大小</label><input id="fish-size" type="range" min="0.45" max="1.5" step="0.05" value="0.9"/><button id="new-pattern" class="edit-fish">换个花纹 ↻</button></div><div class="form-row paint-tools"><label>手绘花纹</label><span class="small-note">在鱼身上按住拖动就能画</span><span id="paint-count" class="small-note">0 笔</span><input id="paint-color" type="color" value="#bc5036" aria-label="画笔颜色"/><button id="clear-paint" type="button" class="edit-fish">清除</button></div><form id="add-fish-form"><div class="form-row"><label for="fish-name">给它起名</label><input id="fish-name" type="text" maxlength="12" placeholder="例如：小满、如意、听雨" autocomplete="off"/></div><div class="form-actions"><span class="small-note">画好、起名，一按就下水 · 苗期 ${GROW_DAYS} 天成年</span><button class="primary" type="submit">画好了，放入池塘 ＋</button></div></form><h3>我的小伙伴 <span id="collection-count" class="small-note"></span></h3><div class="fish-grid" id="fish-grid"></div><div id="fish-queue"></div>`;
  previewFish={...createFish(0),palette:0,angle:0,size:.9,marks:[],painting:true};previewCanvas=$('#preview');previewCanvas.style.cursor='crosshair';
  content.querySelectorAll('[data-palette]').forEach(b=>b.addEventListener('click',()=>{previewFish.palette=Number(b.dataset.palette);content.querySelectorAll('[data-palette]').forEach(s=>{s.classList.toggle('selected',s===b);s.setAttribute('aria-pressed',s===b);});$('#palette-name').textContent=PALETTES[previewFish.palette].name;}));
  let painting=false,painted=-1;
  $('#clear-paint').addEventListener('click',()=>{previewFish.marks=[];painted=-1;});
  function brush(e){if(!previewFish?.painting||!painting)return;const box=previewCanvas.getBoundingClientRect(),scale=previewFish.size*PREVIEW_K;const x=((e.clientX-box.left)*previewCanvas.width/box.width-previewCanvas.width*.53)/scale,y=((e.clientY-box.top)*previewCanvas.height/box.height-previewCanvas.height*.5)/scale;if(x < -32 || x > 32 || Math.abs(y)>12)return;const mark={x,y,r:3,color:$('#paint-color').value};if(previewFish.marks.length<400)previewFish.marks.push(mark);if(previewFish.marks.length!==painted){painted=previewFish.marks.length;const c=$('#paint-count');if(c)c.textContent=`${painted} 笔`;}}
  previewCanvas.addEventListener('pointerdown',e=>{painting=true;previewCanvas.setPointerCapture(e.pointerId);brush(e);});previewCanvas.addEventListener('pointermove',brush);previewCanvas.addEventListener('pointerup',()=>painting=false);previewCanvas.addEventListener('pointercancel',()=>painting=false);
  $('#fish-size').addEventListener('input',e=>previewFish.size=Number(e.target.value));$('#new-pattern').addEventListener('click',()=>previewFish.seed=Math.floor(Math.random()*100000));
  $('#add-fish-form').addEventListener('submit',e=>{e.preventDefault();const spec={palette:previewFish.palette,adultSize:previewFish.size,seed:previewFish.seed,marks:previewFish.marks.map(m=>({...m})),name:$('#fish-name').value.trim().slice(0,12)};const fry=makeFry(spec);let queued=false,stored=false;if(simulation.fish.length<POND_CAP){enterPond(fry);stored=true;}else if(queue.length<QUEUE_CAP){queue.push({name:fry.name,palette:fry.palette,adultSize:fry.adultSize,seed:fry.seed,marks:fry.marks.map(m=>({...m}))});queued=true;stored=true;}if(!stored)return toast('池塘和岸边都满了，先放生一尾再来接新朋友');$('#fish-name').value='';updateMeta();persist();dialog.close();toast(queued?`池塘已满，「${fry.name}」在岸边排队，放生一尾就游进来`:`「${fry.name}」以苗期入水，连着喂它 ${GROW_DAYS} 天就长大了`);});renderCollection();$('#fish-name')?.focus();}
function renderCollection(){$('#collection-count').textContent=`· ${simulation.fish.length} / ${POND_CAP} 尾`;const grid=$('#fish-grid');grid.replaceChildren();for(const f of simulation.fish){const tile=document.createElement('div');tile.className='fish-tile';const thumb=document.createElement('div');thumb.className='fish-thumb';thumb.append(thumbnail(f));const foot=document.createElement('div');foot.className='fish-tile-foot';const name=document.createElement('span');name.textContent=f.name;const edit=document.createElement('button');edit.className='edit-fish';edit.textContent='改名';edit.setAttribute('aria-label',`给${f.name}改名`);edit.addEventListener('click',()=>{const input=document.createElement('input');input.type='text';input.value=f.name;input.maxLength=12;input.setAttribute('aria-label','锦鲤新名字');input.style.cssText='padding:5px;min-width:0;font-size:10px';name.replaceWith(input);edit.textContent='保存';edit.setAttribute('aria-label',`保存${f.name}的新名字`);let done=false;const commit=()=>{if(done)return;done=true;f.name=input.value.trim().slice(0,12)||f.name;persist();renderCollection();toast('名字已保存');};edit.onclick=commit;input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commit();}if(e.key==='Escape'){e.stopPropagation();renderCollection();}});input.focus();input.select();},{once:true});const release=document.createElement('button');release.className='edit-fish release-fish';release.textContent='放生';release.setAttribute('aria-label',`放生${f.name}`);let armed=0;release.addEventListener('click',()=>{if(simulation.fish.length<=1)return toast('池塘里至少留一尾锦鲤');if(!armed){release.textContent='确认放生';release.classList.add('armed');armed=setTimeout(()=>{armed=0;release.textContent='放生';release.classList.remove('armed');},3000);return;}clearTimeout(armed);releaseFish(f);});const actions=document.createElement('span');actions.className='fish-actions';actions.append(edit,release);foot.append(name,actions);const st=growthStage(f);const stage=document.createElement('span');stage.className='fish-stage'+(st.adult?'':' fry');stage.textContent=st.adult?`成年 · 吃了 ${f.eaten} 粒`:`苗期 · 已喂 ${st.days}/${GROW_DAYS} 天`;tile.append(thumb,foot,stage);grid.append(tile);}
  const qbox=$('#fish-queue');if(qbox){qbox.replaceChildren();if(queue.length){const head=document.createElement('h3');head.textContent='岸边排队';const note=document.createElement('span');note.className='small-note';note.textContent=`${queue.length} 尾 · 放生一尾就游进来`;head.append(note);qbox.append(head);const list=document.createElement('div');list.className='queue-list';for(const q of queue){const chip=document.createElement('span');chip.className='queue-chip';chip.textContent=q.name;list.append(chip);}qbox.append(list);}}}
// 新放入的鱼都以苗期入场：成年体长按面板里选的大小，实际体长从 FRY_SCALE 起随喂食天数长到 1。
function makeFry(spec){const base=createFry(simulation.fish.length+queue.length,Math.random,clamp(Number(spec.adultSize)||.9,.45,1.5));const f={...base,palette:Number.isInteger(spec.palette)?spec.palette:0,seed:Number.isFinite(spec.seed)?spec.seed:base.seed,marks:Array.isArray(spec.marks)?spec.marks.map(m=>({...m})):[],size:frySize(Number(spec.adultSize)||.9,0)};if(spec.name)f.name=String(spec.name).slice(0,12);return f;}
function enterPond(f){simulation.fish.push(f);uploadSprites();if(scene)scene.drop(f.x*width,f.y*height,8*scene.scale,.35);updateMeta();}
// 池塘腾出位置后，队首依次游进来；quiet 用在“放生”之后（那时已经有放生的提示了）。
function drainQueue(quiet=false){let moved=0;while(queue.length&&simulation.fish.length<POND_CAP){const q=queue.shift();const f=makeFry(q);simulation.fish.push(f);if(scene)scene.drop(f.x*width,f.y*height,8*scene.scale,.35);moved++;}if(moved){uploadSprites();updateMeta();persist();if(!quiet){const last=simulation.fish[simulation.fish.length-1];toast(moved===1?`「${last.name}」从岸边游进池塘了，它会记住你投下的每一粒鱼食`:`岸边排队的 ${moved} 尾锦鲤已经游进池塘`);}if(activePanel==='fish')renderCollection();}return moved;}

function releaseFish(f){const i=simulation.fish.indexOf(f);if(i<0||simulation.fish.length<=1)return;if(scene){scene.drop(f.x*width,f.y*height,12*scene.scale,.8);scene.wakes.delete(f);}simulation.fish.splice(i,1);simulation.fish.forEach((g,j)=>{if(j>=i)g.spriteReady=false;});uploadSprites();updateMeta();persist();renderCollection();drainQueue(true);toast(`「${f.name}」已放生，愿它自在悠游`);}
function renderRanking(){const total=simulation.fish.reduce((n,f)=>n+f.eaten,0);$('#panel-content').innerHTML=`<p class="description">每一粒鱼食都有归属，每一尾锦鲤都值得偏爱。<br>小伙伴们一共吃掉了 <strong>${total}</strong> 粒鱼食 · 数据保存在此设备</p><div class="ranking-list" id="ranking-list"></div><div class="dialog-footer">按累计进食数量排序。去水面投喂，再回来看看谁是小吃货。</div>`;[...simulation.fish].sort((a,b)=>b.eaten-a.eaten).forEach((f,i)=>{const row=document.createElement('div');row.className='rank-row';row.innerHTML=`<span class="rank-number">${String(i+1).padStart(2,'0')}</span><div class="rank-thumbnail"></div><div class="rank-info"><span></span><small>${PALETTES[f.palette].name}</small></div><div class="rank-score">${f.eaten}<small>粒</small></div>`;row.querySelector('.rank-info span').textContent=f.name;row.querySelector('.rank-thumbnail').append(thumbnail(f,72,43));$('#ranking-list').append(row);});}
function renderWeather(){$('#panel-content').innerHTML=`<p class="description">晴日看波光，雨天听水声。让池塘拥有此刻的心情。</p><div class="weather-options">${[['sunny','晴日','sun'],['cloudy','多云','cloudy'],['rain','下雨','rain'],['snow','落雪','snow']].map(([v,n,i])=>`<button class="weather-option ${settings.weather===v?'selected':''}" data-weather="${v}" aria-pressed="${settings.weather===v}">${icon(i)}<span>${n}</span></button>`).join('')}</div><div class="setting-row"><div>雨量<small id="rain-note">${rainLabel()} · 下雨时生效，跟随城市天气时自动调整</small></div><input id="rain-amount" type="range" aria-label="雨量" min="0" max="1" step="0.05" value="${settings.rainAmount}"/></div><div class="setting-row"><div>雪量<small id="snow-note">${snowLabel()} · 落雪时生效，荷叶上会渐渐积雪</small></div><input id="snow-amount" type="range" aria-label="雪量" min="0" max="1" step="0.05" value="${settings.snowAmount}"/></div><div class="setting-row"><div>月下观鱼<small>夜色里，池中映出一轮月；鱼游得更慢，也更常歇着</small></div><input id="night" type="checkbox" aria-label="月下观鱼" ${settings.night?'checked':''}/></div><div class="setting-row sub" id="moon-phase-row" ${settings.night?'':'hidden'}><div>月相<small>月下观鱼的点缀：新月细弧 / 弦月半轮 / 满月盈满</small></div><select id="moon-phase" aria-label="月相">${[['new','新月 · 细弧'],['quarter','弦月 · 半轮'],['full','满月 · 盈满']].map(([v,n])=>`<option value="${v}" ${settings.moonPhase===v?'selected':''}>${n}</option>`).join('')}</select></div><div class="setting-row"><div>跟随城市天气<small>每 15 分钟同步晴、雨、雪</small></div><input id="auto-weather" type="checkbox" aria-label="跟随城市天气" ${settings.autoWeather?'checked':''}/></div><h3>城市天气</h3><form id="city-form" class="form-row"><input id="city-input" aria-label="城市名称" type="text" maxlength="80" placeholder="输入城市，如北京、杭州、Shanghai" required/><button class="secondary" type="submit">查询</button></form><div id="city-results" class="city-results" aria-live="polite"></div><div class="weather-info" id="weather-info"></div><p class="dialog-footer">城市查询仅发送城市名称，天气查询使用所选城市坐标。<br>天气数据由 <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> 提供，无需 API 密钥。</p>`;
  updateWeatherInfo();document.querySelectorAll('[data-weather]').forEach(b=>b.addEventListener('click',()=>{settings.weather=b.dataset.weather;settings.autoWeather=false;weatherRequest++;persist();applyWeather();pickVerse(false);renderWeather();}));$('#night').addEventListener('change',e=>{settings.night=e.target.checked;const row=$('#moon-phase-row');if(row)row.hidden=!settings.night;resize();applyWeather();pickVerse(false);persist();});$('#moon-phase').addEventListener('change',e=>{settings.moonPhase=e.target.value;applyWeather();persist();});$('#rain-amount').addEventListener('input',e=>{settings.rainAmount=Number(e.target.value);$('#rain-note').firstChild.textContent=`${rainLabel()} · 下雨时生效，跟随城市天气时自动调整`;applyWeather();scheduleSave();});$('#snow-amount').addEventListener('input',e=>{settings.snowAmount=Number(e.target.value);$('#snow-note').firstChild.textContent=`${snowLabel()} · 落雪时生效，荷叶上会渐渐积雪`;applyWeather();scheduleSave();});$('#auto-weather').addEventListener('change',e=>{if(e.target.checked&&!settings.location){e.target.checked=false;toast('先查询并选择一个城市');$('#city-input').focus();return;}settings.autoWeather=e.target.checked;if(!settings.autoWeather)weatherRequest++;persist();applyWeather();if(settings.autoWeather)fetchWeather();updateWeatherInfo();});$('#city-form').addEventListener('submit',searchCity);}
function updateWeatherInfo(){const box=$('#weather-info');if(!box)return;if(settings.location&&weatherData){box.textContent=`${settings.location.name} · ${Math.round(weatherData.temperature_2m)}°C · 风速 ${weatherData.wind_speed_10m} km/h · ${settings.autoWeather?'正在联动池塘':'未开启天气联动'}`;}else if(settings.location){box.textContent=`已选择 ${settings.location.name} · ${settings.autoWeather?'正在获取实时天气…':'天气联动未开启'}`;}else box.textContent='当前为手动天气。查询城市后，选择搜索结果即可开启实时联动。';}
async function searchCity(e){e.preventDefault();const query=$('#city-input').value.trim();if(!query)return;const results=$('#city-results'),button=$('#city-form button');citySearchController?.abort();const controller=new AbortController();citySearchController=controller;const timeout=setTimeout(()=>controller.abort(),12000);button.disabled=true;button.textContent='查询中';results.textContent='正在寻找城市…';try{const response=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=zh&format=json`,{signal:controller.signal});if(!response.ok)throw Error('network');const data=await response.json();if(!results.isConnected)return;results.replaceChildren();if(!data.results?.length){results.textContent='没有找到这个城市，试试城市拼音或英文名称。';return;}for(const place of data.results){const b=document.createElement('button');b.className='city-result';b.textContent=`${place.name} · ${place.admin1||''} ${place.country||''}`;b.addEventListener('click',()=>{settings.location={name:place.name,latitude:place.latitude,longitude:place.longitude};settings.autoWeather=true;weatherData=null;persist();applyWeather();renderWeather();fetchWeather();});results.append(b);}}catch{if(results.isConnected)results.textContent='城市查询失败，请检查网络后重试。仍可使用上方的手动天气。';}finally{clearTimeout(timeout);if(button.isConnected){button.disabled=false;button.textContent='查询';}}}
async function fetchWeather(){if(!settings.autoWeather||!settings.location)return;const request=++weatherRequest,location={...settings.location};try{const response=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,weather_code,wind_speed_10m,precipitation,snowfall&timezone=auto`,{signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('network');const data=await response.json();if(request!==weatherRequest||!settings.autoWeather)return;if(!Number.isFinite(data.current?.temperature_2m)||!Number.isFinite(data.current?.weather_code))throw Error('data');weatherData=data.current;settings.weather=weatherFromCode(weatherData.weather_code);if(settings.weather==='rain'&&Number.isFinite(weatherData.precipitation))settings.rainAmount=clamp(.15+weatherData.precipitation/8,.15,1);if(settings.weather==='snow'&&Number.isFinite(weatherData.snowfall))settings.snowAmount=clamp(.2+weatherData.snowfall/1.5,.2,1);applyWeather();persist();if(activePanel==='weather')renderWeather();}catch{if(request!==weatherRequest)return;$('#weather-note').textContent='天气同步失败 · 保留当前天气';if(activePanel==='weather'&&$('#weather-info'))$('#weather-info').textContent='天气服务暂时无法连接，已保留当前池塘天气，可稍后重试。';toast('实时天气暂不可用，已保留当前天气');}}
setInterval(fetchWeather,15*60*1000);if(settings.autoWeather)fetchWeather();
// 别的窗口/宿主放生了一条鱼，这里也能把岸边排队的补进来。
setInterval(()=>{if(queue.length&&simulation.fish.length<POND_CAP)drainQueue();},2500);
function renderSettings(){$('#panel-content').innerHTML=`<p class="description">把这方小天地，调成你喜欢的模样。</p><div class="setting-row"><div>池塘景色<small>手动选择四季背景，不随时间自动更换</small></div><select id="background" aria-label="池塘景色">${BACKGROUNDS.map(b=>`<option value="${b.id}" ${settings.background===b.id?'selected':''}>${b.label}</option>`).join('')}</select></div><div class="setting-row"><div>诗句<small>切换天气或季节时随机，也可点击左侧诗句或此按钮换一句</small></div><button id="next-verse" class="secondary" type="button">换一句</button></div><div class="setting-row"><div>游动速度<small>慢一点，也是一种生活</small></div><input id="swim-speed" type="range" aria-label="游动速度" min="0.3" max="2" step="0.1" value="${settings.speed}"/></div>${[['turtles','小乌龟','两位慢悠悠的池塘住客'],['crabs','小螃蟹','在池边石头上横着走，一有动静就钻进水里'],['silverCarp','青鲢鱼','银鳞结伴，穿梭于锦鲤之间'],['butterflies','蝴蝶与蜻蜓','晴日蝶舞，蜻蜓点水，夜里萤火点点'],['names','显示锦鲤名字','在水面认出你的每一位朋友']].map(([k,n,d])=>`<div class="setting-row"><div>${n}<small>${d}</small></div><input data-setting="${k}" type="checkbox" aria-label="${n}" ${settings[k]?'checked':''}/></div>`).join('')}<div class="setting-row"><div>画面品质<small>节能模式限制至 30 帧；开启月下观鱼时自动走节能档</small></div><select id="quality" aria-label="画面品质"><option value="high" ${settings.quality==='high'?'selected':''}>细腻 · 60 帧</option><option value="eco" ${settings.quality==='eco'?'selected':''}>节能 · 30 帧</option></select></div><h3>声音</h3><div class="setting-row"><div>总音量<small>底栏喇叭可随时开关全部声音</small></div><input id="volume" type="range" aria-label="总音量" min="0" max="1" step="0.05" value="${settings.volume}"/></div><div class="setting-row"><div>水声<small>池畔流水，独立于天气</small></div><div class="sound-ctl"><input data-vol="waterVol" type="range" aria-label="水声音量" min="0" max="1" step="0.05" value="${settings.waterVol}"/><select id="water-type" aria-label="水声">${[['stream','溪流潺潺'],['spring','山泉叮咚'],['cascade','叠水瀑声'],['lapping','池水轻漾'],['bamboo','竹筒惊鹿'],['off','关闭']].map(([v,n])=>`<option value="${v}" ${(settings.water?settings.waterType:'off')===v?'selected':''}>${n}</option>`).join('')}</select></div></div>${[['weatherSound','weatherVol','天气环境音','晴有鸟鸣、阴闻布谷、雨落池塘、雪有寒鸦、夏夜虫蛙']].map(([k,v,n,d])=>`<div class="setting-row"><div>${n}<small>${d}</small></div><div class="sound-ctl"><input data-vol="${v}" type="range" aria-label="${n}音量" min="0" max="1" step="0.05" value="${settings[v]}"/><input data-sound="${k}" type="checkbox" aria-label="${n}" ${settings[k]?'checked':''}/></div></div>`).join('')}<div class="setting-row"><div>禅意音乐<small>稀疏几声，不扰清静</small></div><div class="sound-ctl"><input data-vol="musicVol" type="range" aria-label="禅意音乐音量" min="0" max="1" step="0.05" value="${settings.musicVol}"/><select id="music" aria-label="禅意音乐">${[['guqin','古琴'],['bowl','颂钵'],['chimes','风铃'],['off','关闭']].map(([v,n])=>`<option value="${v}" ${settings.music===v?'selected':''}>${n}</option>`).join('')}</select></div></div><div class="setting-row"><div>白噪声<small>学习工作时的专注背景音，连续稳定不打扰</small></div><div class="sound-ctl"><input data-vol="noiseVol" type="range" aria-label="白噪声音量" min="0" max="1" step="0.05" value="${settings.noiseVol}"/><select id="noise-type" aria-label="专注背景音"><option value="off" ${settings.noiseType==='off'?'selected':''}>关闭</option><optgroup label="基础噪声">${[['white','白噪声'],['pink','粉噪声'],['brown','棕噪声']].map(([v,n])=>`<option value="${v}" ${settings.noiseType===v?'selected':''}>${n}</option>`).join('')}</optgroup>${PondAudio.CUSTOM_SOUNDS.length?`<optgroup label="我的音频">${PondAudio.CUSTOM_SOUNDS.map(s=>`<option value="${s.id}" ${settings.noiseType===s.id?'selected':''}>${s.name}</option>`).join('')}</optgroup>`:''}</select></div></div><div class="setting-row"><div>互动水声<small>投喂、吞食与轻点水面的声音</small></div><input data-sound="sfx" type="checkbox" aria-label="互动水声" ${settings.sfx?'checked':''}/></div>${window.PondHost?`<div class="setting-row"><div>手机动态壁纸<small id="wallpaper-note">${PondHost.isWallpaperActive()?'池塘已在桌面上 · 轻点桌面空白处投喂':'把池塘设为手机桌面背景'}${PondHost.wallpaperStatus?.()?`<br>壁纸状态：${PondHost.wallpaperStatus().replace(/[<>&]/g,'')}`:''}</small></div><button id="set-wallpaper" class="secondary">设为壁纸</button></div>`:''}<div class="form-actions"><span class="small-note">锦鲤和投喂记录会自动保存在此设备</span><button id="fullscreen" class="secondary">全屏观鱼</button></div><div class="dialog-footer">空格：在池塘中央投喂（先点水面）<br>H：隐藏 / 显示界面 · Esc：退出面板或沉浸模式<br>本作品基于开源项目「碧池观鱼」二次创作，非原作者官方版本。</div>`;$('#set-wallpaper')?.addEventListener('click',()=>PondHost.setWallpaper());$('#background').addEventListener('change',e=>{settings.background=e.target.value;applyBackground();pickVerse(false);persist();});$('#next-verse').addEventListener('click',()=>pickVerse(true));$('#swim-speed').addEventListener('input',e=>{settings.speed=Number(e.target.value);scheduleSave();});document.querySelectorAll('[data-setting]').forEach(input=>input.addEventListener('change',()=>{settings[input.dataset.setting]=input.checked;if(input.dataset.setting==='silverCarp'){simulation.residentsOn=settings.silverCarp;simulation.residents.forEach(f=>f.spriteReady=false);uploadSprites();updateMeta();}persist();}));$('#quality').addEventListener('change',e=>{settings.quality=e.target.value;resize();persist();});const hint=()=>{if(!sound.active)toast('点击底栏喇叭即可试听');};$('#water-type').addEventListener('change',e=>{settings.water=e.target.value!=='off';if(settings.water)settings.waterType=e.target.value;sound.configure(settings);persist();hint();});$('#music').addEventListener('change',e=>{settings.music=e.target.value;sound.configure(settings);persist();hint();});$('#noise-type').addEventListener('change',e=>{settings.noiseType=e.target.value;sound.configure(settings);persist();hint();});document.querySelectorAll('[data-sound]').forEach(input=>input.addEventListener('change',()=>{settings[input.dataset.sound]=input.checked;sound.configure(settings);persist();hint();}));document.querySelectorAll('[data-vol]').forEach(input=>input.addEventListener('input',()=>{settings[input.dataset.vol]=Number(input.value);sound.configure(settings);scheduleSave();}));$('#volume').addEventListener('input',e=>{settings.volume=Number(e.target.value);sound.configure(settings);scheduleSave();});$('#fullscreen').addEventListener('click',async()=>{dialog.close();setZen(true);try{await document.documentElement.requestFullscreen();}catch{toast('已进入沉浸模式，此浏览器暂不支持全屏');}});}
function setZen(value){zen=value;document.body.classList.toggle('zen',zen);document.querySelectorAll('.ui').forEach(el=>el.inert=zen);$('#exit-zen').hidden=!zen;$('#zen-button').setAttribute('aria-label',zen?'退出沉浸模式':'进入沉浸模式');}
$('#zen-button').addEventListener('click',()=>setZen(true));$('#exit-zen').addEventListener('click',()=>{setZen(false);if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});});
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.key==='Escape'&&!dialog.open)setZen(false);if(e.key.toLowerCase()==='h'&&!dialog.open)setZen(!zen);});
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)setZen(false);});
function updateSoundButton(on){$('#sound-button').innerHTML=icon(on?'sound':'sound-off');$('#sound-button').setAttribute('aria-pressed',on);$('#sound-button').setAttribute('aria-label',on?'关闭声音':'开启声音');}
let soundSyncing=false;
// Follow the saved sound setting. The desktop wallpaper's pages carry no controls of their own (the bottom bar is
// hidden in wallpaper mode and taps on the desktop become food), so this is the only way they can ever play sound.
async function syncSound(){if(soundSyncing)return sound.active;soundSyncing=true;try{const on=await sound.setActive(settings.soundOn);updateSoundButton(on);return on;}catch{return false;}finally{soundSyncing=false;}}
async function toggleSound(){try{settings.soundOn=!sound.active;const on=await sound.setActive(settings.soundOn);updateSoundButton(on);toast(on?'声音已开启，可在设置里分别调节水声、环境音与音乐':'声音已关闭');persist();}catch{toast('当前浏览器无法播放声音');}}
$('#sound-button').addEventListener('click',toggleSound);
if(settings.soundOn)syncSound();
document.addEventListener('visibilitychange',()=>{last=0;if(sound.context&&sound.active){if(document.hidden)sound.context.suspend();else sound.context.resume();}if(document.hidden)persist();});
addEventListener('pagehide',persist);
function setPausedState(value){paused=!!value;last=0;if(sound.context&&sound.active){if(paused)sound.context.suspend();else sound.context.resume();}}
// For a host app (the Windows tray icon): switch weather, night or sound, pause the pond, read the current state.
window.pondControl={
  set(o={}){const nightWas=settings.night;if(['sunny','cloudy','rain','snow'].includes(o.weather)){settings.weather=o.weather;settings.autoWeather=false;weatherRequest++;}if(typeof o.night==='boolean')settings.night=o.night;if(['new','quarter','full'].includes(o.moonPhase))settings.moonPhase=o.moonPhase;if(typeof o.soundOn==='boolean'){settings.soundOn=o.soundOn;syncSound();}if(settings.night!==nightWas)resize();applyWeather();pickVerse(false);persist();if(activePanel==='weather')renderWeather();return this.state();},
  pause(value){setPausedState(value);return this.state();},
  state(){return{weather:settings.weather,night:settings.night,moonPhase:settings.moonPhase,autoWeather:settings.autoWeather,soundOn:sound.active,paused,fish:simulation.fish.length,queue:queue.length,fry:simulation.fish.filter(f=>f.fry).length};}
};
// A tap on the live wallpaper (CSS px): food while there is room for more, otherwise just a ripple that stirs the koi.
window.pondTap=(x,y)=>{if(!scene)return;if(simulation.food.length<=160){feedMode=true;feedAt(x,y);}else{scene.startle(x,y);scene.drop(x,y,9*scene.scale,.9);simulation.scare(x,y,170*scene.scale);}};
// Wallpaper Engine web wallpaper lifecycle and editable properties.
window.wallpaperPropertyListener={applyGeneralProperties(properties){if(properties.fps)hostFps=clamp(Number(properties.fps)||60,1,144);},applyUserProperties(properties){if(properties.weather&&['sunny','cloudy','rain','snow'].includes(properties.weather.value)){settings.weather=properties.weather.value;settings.autoWeather=false;weatherRequest++;}if(properties.speed)settings.speed=clamp(Number(properties.speed.value)||1,.3,2);if(properties.showui)setZen(!properties.showui.value);for(const [p,k] of [['water','water'],['weathersound','weatherSound']])if(properties[p])settings[k]=!!properties[p].value;if(properties.rainamount)settings.rainAmount=clamp(Number(properties.rainamount.value)||0,0,1);if(properties.snowamount)settings.snowAmount=clamp(Number(properties.snowamount.value)||0,0,1);if(properties.watertype&&PondAudio.WATERS.includes(properties.watertype.value))settings.waterType=properties.watertype.value;if(properties.music&&PondAudio.MUSIC.includes(properties.music.value))settings.music=properties.music.value;if(properties.noise&&PondAudio.NOISE_TYPES.includes(properties.noise.value))settings.noiseType=properties.noise.value;if(properties.volume)settings.volume=clamp(Number(properties.volume.value)||0,0,1);applyWeather();if(properties.sound&&!!properties.sound.value!==sound.active)toggleSound();},setPaused:setPausedState};
