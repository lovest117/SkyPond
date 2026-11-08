const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const core = require('../core.js');
const context = { window: { PondCore: core }, ImageData: class { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } } };
vm.runInNewContext(fs.readFileSync(require.resolve('../art.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(require.resolve('../scene.js'), 'utf8'), context);
const { PondScene, lookFor, moonAngle, MOON_PRESETS, MOON_LABELS, DAY_PHASES } = context.window.PondScene;

// A stand-in renderer: the painting maps 1:1 onto a 1672×941 screen.
function pond(seed = 7) {
  let s = seed; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const R = { drops: [], imageToScreen: (x, y) => [x, y], drop(...a) { this.drops.push(a); } };
  const sim = new core.PondSimulation([core.createFish(0, rnd)], 1672, 941, rnd, [], false);
  const scene = new PondScene(R, sim, rnd); scene.layout(1672, 941);
  return scene;
}
const base = { turtles: false, butterflies: false, night: false, rainAmount: .9, snowAmount: .5 };

test('每种天气与夜色的画面参数键一致，天气切换可平滑过渡', () => {
  const keys = Object.keys(lookFor('sunny', false)).sort();
  for (const w of ['sunny', 'cloudy', 'rain', 'snow']) for (const night of [false, true]) assert.deepEqual(Object.keys(lookFor(w, night)).sort(), keys);
});

test('云量：晴天偶有云影，多云约半池云影，雨天满天阴云', () => {
  const cover = w => lookFor(w, false).cloudCover;
  assert.ok(cover('sunny') < .3 && cover('cloudy') > .4 && cover('cloudy') < .7 && cover('rain') === 1);
  assert.ok(lookFor('cloudy', false).caustic > lookFor('rain', false).caustic * 3, '多云时云隙阳光仍有焦散');
});

test('雨点打在荷叶、花苞上会溅起水花并让它们颤动，雨停后回稳', () => {
  const scene = pond();
  for (let i = 0; i < 90; i++) scene.update(1 / 30, { ...base, weather: 'rain' });
  assert.ok(scene.splashes.some(p => p.leaf), '荷叶上有雨滴水花');
  assert.ok(scene.floaters.some(f => f.ja !== 0 || f.ox !== 0), '有荷叶或花苞被雨点碰动');
  for (let i = 0; i < 600; i++) scene.update(1 / 30, { ...base, weather: 'sunny' });
  assert.ok(scene.floaters.every(f => Math.abs(f.ja) < .01 && Math.abs(f.ox) < .05 && Math.abs(f.oy) < .05));
  assert.equal(scene.splashes.length, 0);
});

test('月相三档：新月细弧、弦月半轮、满月全轮，未知值回落到真实月龄', () => {
  const illum = a => (1 - Math.cos(a)) / 2;
  assert.deepEqual(Object.keys(MOON_PRESETS).sort(), ['full', 'new', 'quarter']);
  assert.equal(JSON.stringify(MOON_LABELS), JSON.stringify({ new: '新月', quarter: '弦月', full: '满月', none: '星夜' }));
  assert.ok(Math.abs(illum(MOON_PRESETS.quarter) - .5) < 1e-4, '弦月亮面一半');
  assert.equal(MOON_PRESETS.full, Math.PI);
  const newMoon = illum(MOON_PRESETS.new);
  assert.ok(newMoon > .1 && newMoon < .2, `新月约一成多亮面（${newMoon.toFixed(3)}）`);
  assert.ok(MOON_PRESETS.new < MOON_PRESETS.quarter, '新月比弦月细');
  assert.ok(moonAngle('off-topic') >= 0 && moonAngle('off-topic') < Math.PI * 2, '未知月相按真实月龄');
});

test('场景把选定的月相写进池中倒影，切换后即时生效', () => {
  const scene = pond();
  for (const p of ['new', 'quarter', 'full']) {
    scene.update(1 / 30, { ...base, night: true, moonPhase: p });
    assert.equal(scene.moonDisc[3], MOON_PRESETS[p], `${MOON_LABELS[p]}的角度进了倒影参数`);
  }
  scene.update(1 / 30, { ...base, night: false });
  assert.ok(scene.moonDisc[3] >= 0 && scene.moonDisc[3] < Math.PI * 2, '没有设置时按当日真实月龄');
});

test('星夜：没有月亮，倒影不画月盘，星光仍在', () => {
  const scene = pond();
  scene.update(1 / 30, { ...base, night: true, moonPhase: 'none' });
  assert.equal(scene.moonOn, false, '星夜不画月盘');
  scene.setLook('sunny', true, undefined, { ...base, night: true, moonPhase: 'none' });
  assert.equal(scene.look.moonOn, false, '渲染参数里也关掉月盘');
  assert.ok(scene.look.moon > 0, '仍走夜色，星星照旧');
  scene.update(1 / 30, { ...base, night: true, moonPhase: 'full' });
  scene.setLook('sunny', true, undefined, { ...base, night: true, moonPhase: 'full' });
  assert.equal(scene.look.moonOn, true, '满月时月盘回来');
});

test('白昼四时段：晨昏更暗更暖，正午最亮，四档参数键一致', () => {
  const phases = ['dawn', 'noon', 'slant', 'dusk'];
  const keys = Object.keys(DAY_PHASES).sort();
  assert.deepEqual(keys, ['dawn', 'dusk', 'noon', 'slant']);
  const noonKeys = Object.keys(lookFor('sunny', false, .5, .5, 'noon')).sort();
  for (const p of phases) assert.deepEqual(Object.keys(lookFor('sunny', false, .5, .5, p)).sort(), noonKeys, `${p} 参数键与正午一致`);
  const noon = lookFor('sunny', false, .5, .5, 'noon');
  const dawn = lookFor('sunny', false, .5, .5, 'dawn');
  const dusk = lookFor('sunny', false, .5, .5, 'dusk');
  assert.ok(dawn.bright < noon.bright && dusk.bright < noon.bright, '晨、暮比正午暗');
  assert.ok(dawn.tint[2] > dawn.tint[0], '晨曦偏冷（蓝分量最高）');
  assert.ok(dusk.tint[0] > dusk.tint[2], '暮色偏暖（红分量最高）');
  assert.ok(dusk.shadow < noon.shadow, '暮色影子更软');
  assert.ok(dawn.caustic < noon.caustic, '晨曦焦散更弱');
  assert.ok(dawn.sun[1] < noon.sun[1] && dusk.sun[1] < noon.sun[1], '晨昏太阳更低');
});

test('夜色之下不再叠加白昼时段的光', () => {
  const a = lookFor('sunny', true, .5, .5, 'dawn');
  const b = lookFor('sunny', true, .5, .5, 'noon');
  assert.deepEqual(a, b, '夜里四时段不影响月色');
});

test('大雨偶有闪电，闪光后发出雷声事件；小雨与晴天没有', () => {
  const scene = pond(3); let flashes = 0;
  for (let i = 0; i < 30 * 200; i++) { scene.update(1 / 30, { ...base, weather: 'rain' }); if (scene.look.flash > .05) flashes++; }
  const thunder = scene.events.filter(e => e.type === 'thunder');
  assert.ok(thunder.length >= 2 && thunder.length <= 12, `200 秒内雷声 ${thunder.length} 次`);
  assert.ok(flashes > 0 && thunder.every(e => e.delay >= 1 && e.delay <= 3.5));
  const calm = pond(4); calm.events.length = 0;
  for (let i = 0; i < 30 * 120; i++) calm.update(1 / 30, { ...base, weather: 'rain', rainAmount: .3 });
  assert.equal(calm.events.length, 0);
});
