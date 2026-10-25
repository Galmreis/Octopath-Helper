using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

class Program {
    static void Main(string[] args) {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        
        string bundledNode = Path.Combine(baseDir, "runtime", "node.exe");
        string nodeExecutable = File.Exists(bundledNode) ? bundledNode : "node.exe";

        string serverScript = Path.Combine(baseDir, "server", "index.js");

        if (!File.Exists(serverScript)) {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("[Error] server/index.js not found in: " + baseDir);
            Console.ResetColor();
            Console.WriteLine("\nPlease ensure all files from the release ZIP are extracted into the same folder.");
            Console.WriteLine("\nPress any key to exit...");
            Console.ReadKey();
            return;
        }

        Console.Title = "Octopath Helper — Live Companion Server";
        Console.WriteLine("=================================================");
        Console.WriteLine("  OCTOPATH HELPER — LIVE COMPANION DASHBOARD");
        Console.WriteLine("=================================================");
        Console.WriteLine();
        Console.WriteLine("[Octopath Helper] Launching local server on http://localhost:3001 ...");

        ProcessStartInfo psi = new ProcessStartInfo {
            FileName = nodeExecutable,
            Arguments = string.Format("\"{0}\"", serverScript),
            WorkingDirectory = baseDir,
            UseShellExecute = false,
            CreateNoWindow = false
        };

        DateTime startTime = DateTime.UtcNow;

        try {
            Process nodeProc = Process.Start(psi);
            if (nodeProc == null) {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[Error] Could not start node process.");
                Console.ResetColor();
                Console.WriteLine("\nPress any key to exit...");
                Console.ReadKey();
                return;
            }

            // Open default browser once the server initializes
            ThreadPool.QueueUserWorkItem(_ => {
                Thread.Sleep(1200);
                try {
                    Process.Start(new ProcessStartInfo {
                        FileName = "http://localhost:3001",
                        UseShellExecute = true
                    });
                } catch { }
            });

            nodeProc.WaitForExit();

            TimeSpan uptime = DateTime.UtcNow - startTime;
            // If the server crashed quickly (under 3 seconds) or with error code, keep window open
            if (nodeProc.ExitCode != 0 || uptime.TotalSeconds < 3) {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine(string.Format("\n[Error] Server process terminated unexpectedly (Exit Code: {0}).", nodeProc.ExitCode));
                Console.ResetColor();
                Console.WriteLine("Press any key to exit...");
                Console.ReadKey();
            }
        } catch (Exception ex) {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("[Error] Failed to launch server: " + ex.Message);
            Console.ResetColor();
            Console.WriteLine("\nNode.js was not found on your system.");
            Console.WriteLine("Please install Node.js (LTS) from: https://nodejs.org/");
            Console.WriteLine("\nPress any key to exit...");
            Console.ReadKey();
        }
    }
}
