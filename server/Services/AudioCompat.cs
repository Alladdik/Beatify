using System.Collections.Concurrent;
using System.Diagnostics;

namespace BeatifyServer.Services;

/// <summary>
/// yt-dlp often hands back WebM/Opus, which iPhone Safari cannot play. Such files are re-encoded once to AAC (.m4a),
/// kept in a cache folder next to the uploads, and served instead — AAC plays on every device.
/// The original file is never touched.
/// </summary>
public static class AudioCompat
{
    private static readonly HashSet<string> NeedsAac = new(StringComparer.OrdinalIgnoreCase) { ".webm", ".opus", ".ogg" };
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> Locks = new();

    public static bool NeedsConversion(string path) => NeedsAac.Contains(Path.GetExtension(path));

    /// <summary>Path of a playable copy: the cached .m4a (created on first use), or <paramref name="src"/> if ffmpeg failed.</summary>
    public static async Task<string> EnsureAacAsync(string src, string cacheDir, CancellationToken ct = default)
    {
        if (!NeedsConversion(src)) return src;

        Directory.CreateDirectory(cacheDir);
        var target = Path.Combine(cacheDir, Path.GetFileNameWithoutExtension(src) + ".m4a");
        if (File.Exists(target) && new FileInfo(target).Length > 0) return target;

        var gate = Locks.GetOrAdd(target, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            if (File.Exists(target) && new FileInfo(target).Length > 0) return target;

            var tmp = target + ".tmp.m4a";
            var psi = new ProcessStartInfo("ffmpeg")
            {
                RedirectStandardError = true, RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true,
            };
            foreach (var a in new[] { "-y", "-v", "error", "-i", src, "-vn", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", tmp })
                psi.ArgumentList.Add(a);

            using var p = Process.Start(psi)!;
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromMinutes(5));
            try { await p.WaitForExitAsync(timeout.Token); }
            catch (OperationCanceledException) { try { p.Kill(true); } catch { /* already gone */ } throw; }

            if (p.ExitCode != 0 || !File.Exists(tmp) || new FileInfo(tmp).Length == 0)
            {
                try { File.Delete(tmp); } catch { /* best effort */ }
                return src;
            }
            File.Move(tmp, target, overwrite: true);
            return target;
        }
        catch (System.ComponentModel.Win32Exception) { return src; }   // ffmpeg not installed: serve the original
        finally { gate.Release(); }
    }
}
