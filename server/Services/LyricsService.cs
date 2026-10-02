using System.Text.Json;
using System.Text.RegularExpressions;

namespace BeatifyServer.Services;

public record LyricsResult(string Text, bool Synced, string Source);

/// <summary>
/// Finds lyrics from open sources, best first: LRCLIB (time-synced) → LRCLIB search → lyrics.ovh → Genius.
/// Library tracks cache the result in the database, so each song is looked up at most once.
/// </summary>
public class LyricsService
{
    private readonly IHttpClientFactory _http;
    private readonly ILogger<LyricsService> _log;

    public LyricsService(IHttpClientFactory http, ILogger<LyricsService> log)
    {
        _http = http;
        _log = log;
    }

    private HttpClient Client()
    {
        var c = _http.CreateClient();
        c.Timeout = TimeSpan.FromSeconds(12);
        c.DefaultRequestHeaders.UserAgent.ParseAdd("Beatify/2.0 (+https://github.com/beatify)");
        return c;
    }

    private static string CleanTitle(string title)
    {
        var t = Regex.Replace(title, @"\s*[\(\[][^\)\]]*(official|audio|video|lyrics|feat|ft\.|prod\.|remaster|remix|live|клип|кліп)[^\)\]]*[\)\]]", "", RegexOptions.IgnoreCase);
        t = Regex.Replace(t, @"\s*[-–|]\s*(official.*|audio|lyrics?|video)$", "", RegexOptions.IgnoreCase);
        return t.Trim();
    }

    private static string? Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString()?.Trim() : null;

    private static LyricsResult? FromLrclib(JsonElement e, string source)
    {
        var synced = Str(e, "syncedLyrics");
        if (!string.IsNullOrWhiteSpace(synced)) return new LyricsResult(synced!, true, source);
        var plain = Str(e, "plainLyrics");
        return string.IsNullOrWhiteSpace(plain) ? null : new LyricsResult(plain!, false, source);
    }

    public async Task<LyricsResult?> FindAsync(string artist, string title, int? durationSeconds = null, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(title)) return null;
        var client = Client();
        var clean = CleanTitle(title);
        if (string.IsNullOrWhiteSpace(clean)) clean = title;

        // 1) exact LRCLIB lookup (duration makes it precise)
        foreach (var t in new[] { title, clean }.Distinct())
        {
            try
            {
                var url = $"https://lrclib.net/api/get?artist_name={Uri.EscapeDataString(artist)}&track_name={Uri.EscapeDataString(t)}"
                          + (durationSeconds > 0 ? $"&duration={durationSeconds}" : "");
                var res = await client.GetAsync(url, ct);
                if (res.IsSuccessStatusCode)
                {
                    using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
                    var r = FromLrclib(doc.RootElement, "lrclib");
                    if (r != null) return r;
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException) { _log.LogDebug(ex, "lrclib get failed"); }
        }

        // 2) LRCLIB search — prefer synced results whose duration is close
        try
        {
            var res = await client.GetAsync($"https://lrclib.net/api/search?q={Uri.EscapeDataString($"{artist} {clean}".Trim())}", ct);
            if (res.IsSuccessStatusCode)
            {
                using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
                if (doc.RootElement.ValueKind == JsonValueKind.Array)
                {
                    LyricsResult? best = null;
                    double bestScore = double.MinValue;
                    foreach (var m in doc.RootElement.EnumerateArray().Take(8))
                    {
                        var r = FromLrclib(m, "lrclib");
                        if (r == null) continue;
                        double score = r.Synced ? 10 : 0;
                        if (durationSeconds > 0 && m.TryGetProperty("duration", out var d) && d.ValueKind == JsonValueKind.Number)
                            score -= Math.Abs(d.GetDouble() - durationSeconds.Value);
                        if (score > bestScore) { bestScore = score; best = r; }
                    }
                    if (best != null) return best;
                }
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException) { _log.LogDebug(ex, "lrclib search failed"); }

        // 3) lyrics.ovh (plain)
        try
        {
            var res = await client.GetAsync($"https://api.lyrics.ovh/v1/{Uri.EscapeDataString(artist)}/{Uri.EscapeDataString(clean)}", ct);
            if (res.IsSuccessStatusCode)
            {
                using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
                var text = Str(doc.RootElement, "lyrics");
                if (!string.IsNullOrWhiteSpace(text) && text!.Length > 40) return new LyricsResult(text, false, "lyrics.ovh");
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException) { _log.LogDebug(ex, "lyrics.ovh failed"); }

        // 4) Genius (plain, scraped as a last resort)
        var genius = await GeniusAsync(client, artist, clean, ct);
        return genius == null ? null : new LyricsResult(genius, false, "genius");
    }

    private async Task<string?> GeniusAsync(HttpClient client, string artist, string title, CancellationToken ct)
    {
        try
        {
            client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36");
            var search = await client.GetAsync($"https://genius.com/api/search/song?q={Uri.EscapeDataString($"{artist} {title}")}&per_page=3", ct);
            if (!search.IsSuccessStatusCode) return null;
            using var doc = JsonDocument.Parse(await search.Content.ReadAsStringAsync(ct));
            string? path = null;
            if (doc.RootElement.TryGetProperty("response", out var resp) && resp.TryGetProperty("sections", out var sections))
                foreach (var s in sections.EnumerateArray())
                {
                    if (!s.TryGetProperty("hits", out var hits)) continue;
                    foreach (var h in hits.EnumerateArray())
                        if (h.TryGetProperty("result", out var r) && r.TryGetProperty("path", out var p)) { path = p.GetString(); break; }
                    if (path != null) break;
                }
            if (string.IsNullOrWhiteSpace(path)) return null;

            var html = await (await client.GetAsync($"https://genius.com{path}", ct)).Content.ReadAsStringAsync(ct);
            var blocks = Regex.Matches(html, @"data-lyrics-container=""true""[^>]*>([\s\S]*?)</div>(?=\s*<(?:div|section))", RegexOptions.IgnoreCase);
            if (blocks.Count == 0) blocks = Regex.Matches(html, @"data-lyrics-container=""true""[^>]*>([\s\S]{50,3000}?)</div>", RegexOptions.IgnoreCase);
            if (blocks.Count == 0) return null;

            var sb = new System.Text.StringBuilder();
            foreach (Match m in blocks)
            {
                var b = Regex.Replace(m.Groups[1].Value, @"<br\s*/?>", "\n", RegexOptions.IgnoreCase);
                b = System.Net.WebUtility.HtmlDecode(Regex.Replace(b, @"<[^>]+>", "")).Trim();
                if (b.Length > 0) sb.AppendLine(b);
            }
            var text = sb.ToString().Trim();
            return text.Length > 30 ? text : null;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _log.LogDebug(ex, "genius failed");
            return null;
        }
    }
}
