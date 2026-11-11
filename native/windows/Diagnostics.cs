// 半亩方塘 · diagnostics: a plain-text log in %LOCALAPPDATA%\SkyPond\error.log that always records the machine and the
// desktop layers the wallpaper had to deal with, plus a window that copies it or uploads it to an anonymous paste so a
// friend can send back one link instead of describing a black window over the phone.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

namespace SkyPond
{
    internal static class Diagnostics
    {
        public static readonly string Folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SkyPond");
        public static string LogPath => Path.Combine(Folder, "error.log");

        /// <summary>Appends one entry. Never throws: logging must not take the app down.</summary>
        public static void Write(string what, Exception ex = null)
        {
            try
            {
                Directory.CreateDirectory(Folder);
                var sb = new StringBuilder();
                sb.Append('[').Append(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")).Append("] ").Append(what).Append("\r\n");
                if (ex != null) sb.Append(ex).Append("\r\n");
                sb.Append("\r\n");
                File.AppendAllText(LogPath, Sanitize(sb.ToString()), new UTF8Encoding(false));
                Trim();
            }
            catch (Exception) { }
        }

        /// <summary>Removes the user name, machine name and profile path, so a log can be sent to someone else.</summary>
        public static string Sanitize(string text)
        {
            if (string.IsNullOrEmpty(text)) return text;
            string s = text;
            string profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (!string.IsNullOrEmpty(profile)) s = s.Replace(profile, "%USERPROFILE%");
            // Only as a path component: a one-letter user name must not eat digits out of version numbers.
            string user = Environment.UserName;
            if (!string.IsNullOrEmpty(user))
                s = Regex.Replace(s, @"(?i)\\Users\\" + Regex.Escape(user) + @"\\", @"\Users\%USERNAME%\");
            string machine = Environment.MachineName;
            if (!string.IsNullOrEmpty(machine) && machine.Length >= 3)
                s = Regex.Replace(s, @"\b" + Regex.Escape(machine) + @"\b", "%COMPUTERNAME%", RegexOptions.IgnoreCase);
            return s;
        }

        // Keep the file small enough to paste, recent entries intact.
        private static void Trim()
        {
            try
            {
                var info = new FileInfo(LogPath);
                if (!info.Exists || info.Length <= 256 * 1024) return;
                string all = File.ReadAllText(LogPath, Encoding.UTF8);
                File.WriteAllText(LogPath, all.Substring(Math.Max(0, all.Length - 128 * 1024)), new UTF8Encoding(false));
            }
            catch (Exception) { }
        }

        public static string ReadLog()
        {
            try
            {
                if (File.Exists(LogPath))
                {
                    string text = File.ReadAllText(LogPath, Encoding.UTF8);
                    return string.IsNullOrWhiteSpace(text) ? EnvironmentReport() : text;
                }
            }
            catch (Exception) { }
            return EnvironmentReport();
        }

        /// <summary>Everything worth knowing about this machine, in one block that fits in a paste.</summary>
        public static string EnvironmentReport()
        {
            var sb = new StringBuilder();
            sb.AppendLine("半亩方塘 · 诊断信息");
            sb.AppendLine("时间：" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
            sb.AppendLine("版本：" + AppVersion());
            sb.AppendLine("系统：" + OsName());
            sb.AppendLine("进程：" + (Environment.Is64BitProcess ? "64 位" : "32 位") +
                          "；管理员权限：" + (Native.IsElevated() ? "是（会导致无法挂到桌面层）" : "否"));
            sb.AppendLine("WebView2：" + WebViewVersion());
            sb.AppendLine("程序目录：" + AppDomain.CurrentDomain.BaseDirectory);
            sb.AppendLine("web\\index.html：" + (File.Exists(Path.Combine(PondPage.WebFolder, "index.html")) ? "存在" : "缺失（没有完整解压？）"));
            sb.AppendLine("虚拟屏幕：" + SystemInformation.VirtualScreen);
            foreach (var screen in Screen.AllScreens)
                sb.AppendLine($"屏幕：{screen.DeviceName} 主屏={screen.Primary} 区域={screen.Bounds} 工作区={screen.WorkingArea}");
            sb.AppendLine("桌面层：");
            sb.Append(Desktop.Report);
            sb.AppendLine();
            return sb.ToString();
        }

        public static string AppVersion()
        {
            try { return FileVersionInfo.GetVersionInfo(Application.ExecutablePath).FileVersion; } catch (Exception) { return Application.ProductVersion; }
        }

        private static string OsName()
        {
            string name = "Windows", build = "", edition = "";
            try
            {
                using (var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion"))
                {
                    if (key != null)
                    {
                        name = key.GetValue("ProductName") as string ?? name;
                        edition = key.GetValue("DisplayVersion") as string ?? "";
                        build = key.GetValue("CurrentBuild") as string ?? "";
                    }
                }
            }
            catch (Exception) { }
            return $"{name} {edition} 内部版本 {build} {Environment.OSVersion.VersionString} {(Environment.Is64BitOperatingSystem ? "64 位" : "32 位")}".Trim();
        }

        private static string WebViewVersion()
        {
            try
            {
                string v = CoreWebView2Environment.GetAvailableBrowserVersionString();
                return string.IsNullOrEmpty(v) ? "未安装（需要 Microsoft Edge WebView2 运行时）" : v;
            }
            catch (Exception ex) { return "不可用：" + ex.Message; }
        }

        /// <summary>Uploads the text to an anonymous paste service and returns the URL. dpaste keeps it 30 days; paste.rs
        /// is the fallback when dpaste is unreachable. Both need no account.</summary>
        public static string Upload(string text)
        {
            Exception last = null;
            try
            {
                using (var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) })
                {
                    var form = new Dictionary<string, string>
                    {
                        { "content", text },
                        { "syntax", "text" },
                        { "expiry_days", "30" }
                    };
                    var response = http.PostAsync("https://dpaste.com/api/v2/", new FormUrlEncodedContent(form)).Result;
                    string url = response.Content.ReadAsStringAsync().Result.Trim();
                    if (response.IsSuccessStatusCode && url.StartsWith("http", StringComparison.OrdinalIgnoreCase)) return url;
                    throw new InvalidOperationException($"dpaste 返回 {response.StatusCode}：{url}");
                }
            }
            catch (Exception ex) { last = ex; }

            try
            {
                using (var wc = new WebClient())
                {
                    wc.Headers[HttpRequestHeader.ContentType] = "text/plain; charset=utf-8";
                    wc.Headers[HttpRequestHeader.UserAgent] = "SkyPond/" + AppVersion();
                    string url = wc.UploadString("https://paste.rs", "POST", text).Trim();
                    if (url.StartsWith("http", StringComparison.OrdinalIgnoreCase)) return url;
                    throw new InvalidOperationException("paste.rs 没有返回链接：" + url);
                }
            }
            catch (Exception ex) { last = ex; }

            throw new InvalidOperationException("上传失败（dpaste / paste.rs 都不可用）：" + last?.Message);
        }

        public static void OpenLogFolder()
        {
            try
            {
                Directory.CreateDirectory(Folder);
                Process.Start(new ProcessStartInfo("explorer.exe", "/select,\"" + LogPath + "\"") { UseShellExecute = true });
            }
            catch (Exception) { }
        }
    }
}
