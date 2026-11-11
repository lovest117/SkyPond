// 半亩方塘 · putting a window into the desktop, behind the icons.
// Explorer's desktop is Progman (the static wallpaper) with SHELLDLL_DefView (the icons) on top. Sending Progman the
// undocumented 0x052C message makes it split off a WorkerW layer between the two, the layer animated wallpapers use:
//   • up to Windows 11 23H2 the WorkerW is a top-level window just after the one holding SHELLDLL_DefView;
//   • from Windows 11 24H2, SHELLDLL_DefView and the WorkerW are both children of Progman, so the wallpaper becomes a
//     child of Progman itself, placed right under the icons.
// A machine can host dozens of unrelated WorkerW windows (tooltips and other desktop tools); only a visible one that
// spans the whole virtual screen, below the icon layer, is the wallpaper layer. Picking a small hidden one silently
// swallows the pond — or, if the parent is rejected, leaves a bare full-screen window on top of the desktop.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Windows.Forms;

namespace SkyPond
{
    internal static class Desktop
    {
        /// <summary>The window the wallpaper is parented to; Progman when <see cref="Layered24H2"/>.</summary>
        public static IntPtr Host { get; private set; }
        /// <summary>SHELLDLL_DefView, the icon layer, when it is a sibling the wallpaper must sit under (24H2).</summary>
        public static IntPtr Icons { get; private set; }
        public static bool Layered24H2 { get; private set; }
        /// <summary>What the last discovery found, for error.log and the diagnostics window.</summary>
        public static string Report { get; private set; } = "尚未探测桌面层";

        /// <summary>Finds (and if needed creates) the layer behind the desktop icons. False if Explorer is not running.</summary>
        public static bool Find()
        {
            var notes = new List<string>();
            IntPtr progman = Native.FindWindow("Progman", null);
            if (progman == IntPtr.Zero)
            {
                Report = "找不到 Progman：资源管理器（Explorer）可能没有运行";
                return false;
            }
            notes.Add($"Progman=0x{progman:X} 可见={Native.IsWindowVisible(progman)} 区域={Rect(progman)}");

            // Explorer builds the layer asynchronously after the message; a slow or busy machine needs more than one try.
            for (int attempt = 1; attempt <= 3; attempt++)
            {
                Native.SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(0x1), Native.SMTO_NORMAL, 1000, out _);
                Native.SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, Native.SMTO_NORMAL, 1000, out _);
                if (Locate(progman, notes, attempt))
                {
                    Report = string.Join("\r\n", notes);
                    return true;
                }
                System.Threading.Thread.Sleep(300);
            }

            // Nothing standard: parent to Progman itself. Icons are its child on the classic layout, so this still sits
            // behind them; the log records it in case the pond never shows.
            Host = progman;
            Icons = Native.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
            Layered24H2 = false;
            notes.Add($"未找到覆盖全屏的 WorkerW，退回 Progman=0x{progman:X}（Icons=0x{Icons:X}）");
            Report = string.Join("\r\n", notes);
            return true;
        }

        private static bool Locate(IntPtr progman, List<string> notes, int attempt)
        {
            // Windows 11 24H2 and later: the icons and the WorkerW live inside Progman.
            IntPtr innerIcons = Native.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
            IntPtr innerWorker = Native.FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
            if (innerIcons != IntPtr.Zero && innerWorker != IntPtr.Zero)
            {
                Host = progman; Icons = innerIcons; Layered24H2 = true;
                notes.Add($"第 {attempt} 次：图标与 WorkerW 都在 Progman 内（24H2 布局），Icons=0x{innerIcons:X} WorkerW=0x{innerWorker:X}");
                return true;
            }

            // Earlier Windows: a top-level window holds SHELLDLL_DefView, and the wallpaper WorkerW follows it in z-order.
            var tops = new List<IntPtr>();
            Native.EnumWindows((hwnd, _) => { tops.Add(hwnd); return true; }, IntPtr.Zero);

            int iconAt = -1;
            IntPtr iconHost = IntPtr.Zero;
            for (int i = 0; i < tops.Count; i++)
                if (Native.FindWindowEx(tops[i], IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
                {
                    iconAt = i; iconHost = tops[i]; break;
                }
            if (iconAt < 0)
            {
                notes.Add($"第 {attempt} 次：没有找到含 SHELLDLL_DefView 的顶层窗口");
                return false;
            }
            notes.Add($"第 {attempt} 次：图标宿主=0x{iconHost:X}（z 序第 {iconAt + 1} 个）区域={Rect(iconHost)}");

            var screen = SystemInformation.VirtualScreen;
            int candidates = 0;
            for (int i = iconAt + 1; i < tops.Count; i++)
            {
                IntPtr h = tops[i];
                if (Native.ClassOf(h) != "WorkerW") continue;
                candidates++;
                var r = Rect(h);
                bool covers = r.Width >= screen.Width && r.Height >= screen.Height;
                notes.Add($"　候选 WorkerW=0x{h:X} 可见={Native.IsWindowVisible(h)} 区域={r} 覆盖全屏={covers}");
                if (Native.IsWindowVisible(h) && covers)
                {
                    Host = h; Icons = IntPtr.Zero; Layered24H2 = false;
                    notes.Add($"　→ 采用 WorkerW=0x{h:X}");
                    return true;
                }
            }
            notes.Add($"第 {attempt} 次：图标层之后有 {candidates} 个 WorkerW，没有覆盖全屏的");
            return false;
        }

        /// <summary>Makes <paramref name="window"/> part of the desktop, covering <paramref name="screen"/> (screen pixels).
        /// Returns the same area in the host's client coordinates, where the window now lives. Throws instead of leaving
        /// the window as a plain top-level form, which would cover the desktop icons.</summary>
        public static Rectangle Attach(IntPtr window, Rectangle screen)
        {
            if (Host == IntPtr.Zero || !Native.IsWindow(Host))
                throw new InvalidOperationException("桌面宿主窗口不存在或已失效");

            // A tool window that never takes focus: it stays out of Alt-Tab and never steals the keyboard.
            long ex = Native.GetWindowLongPtr(window, Native.GWL_EXSTYLE).ToInt64() | Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE;
            // Progman on 24H2 composes its children without redirection bitmaps; a layered child renders reliably there.
            if (Layered24H2) ex |= Native.WS_EX_LAYERED;
            Native.SetWindowLongPtr(window, Native.GWL_EXSTYLE, new IntPtr(ex));
            if (Layered24H2) Native.SetLayeredWindowAttributes(window, 0, 255, Native.LWA_ALPHA);

            // SetParent leaves the styles alone, and a window that is not WS_CHILD does not report its parent through
            // GetParent: it would look like a failure even when the window is now inside the desktop. Declare it a child.
            long style = Native.GetWindowLongPtr(window, Native.GWL_STYLE).ToInt64();
            style = (style & ~Native.WS_POPUP) | Native.WS_CHILD;
            Native.SetWindowLongPtr(window, Native.GWL_STYLE, new IntPtr(style));

            int error = 0;
            Native.SetParent(window, Host);
            if (Native.GetParent(window) != Host)
            {
                error = System.Runtime.InteropServices.Marshal.GetLastWin32Error();
                throw new Win32Exception(error == 0 ? unchecked((int)0x80004005) : error,
                    $"无法把壁纸窗口挂到桌面层（宿主 0x{Host:X}，GetParent=0x{Native.GetParent(window):X}）" +
                    (Native.IsElevated() ? "；当前进程是管理员权限，请以普通权限运行" : ""));
            }

            // Screen pixels → the host's client coordinates (the host spans the whole virtual screen).
            var r = new Native.RECT { Left = screen.Left, Top = screen.Top, Right = screen.Right, Bottom = screen.Bottom };
            Native.MapWindowPoints(IntPtr.Zero, Host, ref r, 2);
            uint flags = Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW;
            if (Icons != IntPtr.Zero) Native.SetWindowPos(window, Icons, r.Left, r.Top, r.Width, r.Height, flags);  // right under the icons
            else Native.SetWindowPos(window, IntPtr.Zero, r.Left, r.Top, r.Width, r.Height, flags | Native.SWP_NOZORDER);
            return new Rectangle(r.Left, r.Top, r.Width, r.Height);
        }

        /// <summary>Repaints the plain desktop wallpaper, so nothing of the pond lingers after the app quits.</summary>
        public static void Refresh()
        {
            if (Host != IntPtr.Zero) Native.RedrawWindow(Host, IntPtr.Zero, IntPtr.Zero, Native.RDW_INVALIDATE | Native.RDW_ERASE | Native.RDW_ALLCHILDREN | Native.RDW_UPDATENOW);
        }

        private static Rectangle Rect(IntPtr hwnd)
        {
            return Native.GetWindowRect(hwnd, out var r) ? new Rectangle(r.Left, r.Top, r.Width, r.Height) : Rectangle.Empty;
        }
    }
}
