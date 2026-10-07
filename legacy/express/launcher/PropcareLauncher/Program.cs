using System.Diagnostics;
using System.Runtime.InteropServices;

string FindRepoRoot()
{
    var dir = AppContext.BaseDirectory;
    var di = new DirectoryInfo(dir);
    while (di != null)
    {
        if (File.Exists(Path.Combine(di.FullName, "package.json")) && File.Exists(Path.Combine(di.FullName, "server.js")))
            return di.FullName;
        di = di.Parent;
    }
    return Directory.GetCurrentDirectory();
}

string repo = FindRepoRoot();
Console.WriteLine($"Starting PropCare from: {repo}");

var npm = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "cmd.exe" : "npm";
var npmArgs = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "/c npm start" : "start";

var psi = new ProcessStartInfo
{
    FileName = npm,
    Arguments = npmArgs,
    WorkingDirectory = repo,
    UseShellExecute = false,
    RedirectStandardOutput = true,
    RedirectStandardError = true,
};

if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
{
    psi.FileName = "npm";
    psi.Arguments = "start";
}

var p = Process.Start(psi);
if (p == null)
{
    Console.Error.WriteLine("Failed to start npm. Is Node installed and on PATH?");
    return;
}

_ = Task.Run(async () =>
{
    var port = Environment.GetEnvironmentVariable("PORT") ?? "8124";
    var url = $"http://localhost:{port}/api/health";
    var ok = false;
    for (int i = 0; i < 60; i++)
    {
        try
        {
            using var c = new System.Net.Http.HttpClient();
            var r = await c.GetAsync(url);
            if (r.IsSuccessStatusCode)
            {
                ok = true;
                var browserUrl = $"http://localhost:{port}/";
                try { Process.Start(new ProcessStartInfo { FileName = browserUrl, UseShellExecute = true }); } catch { }
                break;
            }
        }
        catch { }
        await Task.Delay(1000);
    }
    if (!ok) Console.Error.WriteLine("Server did not become ready within 60s.");
});

Console.CancelKeyPress += (s, e) => {
    try { if (!p.HasExited) p.Kill(true); } catch { }
};

p.WaitForExit();
Environment.ExitCode = p.ExitCode;
