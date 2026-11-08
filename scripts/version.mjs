#!/usr/bin/env node
// 版本号的唯一来源是仓库根目录的 version.json。
// 构建脚本从这里读（node scripts/version.mjs android.versionCode 等），
// `node scripts/version.mjs check` 校验各处副本没有漂移，CI 会跑这一条。
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFile(join(root, p), 'utf8');
const version = JSON.parse(await read('version.json'));

const pick = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), version);

if (process.argv[2] === 'check') {
  const failures = [];
  const expect = (label, actual, wanted) => {
    if (actual !== wanted) failures.push(`${label}: 期望 ${wanted}，实际 ${actual}`);
  };

  const pkg = JSON.parse(await read('package.json'));
  expect('package.json version', pkg.version, version.version);

  const csproj = await read('native/windows/SkyPond.csproj');
  const csprojVersion = (csproj.match(/<Version>([^<]+)<\/Version>/) || [])[1];
  expect('csproj <Version>', csprojVersion, version.version);

  const manifest = await read('native/windows/app.manifest');
  const manifestVersion = (manifest.match(/<assemblyIdentity version="([^"]+)"/) || [])[1];
  expect('app.manifest assemblyIdentity', manifestVersion, version.windows.manifestVersion);

  if (failures.length) {
    console.error('✗ 版本号不一致，以 version.json 为准：');
    for (const f of failures) console.error('  · ' + f);
    process.exit(1);
  }
  console.log(`✓ 版本号一致：${version.version}（Android ${version.android.versionName}/${version.android.versionCode}，Windows ${version.windows.fileVersion}）`);
  process.exit(0);
}

const key = process.argv[2] || 'version';
const value = pick(key);
if (value === undefined) {
  console.error(`✗ version.json 没有字段 ${key}`);
  process.exit(1);
}
console.log(value);
