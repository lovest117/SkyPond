// 半亩方塘 · the Windows app: the pond as the desktop wallpaper on every screen, a tray icon to control it, and an
// interactive window. Every save one pond page makes is passed to the others, so they stay in step.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace SkyPond
{
    internal sealed class PondApp : ApplicationContext
    {
        private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run", RunName = "SkyPond";
        private readonly List<WallpaperForm> walls = new List<WallpaperForm>();
        private readonly NotifyIcon tray = new NotifyIcon();
        private ToolStripMenuItem soundItem;
        private readonly Timer watch = new Timer { Interval = 1000 };
        private readonly ShellWatcher shell;
        private CoreWebView2Environment env;
        private InteractiveForm window;
        private bool userPaused, locked, rebuilding, quitting, soundOn, opening;
        private string weather = "sunny";
        private bool night;
        // Taps on the desktop, seen through a low-level mouse hook (the desktop icons layer takes the real clicks).
        private IntPtr hook;
        private Native.LowLevelMouseProc hookProc;
        private Native.POINT downAt;
        private uint downTime;

        public PondApp()
        {
            shell = new ShellWatcher(() => Rebuild(1500));
            BuildTray();
            watch.Tick += (s, e) =>
            {
                if (AnyWallpaperLost()) { Rebuild(200); return; }
                UpdateVisibility();
            };
            SystemEvents.DisplaySettingsChanged += (s, e) => Rebuild(800);
            SystemEvents.SessionSwitch += (s, e) =>
            {
                if (e.Reason == SessionSwitchReason.SessionLock || e.Reason == SessionSwitchReason.ConsoleDisconnect || e.Reason == SessionSwitchReason.RemoteDisconnect) locked = true;
                if (e.Reason == SessionSwitchReason.SessionUnlock || e.Reason == SessionSwitchReason.ConsoleConnect || e.Reason == SessionSwitchReason.RemoteConnect) locked = false;
                UpdateVisibility();
            };
            // Start once the message loop runs, on the UI thread: every await below must come back to this thread,
            // where the windows are created (there is no WinForms synchronization context until a loop is running).
            var kickoff = new Timer { Interval = 1 };
            kickoff.Tick += async (s, e) =>
            {
                kickoff.Stop(); kickoff.Dispose();
                try { await Start(); }
                catch (Exception ex) { Report("启动失败", ex); Quit(); }
            };
            kickoff.Start();
        }

        private async Task Start()
        {
            // Always leave a readable record first: if this machine cannot put a window into the desktop, the log has
            // to say what the desktop looked like, even when the person cannot get the interactive window open.
            Diagnostics.Write("===== 启动 =====\r\n" + Diagnostics.EnvironmentReport());

            if (Native.IsElevated())
            {
                MessageBox.Show("半亩方塘要以普通权限运行。\r\n\r\n当前是管理员权限，Windows 不允许把壁纸窗口挂到资源管理器的桌面层，" +
                    "池塘会变成一个盖住桌面的空白窗口。\r\n\r\n请关掉后直接双击「0-点我启动.bat」；若右键菜单里勾了" +
                    "「以管理员身份运行」，取消它。", "半亩方塘", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                Diagnostics.Write("已拒绝启动：当前进程是管理员权限");
                ExitThread();
                return;
            }

            if (!File.Exists(Path.Combine(PondPage.WebFolder, "index.html")))
            {
                MessageBox.Show("文件夹里缺少 web 子目录，池塘的网页没有跟着一起解压。\r\n\r\n" +
                    "请把整个压缩包解压成一个文件夹，再运行里面的「0-点我启动.bat」；不要把 exe 单独拖出来。",
                    "半亩方塘", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                Diagnostics.Write("已拒绝启动：缺少 web\\index.html");
                try { Process.Start(new ProcessStartInfo("explorer.exe", "\"" + AppDomain.CurrentDomain.BaseDirectory + "\"") { UseShellExecute = true }); } catch (Exception) { }
                ExitThread();
                return;
            }

            string runtime = null;
            try { runtime = CoreWebView2Environment.GetAvailableBrowserVersionString(); } catch (WebView2RuntimeNotFoundException) { }
            if (string.IsNullOrEmpty(runtime))
            {
                Diagnostics.Write("WebView2 运行时不可用");
                if (MessageBox.Show("半亩方塘需要 Microsoft Edge WebView2 运行时（Windows 11 自带，Windows 10 多数已通过更新安装）。\n\n现在打开下载页面吗？", "半亩方塘", MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                    PondPage.OpenInBrowser("https://developer.microsoft.com/microsoft-edge/webview2/");
                ExitThread();
                return;
            }
            Diagnostics.Write("WebView2：" + runtime);
            string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SkyPond", "WebView2");
            // A wallpaper page is clicked through to the desktop's icon layer (see TapIfDesktop), so it never sees a real
            // user gesture; Chromium's autoplay policy would then keep its AudioContext suspended forever and the desktop
            // pond would stay silent however the sound setting is switched. The interactive window gets gestures itself,
            // which is why sound only ever worked there.
            var options = new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required");
            env = await CoreWebView2Environment.CreateAsync(null, data, options);
            await BuildWallpapers();
            hookProc = OnMouse;
            hook = Native.SetWindowsHookEx(Native.WH_MOUSE_LL, hookProc, Native.GetModuleHandle(null), 0);
            watch.Start();
        }

        private async Task BuildWallpapers()
        {
            // After an Explorer restart these windows are already gone with the old desktop; just let them go.
            foreach (var w in walls) { try { w.Close(); w.Dispose(); } catch (Exception) { } }
            walls.Clear();
            if (!Desktop.Find())
            {
                Diagnostics.Write("找不到桌面层，未创建壁纸窗口");
                tray.ShowBalloonTip(8000, "半亩方塘", "没找到资源管理器的桌面层，池塘没能铺上去。右键锦鲤图标 → 诊断日志…，把日志发回来。", ToolTipIcon.Warning);
                return;
            }
            Diagnostics.Write("桌面层：\r\n" + Desktop.Report);
            int failed = 0;
            foreach (var screen in Screen.AllScreens)
            {
                var wall = new WallpaperForm(screen);
                if (await wall.Start(env, OnSave, OnProcessFailed)) walls.Add(wall);
                else { failed++; try { wall.Dispose(); } catch (Exception) { } }
            }
            if (failed > 0)
            {
                Diagnostics.Write($"有 {failed} 块屏幕未能挂载（共 {Screen.AllScreens.Length} 块）");
                tray.ShowBalloonTip(8000, "半亩方塘", "有屏幕没能铺上池塘。右键锦鲤图标 → 诊断日志…，可以复制或上传日志。", ToolTipIcon.Warning);
            }
            UpdateVisibility();
        }

        // Screens changed, or Explorer restarted and took the desktop layers (and our wallpapers) with it.
        private async void Rebuild(int delay)
        {
            if (rebuilding || env == null) return;
            rebuilding = true;
            await Task.Delay(delay);
            try { await BuildWallpapers(); }
            catch (Exception ex) { Report("桌面壁纸重建失败", ex); }
            finally { rebuilding = false; }
        }

        // A WebView2 process went away. A renderer that crashed (GPU reset, out of memory) can be reloaded in place, but a
        // browser process that was terminated from outside cannot: something else killed it and there is nothing left to
        // reload. Installing or uninstalling any Edge-family product does exactly that — its installer replaces the WebView2
        // runtime and stops every msedgewebview2 process on the machine to release the DLL locks, so the pond would vanish
        // silently and never come back. Rebuilding every screen covers both kinds, and any number of lost views at once.
        private void OnProcessFailed(WebView2 view, CoreWebView2ProcessFailedKind kind)
        {
            Note($"WebView2 进程失败：{kind}");
            if (kind != CoreWebView2ProcessFailedKind.BrowserProcessExited) return;
            Rebuild(200);
        }

        // Nothing fails loudly once a WebView2 process is gone: the windows stay on screen showing an empty pond. The watch
        // timer already ticks every second, so a peek at the wallpapers costs nothing and covers the case where the host was
        // killed outright and ProcessFailed never arrived. OpenWindow is one-shot: while it is filling a view in, CoreWebView2
        // is still null, which would otherwise read as a lost pond and rebuild the desktop for nothing.
        private bool AnyWallpaperLost()
        {
            if (rebuilding || opening || walls.Count == 0) return false;
            foreach (var w in walls) if (w.View?.CoreWebView2 == null) return true;
            return window != null && !window.IsDisposed && window.View?.CoreWebView2 == null;
        }

        private IEnumerable<WebView2> Views => walls.Select(w => w.View).Concat(new[] { window?.View }).Where(v => v?.CoreWebView2 != null);

        // A page saved the pond: hand the same save to every other page, and note the weather for the menu.
        private void OnSave(WebView2 from, string json)
        {
            string call = "window.__pondSync&&__pondSync(" + PondPage.JsString(json) + ")";
            foreach (var v in Views) if (v != from) _ = v.CoreWebView2.ExecuteScriptAsync(call);
            var w = Regex.Match(json, "\"weather\":\"(\\w+)\"");
            if (w.Success) weather = w.Groups[1].Value;
            var n = Regex.Match(json, "\"night\":(true|false)");
            if (n.Success) night = n.Groups[1].Value == "true";
            var s = Regex.Match(json, "\"soundOn\":(true|false)");
            if (s.Success) soundOn = s.Groups[1].Value == "true";
        }

        // A menu command goes to one page (the interactive window if open); its save carries the change to the others.
        private void Command(string options)
        {
            var target = window?.View?.CoreWebView2 != null ? window.View : walls.Select(w => w.View).FirstOrDefault(v => v?.CoreWebView2 != null);
            if (target != null) _ = target.CoreWebView2.ExecuteScriptAsync($"window.pondControl&&pondControl.set({options})");
        }

        private static void SetPaused(WallpaperForm wall, bool paused)
        {
            if (wall.View?.CoreWebView2 == null || wall.Paused == paused) return;
            wall.Paused = paused;
            _ = wall.View.CoreWebView2.ExecuteScriptAsync(paused ? "window.pondControl&&pondControl.pause(true)" : "window.pondControl&&pondControl.pause(false)");
        }

        // Each screen's pond rests while nobody can see it: a maximised or full-screen app over it, or the session locked.
        private void UpdateVisibility()
        {
            IntPtr fg = Native.GetForegroundWindow();
            IntPtr covering = IntPtr.Zero;
            if (fg != IntPtr.Zero && Native.IsWindowVisible(fg) && !IsShell(fg) && Native.GetWindowRect(fg, out var r))
            {
                var mi = new Native.MONITORINFO { cbSize = System.Runtime.InteropServices.Marshal.SizeOf(typeof(Native.MONITORINFO)) };
                Native.GetMonitorInfo(Native.MonitorFromWindow(fg, Native.MONITOR_DEFAULTTONEAREST), ref mi);
                bool full = r.Left <= mi.rcMonitor.Left && r.Top <= mi.rcMonitor.Top && r.Right >= mi.rcMonitor.Right && r.Bottom >= mi.rcMonitor.Bottom;
                if (full || Native.IsZoomed(fg)) covering = fg;
            }
            foreach (var w in walls)
            {
                bool coveredHere = covering != IntPtr.Zero && Screen.FromHandle(covering).DeviceName == w.Screen.DeviceName;
                w.SetHidden(locked || coveredHere);
                SetPaused(w, userPaused);
            }
        }

        private static bool IsShell(IntPtr hwnd)
        {
            string c = Native.ClassOf(hwnd);
            return c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd" || c == "SysListView32";
        }

        // A click on the desktop itself (not on an app window) that did not move: the koi come for food there.
        // The desktop's icon layer gets the real click; the hook only watches and never swallows anything.
        private IntPtr OnMouse(int code, IntPtr wParam, IntPtr lParam)
        {
            if (code >= 0)
            {
                var m = (Native.MSLLHOOKSTRUCT)System.Runtime.InteropServices.Marshal.PtrToStructure(lParam, typeof(Native.MSLLHOOKSTRUCT));
                int msg = wParam.ToInt32();
                if (msg == Native.WM_LBUTTONDOWN) { downAt = m.pt; downTime = m.time; }
                else if (msg == Native.WM_LBUTTONUP && m.time - downTime < 350 && Math.Abs(m.pt.X - downAt.X) < 6 && Math.Abs(m.pt.Y - downAt.Y) < 6)
                {
                    var pt = m.pt;
                    MainThread(() => TapIfDesktop(pt));
                }
            }
            return Native.CallNextHookEx(hook, code, wParam, lParam);
        }

        private void TapIfDesktop(Native.POINT pt)
        {
            IntPtr under = Native.WindowFromPoint(pt);
            string c = Native.ClassOf(under);
            bool desktop = c == "SysListView32" && Native.ClassOf(Native.GetParent(under)) == "SHELLDLL_DefView" || c == "SHELLDLL_DefView" || c == "WorkerW" || c == "Progman";
            if (!desktop) return;
            var p = new Point(pt.X, pt.Y);
            walls.FirstOrDefault(w => w.Screen.Bounds.Contains(p))?.Tap(p);
        }

        private void MainThread(Action a)
        {
            if (walls.Count > 0 && walls[0].IsHandleCreated) walls[0].BeginInvoke(a);
        }

        // Something went wrong: keep the details in %LOCALAPPDATA%\SkyPond\error.log and say where they are.
        private static void Report(string what, Exception ex)
        {
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SkyPond"), log = Path.Combine(dir, "error.log");
            try { Directory.CreateDirectory(dir); File.AppendAllText(log, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {what} (Windows {Environment.OSVersion.Version})\r\n{ex}\r\n\r\n"); } catch (Exception) { }
            MessageBox.Show($"{what}：{ex.Message}\n\n详细信息已记录在：\n{log}", "半亩方塘", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        /// <summary>Records something worth knowing without interrupting anyone: a lost WebView2 process is recovered on its
        /// own, so a dialog for it would be noise, but it still belongs in the log — a pond that silently stopped drawing once
        /// would otherwise leave nothing behind to diagnose.</summary>
        private static void Note(string what)
        {
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SkyPond"), log = Path.Combine(dir, "error.log");
            try { Directory.CreateDirectory(dir); File.AppendAllText(log, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {what} (Windows {Environment.OSVersion.Version})\r\n\r\n"); } catch (Exception) { }
        }

        // ---------- tray ----------
        private void BuildTray()
        {
            tray.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            tray.Text = "半亩方塘";
            var menu = new ContextMenuStrip();
            menu.Items.Add(new ToolStripMenuItem("半亩方塘") { Enabled = false });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("打开交互窗口", null, (s, e) => OpenWindow());
            var weatherMenu = new ToolStripMenuItem("天气");
            foreach (var (name, value) in new[] { ("晴日", "sunny"), ("多云", "cloudy"), ("下雨", "rain"), ("落雪", "snow") })
                weatherMenu.DropDownItems.Add(new ToolStripMenuItem(name, null, (s, e) => { weather = value; Command($"{{weather:'{value}'}}"); }) { Tag = value });
            weatherMenu.DropDownItems.Add(new ToolStripSeparator());
            var nightItem = new ToolStripMenuItem("月下观鱼", null, (s, e) => { night = !night; Command(night ? "{night:true}" : "{night:false}"); });
            weatherMenu.DropDownItems.Add(nightItem);
            menu.Items.Add(weatherMenu);
            var pause = new ToolStripMenuItem("暂停壁纸动画", null, (s, e) => { userPaused = !userPaused; UpdateVisibility(); });
            menu.Items.Add(pause);
            // The wallpaper pages have no controls of their own, so sound is switched from here (or the window's bottom bar).
            soundItem = new ToolStripMenuItem("声音", null, (s, e) => { soundOn = !soundOn; Command(soundOn ? "{soundOn:true}" : "{soundOn:false}"); });
            menu.Items.Add(soundItem);
            menu.Items.Add("重载桌面壁纸", null, (s, e) => Rebuild(0));
            menu.Items.Add("诊断日志…", null, (s, e) => new DiagnosticsForm().ShowDialog());
            var startup = new ToolStripMenuItem("开机时启动", null, (s, e) => SetStartup(!IsStartup()));
            menu.Items.Add(startup);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("退出半亩方塘", null, (s, e) => Quit());
            menu.Opening += (s, e) =>
            {
                foreach (ToolStripItem i in weatherMenu.DropDownItems) if (i is ToolStripMenuItem mi && mi.Tag is string v) mi.Checked = v == weather;
                nightItem.Checked = night; pause.Checked = userPaused; startup.Checked = IsStartup(); soundItem.Checked = soundOn;
            };
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += (s, e) => OpenWindow();
            tray.Visible = true;
        }

        public async void OpenWindow()
        {
            if (env == null) return;
            if (window != null && !window.IsDisposed) { window.WindowState = window.WindowState == FormWindowState.Minimized ? FormWindowState.Normal : window.WindowState; window.Activate(); return; }
            window = new InteractiveForm();
            window.FormClosed += (s, e) => { window = null; };
            opening = true;
            try { await window.Start(env, OnSave, OnProcessFailed); }
            finally { opening = false; }
        }

        private static bool IsStartup()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(RunKey)) return key?.GetValue(RunName) != null;
        }

        private static void SetStartup(bool on)
        {
            using (var key = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (on) key.SetValue(RunName, $"\"{Application.ExecutablePath}\"");
                else key.DeleteValue(RunName, false);
            }
        }

        private void Quit()
        {
            if (quitting) return;
            quitting = true;
            watch.Stop();
            if (hook != IntPtr.Zero) Native.UnhookWindowsHookEx(hook);
            tray.Visible = false;
            window?.Close();
            foreach (var w in walls) { try { w.Close(); } catch (Exception) { } }
            Desktop.Refresh();
            shell.DestroyHandle();
            ExitThread();
        }
    }

    /// <summary>A hidden window that hears Explorer restarting (TaskbarCreated), after which the desktop layers are new.</summary>
    internal sealed class ShellWatcher : NativeWindow
    {
        private readonly uint taskbarCreated = Native.RegisterWindowMessage("TaskbarCreated");
        private readonly Action onRestart;
        public ShellWatcher(Action onRestart) { this.onRestart = onRestart; CreateHandle(new CreateParams()); }
        protected override void WndProc(ref Message m)
        {
            if (taskbarCreated != 0 && (uint)m.Msg == taskbarCreated) onRestart();
            base.WndProc(ref m);
        }
    }
}
