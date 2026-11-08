const test=require('node:test');
const assert=require('node:assert/strict');
const {PondSimulation,createFish,randomSeed,NIGHT_SLOW}=require('../core.js');

function pond(seed=11){
  let s=seed;const rnd=()=>((s=(s*1664525+1013904223)>>>0)/4294967296);
  const sim=new PondSimulation([createFish(0,rnd),createFish(1,rnd),createFish(2,rnd)],1200,800,rnd,[],false);
  return sim;
}
const travelled=(sim)=>{
  const before=sim.fish.map(f=>[f.x,f.y]);
  return () => sim.fish.reduce((sum,f,i)=>sum+Math.hypot(f.x-before[i][0],f.y-before[i][1]),0);
};
const run=(sim,steps,calm)=>{for(let i=0;i<steps;i++)sim.step(1/30,1,calm);};

test('月下（calm=1）鱼游得更慢：同样时长走过的路程明显更短',()=>{
  const day=pond(),night=pond();
  const d0=travelled(day),n0=travelled(night);
  run(day,900,0);run(night,900,1);
  const dDay=d0(),dNight=n0();
  assert.ok(dDay>0&&dNight>0,'两边的鱼都动了');
  assert.ok(dNight<dDay*.85,`夜里走得更短：白天 ${dDay.toFixed(3)} vs 夜里 ${dNight.toFixed(3)}`);
  assert.ok(NIGHT_SLOW>.3&&NIGHT_SLOW<.6,`减速比例 ${NIGHT_SLOW}`);
});

test('月下更常歇着：静止状态的时间占比更高',()=>{
  const day=pond(),night=pond();
  const restRatio=(sim,calm)=>{
    let resting=0,total=0;
    for(let i=0;i<1200;i++){sim.step(1/30,1,calm);for(const f of sim.fish){total++;if(f.rest>0)resting++;}}
    return resting/total;
  };
  const dayRest=restRatio(day,0),nightRest=restRatio(night,1);
  assert.ok(nightRest>dayRest*1.3,`夜里休息时间更多：白天 ${(dayRest*100).toFixed(1)}% vs 夜里 ${(nightRest*100).toFixed(1)}%`);
});

test('不传 calm 时行为与原来完全一致（老调用方不受影响）',()=>{
  const a=pond(21),b=pond(21);
  for(let i=0;i<400;i++)a.step(1/30,.8);
  for(let i=0;i<400;i++)b.step(1/30,.8,0);
  assert.deepEqual(a.fish.map(f=>[f.x,f.y,f.angle]),b.fish.map(f=>[f.x,f.y,f.angle]));
});
