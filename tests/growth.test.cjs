const test=require('node:test');
const assert=require('node:assert/strict');
const {PondSimulation,createFish,createFry,randomSeed,sanitizeSave,frySize,growthStage,growOnFeed,queueDrain,POND_CAP,QUEUE_CAP,GROW_DAYS,FRY_SCALE}=require('../core.js');

test('新放入的鱼是苗期，体长为成年体长的起点比例',()=>{
  const f=createFry(0,()=>.5,1);
  assert.equal(f.fry,true);
  assert.deepEqual(f.fedDates,[]);
  assert.equal(f.adultSize,1);
  assert.ok(Math.abs(f.size-FRY_SCALE)<1e-9);
  assert.deepEqual(growthStage(f),{adult:false,days:0,progress:0});
});

test('同一天喂多次只算一天，不加速成长',()=>{
  const f=createFry(0,()=>.5,.9);
  assert.equal(growOnFeed(f,'2026-11-01'),true);
  assert.equal(f.size,frySize(.9,1));
  assert.equal(growOnFeed(f,'2026-11-01'),false);
  assert.equal(growOnFeed(f,'2026-11-01'),false);
  assert.equal(f.fedDates.length,1);
  assert.equal(f.size,frySize(.9,1));
  assert.equal(growthStage(f).days,1);
});

test('喂满七天后成年，体长回到选定的成年大小，再喂不再变化',()=>{
  const f=createFry(0,()=>.5,1.2);
  const days=['2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07'];
  for(const d of days.slice(0,GROW_DAYS-1))growOnFeed(f,d);
  assert.equal(f.fry,true);
  assert.ok(f.size<1.2);
  growOnFeed(f,days[GROW_DAYS-1]);
  assert.equal(f.fry,false);
  assert.equal(f.size,1.2);
  assert.equal(growthStage(f).adult,true);
  assert.equal(growOnFeed(f,'2026-11-08'),false,'成年后不再成长');
  assert.equal(f.size,1.2);
});

test('模拟里吃到鱼食才会记天数：七天各喂一次后自动成年',()=>{
  const base=new Date(2026,10,1,12).getTime(),day=24*3600*1000;
  let clock=base;
  const random=randomSeed(3),f=createFry(0,random,.9);f.x=.5;f.y=.5;f.angle=0;
  const pond=new PondSimulation([f],1000,700,random,[],true,()=>clock);
  for(let d=0;d<GROW_DAYS;d++){
    clock=base+d*day;
    pond.feed(f.x*1000,f.y*700,3);
    for(let i=0;i<60*24&&pond.food.length;i++)pond.step(1/60);
    assert.equal(pond.food.length,0,`第 ${d+1} 天的鱼食没吃完`);
    assert.equal(f.fedDates.length,d+1,`第 ${d+1} 天应记一天`);
  }
  assert.equal(f.fry,false);
  assert.equal(f.size,.9);
});

test('同一天内反复投喂，模拟里也只记一天',()=>{
  let clock=new Date(2026,10,1,9).getTime();
  const random=randomSeed(6),f=createFry(0,random,.9);f.x=.5;f.y=.5;f.angle=0;
  const pond=new PondSimulation([f],1000,700,random,[],true,()=>clock);
  for(let k=0;k<3;k++){
    clock+=3600*1000;
    pond.feed(f.x*1000,f.y*700,3);
    for(let i=0;i<60*24&&pond.food.length;i++)pond.step(1/60);
  }
  assert.equal(f.fedDates.length,1);
  assert.equal(f.fry,true);
  assert.equal(f.size,frySize(.9,1));
});

test('苗期状态与天数能随存档往返，老存档的鱼仍是成年且尺寸不变',()=>{
  const f=createFry(0,()=>.5,1);
  for(const d of ['2026-11-01','2026-11-02','2026-11-03'])growOnFeed(f,d);
  const saved=sanitizeSave({fish:[{name:'小苗',palette:0,adultSize:1,fry:true,fedDates:[...f.fedDates],size:f.size,seed:1}]});
  const back=saved.fish[0];
  assert.equal(back.fry,true);
  assert.equal(back.adultSize,1);
  assert.equal(back.fedDates.length,3);
  assert.ok(Math.abs(back.size-frySize(1,3))<1e-9);
  assert.deepEqual(growthStage(back),{adult:false,days:3,progress:3/GROW_DAYS});

  const legacy=sanitizeSave({fish:[{name:'老鱼',size:.72,seed:9}]}).fish[0];
  assert.equal(legacy.fry,false);
  assert.equal(legacy.size,.72);
  assert.equal(legacy.adultSize,.72);
  assert.deepEqual(legacy.fedDates,[]);
});

test('存档丢弃非法喂食日期，苗期天数不超过七天',()=>{
  const data=sanitizeSave({fish:[{name:'小苗',adultSize:1,fry:true,fedDates:['2026-11-01','bad','2026-13-99','2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08']}]});
  const f=data.fish[0];
  assert.ok(f.fedDates.every(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)));
  assert.ok(f.fedDates.length<=GROW_DAYS);
  assert.equal(new Set(f.fedDates).size,f.fedDates.length);
});

test('岸边排队：按空位放走队首，剩下的继续等',()=>{
  const queue=[{name:'甲'},{name:'乙'},{name:'丙'}];
  assert.deepEqual(queueDrain(queue,0),{entered:[],rest:queue});
  assert.deepEqual(queueDrain(queue,1).entered.map(q=>q.name),['甲']);
  assert.deepEqual(queueDrain(queue,1).rest.map(q=>q.name),['乙','丙']);
  assert.deepEqual(queueDrain(queue,5).entered.map(q=>q.name),['甲','乙','丙']);
  assert.deepEqual(queueDrain([],5),{entered:[],rest:[]});
  assert.deepEqual(queueDrain(null,2),{entered:[],rest:[]});
});

test('存档清洗保留岸边队列，并限制数量与非法数据',()=>{
  const data=sanitizeSave({fish:[{name:'一'}],queue:[{name:'排队甲',palette:2,adultSize:1.1,marks:[{x:1,y:1,r:3,color:'#bc5036'}]},{name:''},{nope:1}]});
  assert.equal(data.queue.length,2,'空名字的条目保留为默认名，nope 那条被丢弃');
  assert.equal(data.queue[0].name,'排队甲');
  assert.equal(data.queue[0].palette,2);
  assert.equal(data.queue[0].adultSize,1.1);
  assert.deepEqual(data.queue[0].marks,[{x:1,y:1,r:3,color:'#bc5036'}]);
  assert.ok(data.queue.length<=QUEUE_CAP);
});

test('容量常量与既有上限一致',()=>{
  assert.equal(POND_CAP,60);
  assert.equal(QUEUE_CAP,20);
});

test('默认开场的锦鲤仍是成年鱼，不受成长机制影响',()=>{
  const fish=Array.from({length:24},(_,i)=>createFish(i,randomSeed(i*7+3)));
  for(const f of fish){
    assert.equal(f.fry,undefined);
    assert.deepEqual(growthStage(f),{adult:true,days:GROW_DAYS,progress:1});
  }
});
