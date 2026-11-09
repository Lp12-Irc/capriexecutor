using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

namespace CapriExecutor;

internal static class RobloxInspector
{
    private const string VerifiedHash = "F98B351FEBDE8A4F89F8B25B8B07AF62E6DD772CC3EEE374A4F77F0DCF477713";
    private const long SchedulerRva = 149215160; // decimal RVA, Roblox 0.746.0.7461267
    private const int MaxJobs = 256;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ReadProcessMemory(IntPtr process, IntPtr address, [Out] byte[] buffer,
        nuint size, out nuint bytesRead);

    [DllImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr handle);

    internal static string Inspect(Process client)
    {
        try
        {
            var module = client.Modules.Cast<ProcessModule>()
                .FirstOrDefault(item => item.ModuleName.Equals("RobloxPlayerBeta.exe", StringComparison.OrdinalIgnoreCase));
            if (module is null) return "Módulo Roblox indisponível";

            using var stream = File.OpenRead(module.FileName);
            var hash = Convert.ToHexString(SHA256.HashData(stream));
            if (!hash.Equals(VerifiedHash, StringComparison.OrdinalIgnoreCase))
                return "Build Roblox ainda não verificado";

            var process = OpenProcess(0x0410, false, client.Id);
            if (process == IntPtr.Zero) return "Leitura do processo indisponível";
            try
            {
                long baseAddress = module.BaseAddress.ToInt64();
                var scheduler = ReadQword(process, baseAddress + SchedulerRva);
                if (scheduler is null or 0) return "Aguardando TaskScheduler";
                var start = ReadQword(process, scheduler.Value + 200);
                var end = ReadQword(process, scheduler.Value + 208);
                if (start is null || end is null || end < start || end - start > MaxJobs * 16 || (end - start) % 16 != 0)
                    return "Fila de jobs indisponível";

                for (long entry = start.Value; entry < end.Value; entry += 16)
                {
                    var job = ReadQword(process, entry);
                    if (job is null or 0 || ReadJobName(process, job.Value) != "WaitingHybridScriptsJob") continue;
                    var context = ReadQword(process, job.Value + 0x1c0);
                    if (context is null or 0) return "Aguardando ScriptContext";
                    var typeName = ReadRttiName(process, baseAddress, context.Value);
                    return typeName == ".?AVScriptContext@RBX@@"
                        ? "ScriptContext verificado · execução indisponível"
                        : "ScriptContext não validado";
                }
                return "Aguardando jobs do jogo";
            }
            finally { CloseHandle(process); }
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            return "Inspeção do Roblox indisponível";
        }
    }

    private static byte[]? Read(IntPtr process, long address, int size)
    {
        if (address <= 0 || size <= 0) return null;
        var bytes = new byte[size];
        return ReadProcessMemory(process, new IntPtr(address), bytes, (nuint)size, out var count)
               && count == (nuint)size ? bytes : null;
    }

    private static long? ReadQword(IntPtr process, long address)
    {
        var bytes = Read(process, address, 8);
        return bytes is null ? null : BitConverter.ToInt64(bytes);
    }

    private static string? ReadJobName(IntPtr process, long job)
    {
        var storage = Read(process, job + 24, 32);
        if (storage is null) return null;
        long length = BitConverter.ToInt64(storage, 16);
        long capacity = BitConverter.ToInt64(storage, 24);
        if (length is < 1 or > 120 || capacity < length) return null;
        byte[]? data = capacity < 16
            ? storage[..(int)length]
            : Read(process, BitConverter.ToInt64(storage), (int)length);
        return data is null ? null : Encoding.UTF8.GetString(data);
    }

    private static string? ReadRttiName(IntPtr process, long baseAddress, long instance)
    {
        var vtable = ReadQword(process, instance);
        if (vtable is null or 0) return null;
        var locator = ReadQword(process, vtable.Value - 8);
        if (locator is null or 0) return null;
        var header = Read(process, locator.Value, 24);
        if (header is null || BitConverter.ToInt32(header) != 1) return null;
        var typeRva = BitConverter.ToInt32(header, 12);
        var name = Read(process, baseAddress + typeRva + 16, 64);
        return name is null ? null : Encoding.ASCII.GetString(name, 0, Array.IndexOf(name, (byte)0) is var i and >= 0 ? i : name.Length);
    }
}

