const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../now.js'), 'utf8'), context);
const { seasonOf, minutesOf, clockOf, dateOf, sunMinutes, phaseOf, moonPhaseOf, SEASON_NAMES } = context.window.PondNow;

// 城市当地时刻：UTC 字段已被平移过。
const local = (m, d, h = 12, min = 0) => new Date(Date.UTC(2026, m - 1, d, h, min));

test('四季按四立节气切换：立春 2/4、立夏 5/5、立秋 8/7、立冬 11/7', () => {
  assert.equal(seasonOf(local(2, 3)), 'winter', '2/3 仍是冬');
  assert.equal(seasonOf(local(2, 4)), 'spring', '2/4 立春');
  assert.equal(seasonOf(local(5, 4)), 'spring');
  assert.equal(seasonOf(local(5, 5)), 'summer', '5/5 立夏');
  assert.equal(seasonOf(local(8, 6)), 'summer');
  assert.equal(seasonOf(local(8, 7)), 'autumn', '8/7 立秋');
  assert.equal(seasonOf(local(11, 6)), 'autumn');
  assert.equal(seasonOf(local(11, 7)), 'winter', '11/7 立冬');
  assert.equal(JSON.stringify(SEASON_NAMES), JSON.stringify({ spring: '春', summer: '夏', autumn: '秋', winter: '冬' }));
});

test('日出日落解析：Open-Meteo 的 daily 数组与单值都能读', () => {
  assert.equal(JSON.stringify(sunMinutes({ sunrise: ['2026-11-08T07:12'], sunset: ['2026-11-08T17:38'] })), JSON.stringify({ sunrise: 432, sunset: 1058 }));
  assert.equal(JSON.stringify(sunMinutes({ sunrise: '2026-06-21T05:00', sunset: '2026-06-21T19:00' })), JSON.stringify({ sunrise: 300, sunset: 1140 }));
  assert.equal(sunMinutes(null), null);
  assert.equal(sunMinutes({ sunrise: [null], sunset: [null] }), null);
});

test('昼四时段：晨→晌→斜→暮，夜间在日落 20 分钟后开始', () => {
  const rise = 420, set = 1080; // 7:00 日出，18:00 日落
  assert.equal(phaseOf(390, rise, set).night, true, '日出前 30 分钟还算夜');
  assert.equal(phaseOf(430, rise, set).phase, 'dawn');
  assert.equal(phaseOf(505, rise, set).phase, 'dawn', '日出后 85 分钟仍是晨曦');
  assert.equal(phaseOf(515, rise, set).phase, 'noon', '越过 90 分钟进晌午');
  assert.equal(phaseOf(800, rise, set).phase, 'noon', '正午后 60 分钟内仍算晌午');
  assert.equal(phaseOf(830, rise, set).phase, 'slant');
  assert.equal(phaseOf(1015, rise, set).phase, 'slant');
  assert.equal(phaseOf(1030, rise, set).phase, 'dusk');
  assert.equal(phaseOf(1090, rise, set).night, false, '日落 10 分钟后仍算暮色');
  assert.equal(phaseOf(1110, rise, set).night, true, '日落 30 分钟后入夜');
  assert.equal(phaseOf(100, rise, set).night, true, '凌晨是夜');
});

test('缺日出日落（极昼极夜、离线）退回 6:00 / 18:00，不抛错', () => {
  assert.equal(JSON.stringify(phaseOf(720, null, null)), JSON.stringify({ night: false, phase: 'noon' }));
  assert.equal(phaseOf(400, null, null).phase, 'dawn');
  assert.equal(phaseOf(120, null, null).night, true);
  assert.equal(phaseOf(720, 900, 300).phase, 'noon', '数据颠倒时也用兜底日');
});

test('月相四档：只会给新月 / 弦月 / 满月，永不产出「星夜」', () => {
  const ref = Date.UTC(2000, 0, 6, 18, 14);
  const day = 86400000;
  assert.equal(moonPhaseOf(ref), 'new');
  assert.equal(moonPhaseOf(ref + 7.4 * day), 'quarter');
  assert.equal(moonPhaseOf(ref + 14.8 * day), 'full');
  assert.equal(moonPhaseOf(ref + 22.1 * day), 'quarter');
  assert.equal(moonPhaseOf(ref + 29.53 * day), 'new', '一个朔望月后回到新月');
  for (const t of [0, 1, 2, 3, 4, 5, 6, 7].map(k => ref + k * 3.7 * day)) assert.ok(['new', 'quarter', 'full'].includes(moonPhaseOf(t)), '不会产出星夜');
});

test('当地时刻与日期文案', () => {
  const d = local(11, 8, 21, 14);
  assert.equal(clockOf(d), '21:14');
  assert.equal(dateOf(d), '11月8日');
  assert.equal(minutesOf(new Date(Date.UTC(2026, 10, 8, 0, 30, 30))), 30.5);
});
