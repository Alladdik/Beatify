using System.Diagnostics;
using System.Text;

namespace BeatifyServer.Services;

/// <summary>
/// The only place that starts yt-dlp. Arguments go through ArgumentList (never string concatenation),
/// every call has a timeout, and concurrency is capped so a burst of searches can't fork-bomb the host.
/// </summary>
public static class YtDlp
{
    private static readonly SemaphoreSlim Gate = new(3);

    public static string Binary =>
        Environment.GetEnvironmentVariable("YTDLP_PATH") is { Length: > 0 } p ? p : "yt-dlp";

    public static readonly string[] AllowedPageHosts =
    {
        "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be",
        "soundcloud.com", "www.soundcloud.com", "m.soundcloud.com", "on.soundcloud.com",
    };

    /// <summary>True for http(s) URLs on a platform we are willing to hand to yt-dlp.</summary>
    public static bool IsAllowedPageUrl(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var u)
        && (u.Scheme == Uri.UriSchemeHttps || u.Scheme == Uri.UriSchemeHttp)
        && AllowedPageHosts.Contains(u.Host, StringComparer.OrdinalIgnoreCase);

    public static async Task<(bool Success, string Output, string Error)> RunAsync(
        IEnumerable<string> args, TimeSpan? timeout = null, CancellationToken ct = default)
    {
        await Gate.WaitAsync(ct);
        try
        {
            var psi = new ProcessStartInfo(Binary)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };
            foreach (var a in args) psi.ArgumentList.Add(a);

            using var process = new Process { StartInfo = psi };
            process.Start();
            var output = process.StandardOutput.ReadToEndAsync();
            var error = process.StandardError.ReadToEndAsync();

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(timeout ?? TimeSpan.FromSeconds(90));
            try
            {
                await process.WaitForExitAsync(cts.Token);
            }
            catch (OperationCanceledException)
            {
                try { process.Kill(entireProcessTree: true); } catch { /* already gone */ }
                return (false, "", "yt-dlp: перевищено час очікування");
            }
            return (process.ExitCode == 0, await output, await error);
        }
        finally
        {
            Gate.Release();
        }
    }
}
