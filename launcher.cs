using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

class Program {
    static void Main(string[] args) {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        
        // Check for bundled portable node or system node
        string bundledNode = Path.Combine(baseDir, "runtime", "node.exe");
        string nodeExecutable = File.Exists(bundledNode) ? bundledNode : "node.exe";

        string serverScript = Path.Combine(baseDir, "server", "index.js");

        if (!File.Exists(serverScript)) {
            Console.WriteLine("[Error] server/index.js not found in: " + baseDir);
            Console.WriteLine("Press any key to exit...");
            Console.ReadKey();
            return;
        }

        Console.Title = "Octopath Helper — Live Companion Server";
        Console.WriteLine("=================================================");
        Console.WriteLine("  Octopath Helper — Live Telemetry Companion");
        Console.WriteLine("=================================================");
        Console.WriteLine();
        Console.WriteLine("[Octopath Helper] Starting local server on http://localhost:3001 ...");

        ProcessStartInfo psi = new ProcessStartInfo {
            FileName = nodeExecutable,
            Arguments = string.Format("\"{0}\"", serverScript),
            WorkingDirectory = baseDir,
            UseShellExecute = false,
            CreateNoWindow = false
        };

        try {
            Process nodeProc = Process.Start(psi);

            // Open browser once server spins up
            ThreadPool.QueueUserWorkItem(_ => {
                Thread.Sleep(1200);
                try {
                    Process.Start("http://localhost:3001");
                } catch { }
            });

            nodeProc.WaitForExit();
        } catch (Exception ex) {
            Console.WriteLine("[Error] Failed to launch server: " + ex.Message);
            Console.WriteLine("If Node.js is not bundled in runtime/node.exe, please install Node.js from https://nodejs.org/");
            Console.WriteLine("Press any key to exit...");
            Console.ReadKey();
        }
    }
}
