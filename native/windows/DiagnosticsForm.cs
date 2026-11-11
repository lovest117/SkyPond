// 半亩方塘 · the diagnostics window: show the log, copy it, open its folder, or upload it and get a link to send back.
using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace SkyPond
{
    internal sealed class DiagnosticsForm : Form
    {
        private readonly TextBox log;
        private readonly Label status;
        private readonly Button upload;

        public DiagnosticsForm()
        {
            Text = "诊断日志";
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(LogicalToDeviceUnits(760), LogicalToDeviceUnits(560));
            MinimumSize = new Size(LogicalToDeviceUnits(520), LogicalToDeviceUnits(360));
            BackColor = Color.FromArgb(0xF7, 0xF6, 0xF2);

            log = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Both,
                WordWrap = false,
                Dock = DockStyle.Fill,
                Font = new Font("Consolas", 9f),
                BackColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle,
                Text = Diagnostics.Sanitize(Diagnostics.ReadLog())
            };
            log.Select(0, 0);

            var hint = new Label
            {
                Dock = DockStyle.Top,
                AutoSize = false,
                Height = LogicalToDeviceUnits(46),
                Padding = new Padding(10, 8, 10, 0),
                Text = "这里只有系统版本、桌面窗口层级和各次挂载结果，不含池塘设置、用户名或电脑名。\r\n" +
                       "上传会发到匿名粘贴服务（dpaste，保留 30 天），不需要账号；把拿到的链接发回来即可。",
                ForeColor = Color.FromArgb(0x5A, 0x5F, 0x55)
            };

            var buttons = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                Height = LogicalToDeviceUnits(52),
                FlowDirection = FlowDirection.LeftToRight,
                Padding = new Padding(8, 10, 8, 6),
                WrapContents = false
            };
            buttons.Controls.Add(Button("复制全文", (s, e) =>
            {
                try { Clipboard.SetText(log.Text); status.Text = "已复制全文，可以直接粘贴发送。"; }
                catch (Exception ex) { status.Text = "复制失败：" + ex.Message; }
            }));
            buttons.Controls.Add(Button("打开日志文件夹", (s, e) => Diagnostics.OpenLogFolder()));
            upload = Button("上传并复制链接", (s, e) => UploadAsync());
            buttons.Controls.Add(upload);
            buttons.Controls.Add(Button("关闭", (s, e) => Close()));

            status = new Label
            {
                Dock = DockStyle.Bottom,
                AutoSize = false,
                Height = LogicalToDeviceUnits(34),
                Padding = new Padding(10, 4, 10, 0),
                Text = "遇到问题就把这段文字或上传后的链接发回来。",
                ForeColor = Color.FromArgb(0x33, 0x66, 0x44)
            };

            Controls.Add(log);
            Controls.Add(hint);
            Controls.Add(status);
            Controls.Add(buttons);
        }

        private static Button Button(string text, EventHandler onClick)
        {
            var b = new Button
            {
                Text = text,
                AutoSize = true,
                Height = 32,
                Padding = new Padding(10, 2, 10, 2),
                Margin = new Padding(0, 0, 8, 0)
            };
            b.Click += onClick;
            return b;
        }

        private async void UploadAsync()
        {
            if (MessageBox.Show(this, "把上面的诊断信息上传到匿名粘贴服务吗？\r\n上传后会得到一个公开链接，方便发给开发者。",
                    "上传诊断日志", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            upload.Enabled = false;
            status.Text = "正在上传……";
            string text = log.Text;
            try
            {
                string url = await Task.Run(() => Diagnostics.Upload(text));
                try { Clipboard.SetText(url); } catch (Exception) { }
                status.Text = "已上传并复制链接：" + url;
                MessageBox.Show(this, "链接已复制：\r\n" + url + "\r\n\r\n把它发给开发者即可。", "上传完成",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                status.Text = ex.Message + "（可以先点「复制全文」直接粘贴。）";
            }
            finally { upload.Enabled = true; }
        }
    }
}
