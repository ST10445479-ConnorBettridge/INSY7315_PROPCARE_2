using System;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;

class Program
{
    static int Main(string[] args)
    {
        try
        {
            var repoRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", ".."));
            var startInfo = new ProcessStartInfo
            {
                FileName = "npm",
                Arguments = "start",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = false,
                WorkingDirectory = repoRoot
            };

            using (var proc = Process.Start(startInfo))
            {
                if (proc == null) return 1;

                bool browserOpened = false;

                proc.OutputDataReceived += (s, e) =>
                {
                    if (e.Data == null) return;
                    Console.WriteLine(e.Data);
                    if (!browserOpened)
                    {
                        try
                        {
                            var m = Regex.Match(e.Data, @"https?://localhost:\d+");
                            var url = m.Success ? m.Value : null;
                            if (url != null)
                            {
                                Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
                                browserOpened = true;
                            }
                        }
                        catch
                        {
                            // ignore
                        }
                    }
                };

                proc.ErrorDataReceived += (s, e) => { if (e.Data != null) Console.Error.WriteLine(e.Data); };
                proc.BeginOutputReadLine();
                proc.BeginErrorReadLine();

                var fallbackTimer = new System.Timers.Timer(2000) { AutoReset = false };
                fallbackTimer.Elapsed += (s, e) =>
                {
                    try
                    {
                        if (!browserOpened)
                        {
                            Process.Start(new ProcessStartInfo { FileName = "http://localhost:8124", UseShellExecute = true });
                            browserOpened = true;
                        }
                    }
                    catch
                    {
                        // ignore
                    }
                };
                fallbackTimer.Start();

                proc.WaitForExit();
                return proc.ExitCode;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Launcher error: {ex}");
            return 1;
        }
    }
}
