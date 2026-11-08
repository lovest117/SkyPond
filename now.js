// 此刻此地：把「现在」换算成池塘的四时——季节按四立节气、昼夜按当地日出日落、月相按天文月龄。
// 纯函数，不碰 DOM，不联网；时间一律以「城市当地时刻」表达（调用方先把 UTC 平移到该城市的偏移）。
(function (root) {
  'use strict';

  // 四立节气近似日：立春 2/4、立夏 5/5、立秋 8/7、立冬 11/7。
  const SEASON_STARTS = [[2, 4, 'spring'], [5, 5, 'summer'], [8, 7, 'autumn'], [11, 7, 'winter']];
  const SEASON_NAMES = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
  const SYNODIC_DAYS = 29.530588853;
  const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14);
  const NOON_DAY_SUNRISE = 360, NOON_DAY_SUNSET = 1080;

  function pad(n) { return String(n).padStart(2, '0'); }

  // local：一个 UTC 字段已被平移到城市当地的 Date。
  function seasonOf(local) {
    const month = local.getUTCMonth() + 1, day = local.getUTCDate();
    let season = 'winter';
    for (const [m, d, id] of SEASON_STARTS) if (month > m || (month === m && day >= d)) season = id;
    return season;
  }

  function minutesOf(local) { return local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60; }

  function clockOf(local) { return `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`; }

  function dateOf(local) { return `${local.getUTCMonth() + 1}月${local.getUTCDate()}日`; }

  // Open-Meteo 的 daily.sunrise/sunset：["2026-11-08T07:12"]（城市当地时间）。
  function clockMinutes(text) {
    const m = /T(\d{2}):(\d{2})/.exec(String(text || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  function sunMinutes(daily) {
    if (!daily) return null;
    const pick = v => (Array.isArray(v) ? v[0] : v);
    const sunrise = clockMinutes(pick(daily.sunrise)), sunset = clockMinutes(pick(daily.sunset));
    return Number.isFinite(sunrise) && Number.isFinite(sunset) ? { sunrise, sunset } : null;
  }

  // 昼：晨曦 = 日出后 90 分钟；晌午 = 直到正午后 60 分钟；斜阳 = 直到日落前 60 分钟；暮色 = 到日落 +20 分钟。
  // 夜间 = 日落 +20 分钟 之后到次日日出前 20 分钟。缺日出日落（极昼极夜、离线）时退回 6:00 / 18:00。
  function phaseOf(minutes, sunrise, sunset) {
    let rise = Number.isFinite(sunrise) ? sunrise : NOON_DAY_SUNRISE;
    let set = Number.isFinite(sunset) ? sunset : NOON_DAY_SUNSET;
    if (!(set > rise)) { rise = NOON_DAY_SUNRISE; set = NOON_DAY_SUNSET; }
    if (minutes < rise - 20 || minutes >= set + 20) return { night: true, phase: null };
    const dawnEnd = Math.min(rise + 90, set - 40);
    const noonEnd = Math.max(dawnEnd + 1, Math.min((rise + set) / 2 + 60, set - 30));
    const duskStart = Math.max(noonEnd + 1, set - 60);
    if (minutes < dawnEnd) return { night: false, phase: 'dawn' };
    if (minutes < noonEnd) return { night: false, phase: 'noon' };
    if (minutes < duskStart) return { night: false, phase: 'slant' };
    return { night: false, phase: 'dusk' };
  }

  // 天文月龄四档：只会给 新月 / 弦月（上下弦合并）/ 满月，「星夜」属于手动彩蛋，自动档不产出。
  function moonPhaseOf(ms) {
    const days = (Number.isFinite(ms) ? ms : Date.now()) - NEW_MOON_REF;
    const age = ((days / 86400000) % SYNODIC_DAYS + SYNODIC_DAYS) % SYNODIC_DAYS;
    if (age < 3.7 || age > 25.8) return 'new';
    if (age < 11.1 || age > 18.4) return 'quarter';
    return 'full';
  }

  root.PondNow = { seasonOf, minutesOf, clockOf, dateOf, sunMinutes, phaseOf, moonPhaseOf, SEASON_NAMES, SEASON_STARTS, SYNODIC_DAYS };
})(typeof window !== 'undefined' ? window : globalThis);
