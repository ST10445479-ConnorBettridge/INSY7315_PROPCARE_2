using System;
using System.Diagnostics;
using System.IO;

class Program
{
    static int Main(string[] args)
    {
        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = "npm",
                Arguments = "start",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = false,
                WorkingDirectory = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", ".."))
            };

            using (var proc = Process.Start(startInfo))
            {
                if (proc == null) return 1;
                proc.OutputDataReceived += (s, e) => { if (e.Data != null) Console.WriteLine(e.Data); };
                proc.ErrorDataReceived += (s, e) => { if (e.Data != null) Console.Error.WriteLine(e.Data); };
                proc.BeginOutputReadLine();
                proc.BeginErrorReadLine();
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
