using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

public sealed class BrowserHostRequest
{
    public int id { get; set; }
    public string action { get; set; }
    public string ProcessName { get; set; }
    public long Handle { get; set; }
    public long Parent { get; set; }
    public int x { get; set; }
    public int y { get; set; }
    public int width { get; set; }
    public int height { get; set; }
}

public sealed class BrowserHostResponse
{
    public int id { get; set; }
    public bool ok { get; set; }
    public object result { get; set; }
    public string error { get; set; }
}

public sealed class SideGlassWindowInfo
{
    public long Handle { get; set; }
    public int Pid { get; set; }
    public string Title { get; set; }
    public int X { get; set; }
    public int Y { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
}

public static class SideGlassBrowserHost
{
    private const int GWL_STYLE = -16;
    private const long WS_CAPTION = 0x00C00000L;
    private const long WS_THICKFRAME = 0x00040000L;
    private const long WS_POPUP = 0x80000000L;
    private const long WS_CHILD = 0x40000000L;
    private const long WS_VISIBLE = 0x10000000L;
    private const long WS_CLIPSIBLINGS = 0x04000000L;
    private const long WS_CLIPCHILDREN = 0x02000000L;
    private const uint SWP_FRAMECHANGED = 0x0020;
    private const uint WM_CLOSE = 0x0010;
    private const byte VK_F11 = 0x7A;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint MONITOR_DEFAULTTONEAREST = 0x00000002;

    private delegate bool EnumWindowsProc(IntPtr handle, IntPtr parameter);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct MONITORINFO
    {
        public int Size;
        public RECT Monitor;
        public RECT Work;
        public uint Flags;
    }

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr handle);
    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr handle);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr handle, StringBuilder text, int maxCount);
    [DllImport("user32.dll")]
    private static extern int GetWindowTextLength(IntPtr handle);
    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr handle, out RECT rect);
    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr handle, uint flags);
    [DllImport("user32.dll")]
    private static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")]
    private static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    private static extern IntPtr GetWindowLongPtr(IntPtr handle, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")]
    private static extern IntPtr SetWindowLongPtr(IntPtr handle, int index, IntPtr value);
    [DllImport("user32.dll")]
    private static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr handle, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")]
    private static extern bool MoveWindow(IntPtr handle, int x, int y, int width, int height, bool repaint);
    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr handle, int command);
    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr handle, uint message, IntPtr wParam, IntPtr lParam);

    public static List<SideGlassWindowInfo> List(string processName)
    {
        var windows = new List<SideGlassWindowInfo>();
        EnumWindows((handle, parameter) =>
        {
            if (!IsWindowVisible(handle)) return true;
            uint pid;
            GetWindowThreadProcessId(handle, out pid);
            try
            {
                var process = Process.GetProcessById((int)pid);
                if (!String.Equals(process.ProcessName, processName, StringComparison.OrdinalIgnoreCase)) return true;
            }
            catch
            {
                return true;
            }

            RECT rect;
            if (!GetWindowRect(handle, out rect)) return true;
            var title = new StringBuilder(GetWindowTextLength(handle) + 1);
            GetWindowText(handle, title, title.Capacity);
            windows.Add(new SideGlassWindowInfo
            {
                Handle = handle.ToInt64(),
                Pid = (int)pid,
                Title = title.ToString(),
                X = rect.Left,
                Y = rect.Top,
                Width = rect.Right - rect.Left,
                Height = rect.Bottom - rect.Top
            });
            return true;
        }, IntPtr.Zero);
        return windows;
    }

    private static bool IsFullscreen(IntPtr handle)
    {
        RECT rect;
        if (!GetWindowRect(handle, out rect)) return false;
        var monitor = MonitorFromWindow(handle, MONITOR_DEFAULTTONEAREST);
        var info = new MONITORINFO { Size = Marshal.SizeOf(typeof(MONITORINFO)) };
        if (!GetMonitorInfo(monitor, ref info)) return false;
        return Math.Abs(rect.Left - info.Monitor.Left) <= 2 &&
               Math.Abs(rect.Top - info.Monitor.Top) <= 2 &&
               Math.Abs(rect.Right - info.Monitor.Right) <= 2 &&
               Math.Abs(rect.Bottom - info.Monitor.Bottom) <= 2;
    }

    public static void Embed(IntPtr handle, IntPtr parent, int x, int y, int width, int height)
    {
        if (!IsWindow(handle)) throw new InvalidOperationException("Browser window is no longer available.");
        if (!IsFullscreen(handle))
        {
            SetForegroundWindow(handle);
            Thread.Sleep(180);
            keybd_event(VK_F11, 0, 0, UIntPtr.Zero);
            keybd_event(VK_F11, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(450);
        }

        long style = GetWindowLongPtr(handle, GWL_STYLE).ToInt64();
        long nextStyle = (style & ~(WS_CAPTION | WS_THICKFRAME | WS_POPUP)) |
                         WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS | WS_CLIPCHILDREN;
        SetWindowLongPtr(handle, GWL_STYLE, new IntPtr(nextStyle));
        SetParent(handle, parent);
        SetWindowPos(handle, IntPtr.Zero, x, y, width, height, SWP_FRAMECHANGED);
        ShowWindow(handle, 5);
    }

    public static void Resize(IntPtr handle, int x, int y, int width, int height)
    {
        if (!IsWindow(handle)) throw new InvalidOperationException("Browser window is no longer available.");
        MoveWindow(handle, x, y, width, height, true);
    }

    public static void Show(IntPtr handle)
    {
        if (!IsWindow(handle)) throw new InvalidOperationException("Browser window is no longer available.");
        ShowWindow(handle, 5);
    }

    public static void Hide(IntPtr handle)
    {
        if (IsWindow(handle)) ShowWindow(handle, 0);
    }

    public static void Close(IntPtr handle)
    {
        if (IsWindow(handle)) PostMessage(handle, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
    }
}

public static class BrowserHostProgram
{
    public static void Main()
    {
        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = new UTF8Encoding(false);
        var serializer = new JavaScriptSerializer();
        string line;

        while ((line = Console.ReadLine()) != null)
        {
            if (String.IsNullOrWhiteSpace(line)) continue;
            BrowserHostRequest request = null;
            BrowserHostResponse response;
            try
            {
                request = serializer.Deserialize<BrowserHostRequest>(line);
                object result = true;
                var handle = new IntPtr(request.Handle);

                switch (request.action)
                {
                    case "List":
                        result = SideGlassBrowserHost.List(request.ProcessName);
                        break;
                    case "Embed":
                        SideGlassBrowserHost.Embed(handle, new IntPtr(request.Parent), request.x, request.y, request.width, request.height);
                        break;
                    case "Resize":
                        SideGlassBrowserHost.Resize(handle, request.x, request.y, request.width, request.height);
                        break;
                    case "Show":
                        SideGlassBrowserHost.Show(handle);
                        break;
                    case "Hide":
                        SideGlassBrowserHost.Hide(handle);
                        break;
                    case "Close":
                        SideGlassBrowserHost.Close(handle);
                        break;
                    default:
                        throw new InvalidOperationException("Unknown browser host action: " + request.action);
                }

                response = new BrowserHostResponse { id = request.id, ok = true, result = result };
            }
            catch (Exception error)
            {
                response = new BrowserHostResponse
                {
                    id = request == null ? 0 : request.id,
                    ok = false,
                    error = error.Message
                };
            }

            Console.WriteLine(serializer.Serialize(response));
            Console.Out.Flush();
        }
    }
}
