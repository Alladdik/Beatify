using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BeatifyServer.Data;
using BeatifyServer.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace BeatifyServer.Controllers;

/// <summary>YouTube Music / SoundCloud through yt-dlp: search, radio, signed stream proxy, lyrics.</summary>
[ApiController]
[Route("api/[controller]")]
public class ExternalSearchController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<ExternalSearchController> _logger;
    private readonly IHttpClientFactory _http;
    private readonly IMemoryCache _cache;
    private readonly LyricsService _lyrics;
    private readonly IConfiguration _config;

    // Hosts the audio proxy is allowed to fetch from. Anything else is refused (no open proxy / SSRF).
    private static readonly string[] StreamHostSuffixes =
        { ".googlevideo.com", ".youtube.com", ".ytimg.com", ".sndcdn.com", ".soundcloud.com", ".soundcloud.cloud", ".akamaized.net" };

    public ExternalSearchController(AppDbContext db, ILogger<ExternalSearchController> logger, IHttpClientFactory http,
        IMemoryCache cache, LyricsService lyrics, IConfiguration config)
    {
        _db = db; _logger = logger; _http = http; _cache = cache; _lyrics = lyrics; _config = config;
    }

    // ── Search ───────────────────────────────────────────────────────────────
    // GET /api/externalsearch?q=...&source=youtube|soundcloud&limit=8
    [HttpGet]
    [Authorize]
    public async Task<IActionResult> Search([FromQuery] string q, [FromQuery] string source = "youtube", [FromQuery] int limit = 8)
    {
        q = (q ?? "").Trim();
        if (q.Length < 2 || q.Length > 200) return Ok(new List<object>());
        limit = Math.Clamp(limit, 1, 25);
        source = source == "soundcloud" ? "soundcloud" : "youtube";

        var key = $"xs:{source}:{limit}:{q.ToLowerInvariant()}";
        if (_cache.TryGetValue(key, out List<object>? hit) && hit != null) return Ok(hit);

        var prefix = source == "soundcloud" ? "scsearch" : "ytsearch";
        try
        {
            var result = await YtDlp.RunAsync(new[]
            {
                "--dump-json", "--flat-playlist", "--no-warnings", "--extractor-args", "youtube:skip=dash,hls",
                $"{prefix}{limit}:{q}",
            }, TimeSpan.FromSeconds(40), HttpContext.RequestAborted);

            var items = ParseEntries(result.Output, source);
            if (items.Count > 0) _cache.Set(key, items, TimeSpan.FromMinutes(10));
            return Ok(items);
        }
        catch (System.ComponentModel.Win32Exception)
        {
            return StatusCode(503, new { message = "На сервері не встановлено yt-dlp, тому пошук в інтернеті недоступний." });
        }
        catch (OperationCanceledException) { return Ok(new List<object>()); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "External search failed");
            return Ok(new List<object>());
        }
    }

    private static List<object> ParseEntries(string output, string defaultSource)
    {
        var items = new List<object>();
        foreach (var line in (output ?? "").Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            try
            {
                using var doc = JsonDocument.Parse(line);
                var r = doc.RootElement;
                string? S(string n) => r.TryGetProperty(n, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

                var id = S("id");
                var title = S("title");
                if (id == null || title == null) continue;
                var artist = S("artist") ?? S("uploader") ?? S("channel");
                var webpage = S("webpage_url") ?? S("url");
                var src = webpage?.Contains("soundcloud", StringComparison.OrdinalIgnoreCase) == true ? "soundcloud"
                        : webpage?.Contains("youtu", StringComparison.OrdinalIgnoreCase) == true ? "youtube" : defaultSource;
                if (src == "youtube" && (webpage == null || !webpage.StartsWith("http"))) webpage = $"https://www.youtube.com/watch?v={id}";
                if (webpage == null) continue;

                string? thumb = S("thumbnail");
                if (thumb == null && r.TryGetProperty("thumbnails", out var th) && th.ValueKind == JsonValueKind.Array && th.GetArrayLength() > 0)
                    thumb = th[th.GetArrayLength() - 1].TryGetProperty("url", out var tu) ? tu.GetString() : null;
                if (thumb == null && src == "youtube") thumb = $"https://i.ytimg.com/vi/{id}/hqdefault.jpg";

                int? duration = r.TryGetProperty("duration", out var d) && d.ValueKind == JsonValueKind.Number ? (int)d.GetDouble() : null;
                items.Add(new { id, title, artist, duration, thumbnail = thumb, webpage_url = webpage, source = src });
            }
            catch { /* skip a malformed line */ }
        }
        return items;
    }

    // ── Radio: similar tracks from the open web for a library track ──────────
    [HttpGet("radio")]
    [Authorize]
    public async Task<IActionResult> Radio([FromQuery] int trackId, [FromQuery] int limit = 8)
    {
        var track = await _db.Tracks.AsNoTracking().Include(t => t.Artist).FirstOrDefaultAsync(t => t.Id == trackId);
        if (track == null) return NotFound(new { message = "Трек не знайдено" });
        limit = Math.Clamp(limit, 1, 20);

        var artist = track.Artist?.Name ?? "";
        var key = $"radio:{trackId}:{limit}";
        if (_cache.TryGetValue(key, out List<object>? hit) && hit != null) return Ok(hit);

        try
        {
            var yt = await YtDlp.RunAsync(new[]
            {
                "--dump-json", "--flat-playlist", "--no-warnings", "--extractor-args", "youtube:skip=dash,hls",
                $"ytsearch{limit}:{$"{artist} {track.Title} similar".Trim()}",
            }, TimeSpan.FromSeconds(40), HttpContext.RequestAborted);
            var items = ParseEntries(yt.Output, "youtube");

            if (items.Count == 0)
            {
                var sc = await YtDlp.RunAsync(new[]
                {
                    "--dump-json", "--flat-playlist", "--no-warnings", $"scsearch{limit}:{$"{artist} {track.Title}".Trim()}",
                }, TimeSpan.FromSeconds(40), HttpContext.RequestAborted);
                items = ParseEntries(sc.Output, "soundcloud");
            }
            if (items.Count > 0) _cache.Set(key, items, TimeSpan.FromMinutes(30));
            return Ok(items);
        }
        catch (System.ComponentModel.Win32Exception) { return StatusCode(503, new { message = "yt-dlp не встановлено" }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Radio failed for trackId={TrackId}", trackId);
            return Ok(new List<object>());
        }
    }

    // ── Stream: resolve once, play through a signed, range-aware proxy ───────
    // GET /api/externalsearch/previewurl?url=<youtube/soundcloud page>
    [HttpGet("previewurl")]
    [Authorize]
    public async Task<IActionResult> GetPreviewUrl([FromQuery] string url)
    {
        if (!YtDlp.IsAllowedPageUrl(url)) return BadRequest(new { message = "Підтримуються лише посилання YouTube та SoundCloud" });

        var key = $"stream:{url}";
        if (!_cache.TryGetValue(key, out string? direct) || string.IsNullOrEmpty(direct))
        {
            try
            {
                var res = await YtDlp.RunAsync(new[]
                {
                    "-f", "bestaudio[ext=m4a]/bestaudio/best", "--get-url", "--no-warnings", "--no-playlist", "--", url,
                }, TimeSpan.FromSeconds(45), HttpContext.RequestAborted);
                if (!res.Success || string.IsNullOrWhiteSpace(res.Output))
                {
                    _logger.LogWarning("yt-dlp could not resolve {Url}: {Err}", url, res.Error);
                    return BadRequest(new { message = "Не вдалося отримати аудіо з цього джерела" });
                }
                direct = res.Output.Trim().Split('\n')[0].Trim();
                _cache.Set(key, direct, TimeSpan.FromMinutes(25));
            }
            catch (System.ComponentModel.Win32Exception) { return StatusCode(503, new { message = "yt-dlp не встановлено" }); }
            catch (OperationCanceledException) { return StatusCode(499); }
        }

        var exp = DateTimeOffset.UtcNow.AddHours(6).ToUnixTimeSeconds();
        var sig = Sign(direct!, exp);
        var proxy = $"{Request.Scheme}://{Request.Host}/api/externalsearch/proxy?url={Uri.EscapeDataString(direct!)}&exp={exp}&sig={sig}";
        return Ok(new { streamUrl = proxy });
    }

    // GET /api/externalsearch/proxy?url=&exp=&sig=   (the <audio> element can't send a JWT, so the link itself is signed)
    [HttpGet("proxy")]
    [AllowAnonymous]
    public async Task ProxyStream([FromQuery] string url, [FromQuery] long exp, [FromQuery] string sig)
    {
        if (string.IsNullOrWhiteSpace(url) || DateTimeOffset.UtcNow.ToUnixTimeSeconds() > exp || !Verify(url, exp, sig)
            || !Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps
            || !StreamHostSuffixes.Any(s => uri.Host.EndsWith(s, StringComparison.OrdinalIgnoreCase)))
        {
            Response.StatusCode = 403;
            return;
        }

        var client = _http.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(30);
        using var req = new HttpRequestMessage(HttpMethod.Get, uri);
        req.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36");
        if (Request.Headers.TryGetValue("Range", out var range) && !string.IsNullOrEmpty(range))
            req.Headers.TryAddWithoutValidation("Range", range.ToString());

        using var upstream = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, HttpContext.RequestAborted);
        Response.StatusCode = (int)upstream.StatusCode;
        Response.ContentType = upstream.Content.Headers.ContentType?.ToString() ?? "audio/mp4";
        Response.Headers["Accept-Ranges"] = "bytes";
        if (upstream.Content.Headers.ContentLength is long len) Response.ContentLength = len;
        if (upstream.Content.Headers.ContentRange is { } cr) Response.Headers["Content-Range"] = cr.ToString();
        Response.Headers["Cache-Control"] = "private, max-age=3600";

        await using var body = await upstream.Content.ReadAsStreamAsync(HttpContext.RequestAborted);
        try { await body.CopyToAsync(Response.Body, HttpContext.RequestAborted); }
        catch (OperationCanceledException) { /* listener skipped or seeked — normal */ }
    }

    private string Sign(string url, long exp)
    {
        var key = Encoding.UTF8.GetBytes(_config["Jwt:Key"]!);
        return Convert.ToHexString(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"{url}|{exp}"))).ToLowerInvariant();
    }

    private bool Verify(string url, long exp, string? sig) =>
        !string.IsNullOrEmpty(sig) && CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(Sign(url, exp)), Encoding.ASCII.GetBytes(sig));

    // ── Lyrics ───────────────────────────────────────────────────────────────
    // GET /api/externalsearch/fetchlyrics?artist=&title=&duration=
    [HttpGet("fetchlyrics")]
    public async Task<IActionResult> FetchLyrics([FromQuery] string artist, [FromQuery] string title, [FromQuery] int? duration)
    {
        if (string.IsNullOrWhiteSpace(title)) return BadRequest(new { message = "Потрібен параметр title" });
        var key = $"lyr:{artist}|{title}".ToLowerInvariant();
        if (_cache.TryGetValue(key, out LyricsResult? cached)) return Ok(cached == null ? new { found = false, lyrics = (string?)null } : new { found = true, lyrics = cached.Text, synced = cached.Synced, source = cached.Source });

        var r = await _lyrics.FindAsync(artist ?? "", title, duration, HttpContext.RequestAborted);
        _cache.Set(key, r, r == null ? TimeSpan.FromHours(2) : TimeSpan.FromHours(12));
        return Ok(r == null ? new { found = false, lyrics = (string?)null } : new { found = true, lyrics = r.Text, synced = r.Synced, source = r.Source });
    }

    // GET /api/externalsearch/lyrics?q=...   search inside lyrics of the local library
    [HttpGet("lyrics")]
    public async Task<IActionResult> SearchByLyrics([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Length < 3) return Ok(new List<object>());
        var lower = q.ToLower();
        var tracks = await _db.Tracks.AsNoTracking().Include(t => t.Artist)
            .Where(t => t.Lyrics != null && t.Lyrics.ToLower().Contains(lower))
            .Take(10)
            .Select(t => new { t.Id, t.Title, ArtistName = t.Artist!.Name, t.CoverPath, t.Duration, t.Lyrics, t.MediaType })
            .ToListAsync();
        return Ok(tracks);
    }

    // POST /api/externalsearch/fill-lyrics?maxTracks=50   (admin: backfill the library)
    [HttpPost("fill-lyrics")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> FillMissingLyrics([FromQuery] int maxTracks = 50)
    {
        var tracks = await _db.Tracks.Include(t => t.Artist)
            .Where(t => t.Lyrics == null || t.Lyrics == "").Take(Math.Clamp(maxTracks, 1, 200)).ToListAsync();
        if (tracks.Count == 0) return Ok(new { filled = 0, skipped = 0, total = 0, message = "Всі треки вже мають текст пісні" });

        int filled = 0, skipped = 0;
        foreach (var t in tracks)
        {
            var r = await _lyrics.FindAsync(t.Artist?.Name ?? "", t.Title, t.Duration, HttpContext.RequestAborted);
            if (r != null) { t.Lyrics = r.Text; filled++; } else skipped++;
        }
        await _db.SaveChangesAsync();
        return Ok(new { filled, skipped, total = tracks.Count, message = $"Знайдено: {filled}, не знайдено: {skipped}" });
    }

    // ── SoundCloud profile import (admin tooling) ────────────────────────────
    // GET /api/externalsearch/soundcloud/user?username=...&type=tracks|likes&limit=50
    [HttpGet("soundcloud/user")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> SoundCloudUser([FromQuery] string username, [FromQuery] string type = "tracks", [FromQuery] int limit = 50)
    {
        username = (username ?? "").Trim().Trim('/');
        if (username.Length == 0 || username.Any(c => !(char.IsLetterOrDigit(c) || c is '-' or '_' or '.')))
            return BadRequest(new { message = "Некоректне ім’я користувача SoundCloud" });

        var profileUrl = type == "likes" ? $"https://soundcloud.com/{username}/likes" : $"https://soundcloud.com/{username}";
        try
        {
            var res = await YtDlp.RunAsync(new[]
            {
                "--dump-json", "--flat-playlist", "--no-warnings", "--playlist-end", Math.Clamp(limit, 1, 200).ToString(), profileUrl,
            }, TimeSpan.FromSeconds(90), HttpContext.RequestAborted);
            if (!res.Success || string.IsNullOrWhiteSpace(res.Output))
                return Ok(new { user = new { username, name = (string?)null, avatar = (string?)null }, tracks = new List<object>() });

            var tracks = ParseEntries(res.Output, "soundcloud");
            string? name = null, avatar = null;
            var first = res.Output.Split('\n', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
            if (first != null)
            {
                using var doc = JsonDocument.Parse(first);
                name = doc.RootElement.TryGetProperty("uploader", out var u) ? u.GetString() : null;
                avatar = doc.RootElement.TryGetProperty("thumbnail", out var th) ? th.GetString() : null;
            }
            return Ok(new { user = new { username, name = name ?? username, avatar }, tracks, type, total = tracks.Count });
        }
        catch (System.ComponentModel.Win32Exception) { return StatusCode(503, new { message = "yt-dlp не встановлено" }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SoundCloud user fetch failed for {Username}", username);
            return StatusCode(500, new { message = "Не вдалося отримати дані SoundCloud" });
        }
    }
}
