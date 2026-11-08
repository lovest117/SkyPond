# 半亩方塘 v1.1.0

改名后的第一个完整版本：应用、安装包、仓库与文档统一为「半亩方塘 / SkyPond」。

## 下载

| 平台 | 文件 |
| --- | --- |
| Windows 10 / 11 | `SkyPond-1.1.0-Windows.zip` — 解压整个文件夹，运行 `SkyPond.exe` |
| Android 7.0+ | `SkyPond-1.1.0-Android.apk` — 覆盖安装即可，池塘与设置保留 |
| 浏览器 / Wallpaper Engine | `SkyPond-1.1.0-Web.zip` — 解压后打开 `index.html`，或导入含 `project.json` 的目录 |

校验和见同页 `SHA256SUMS.txt`。

## 本版变化

- **改名**：应用名「半亩方塘」、英文名 SkyPond；Windows 数据目录改为 `%LOCALAPPDATA%\SkyPond`，Android 包名 `com.skypond.koipond`，桌面壁纸选择项显示「半亩方塘」。
- **老存档不丢**：仍会读取 `bichi-pond-v1` 等旧存档键，升级后锦鲤、名字与食量排行都在。
- **构建链修复**：Windows 打包脚本此前引用不存在的 `BichiPond.csproj`、publish 脚本默认指向原作者仓库，均已修正；产物统一命名为 `SkyPond-*`，并生成 `SHA256SUMS.txt`。
- **版本号单一来源**：全部版本号集中在 `version.json`，构建脚本注入编译参数，`node scripts/version.mjs check` 校验漂移。
- **体积**：池塘底图与四季背景改为 WebP（质量 82），Windows 包由约 4.2MB 降到约 3.3MB，APK 由约 4.1MB 降到约 3.2MB；Wallpaper Engine 预览改用单独的小尺寸 JPEG。
- **移除 macOS 版**：原 macOS 原生壳无法在现有环境编译与维护，已整体删除，README 相应章节与截图一并清理。
- **持续集成**：新增 GitHub Actions，push/PR 跑测试与版本校验，打 tag 自动构建 Windows/Android 包并发布 Release。

## 说明

本作品基于开源项目「碧池观鱼」（moli-xia/fishwallpaper）二次创作，非原作者官方版本；上游未声明开源许可证，本仓库不另外授予许可。
