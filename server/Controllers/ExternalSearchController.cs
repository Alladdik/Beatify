using System.Diagnostics;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using BeatifyServer.Data;
using Microsoft.EntityFrameworkCore;

namespace BeatifyServer.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExternalSearchController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<ExternalSearchController> _logger;
    private readonly IHttpClientFactory _http;

    public ExternalSearchController(AppDbContext db, ILogger<ExternalSearchController> logger, IHttpClientFactory http)
    {
        _db = db;
        _logger = logger;
        _http = http;
    }

    // GET /api/externalsearch?q=...&source=youtube|soundcloud&limit=8
    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string q, [FromQuery] string source = "youtube", [FromQuery] int limit = 8)
    {
        if (string.IsNullOrWhiteSpace(q)) return Ok(new List<object>());

        var prefix = source == "soundcloud" ? "scsearch" : "ytsearch";
        var searchArg = $"\"{prefix}{limit}:{q}\"";

        var args = new[]
        {
            "--dump-json",
            "--flat-playlist",
            "--no-warnings",
            "--extractor-args", "youtube:skip=dash,hls",
            searchArg
        };

        try
        {
            var result = await RunYtDlp(args);
            if (!result.Success || string.IsNullOrWhiteSpace(result.Output))
                return Ok(new List<object>());

            var items = new List<object>();
            foreach (var line in result.Output.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                try
                {
                    using var doc = JsonDocument.Parse(line);
                    var root = doc.RootElement;

                    var id       = root.TryGetProperty("id",         out var idP)       ? idP.GetString()       : null;
                    var title    = root.TryGetProperty("title",      out var titleP)    ? titleP.GetString()    : "Unknown";
                    var artist   = root.TryGetProperty("uploader",   out var uploaderP) ? uploaderP.GetString()
                                 : root.TryGetProperty("artist",     out var artistP)   ? artistP.GetString()   : null;
                    int? duration = null;
                    if (root.TryGetProperty("duration", out var durP) && durP.ValueKind == JsonValueKind.Number)
                        duration = (int)durP.GetDouble();
                    var thumb    = root.TryGetProperty("thumbnail",  out var thumbP)    ? thumbP.GetString()    : null;
                    var webpage  = root.TryGetProperty("webpage_url",out var wpP)       ? wpP.GetString()
                                 : root.TryGetProperty("url",        out var urlP)      ? urlP.GetString()      : null;

                    if (id == null || title == null) continue;

                    items.Add(new
                    {
                        id, title, artist, duration, thumbnail = thumb,
                        webpage_url = webpage,
                        source
                    });
                }
                catch { /* skip malformed line */ }
            }
            return Ok(items);
        }
        catch (System.ComponentModel.Win32Exception)
        {
            // yt-dlp not installed
            return StatusCode(503, new { message = "yt-dlp не встановлено. Встановіть: winget install yt-dlp" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "External search failed");
            return Ok(new List<object>());
        }
    }

    // GET /api/externalsearch/radio?trackId=5&limit=8
    // Returns similar tracks from YouTube (or SoundCloud fallback) for a seed track from the DB
    [HttpGet("radio")]
    public async Task<IActionResult> Radio([FromQuery] int trackId, [FromQuery] int limit = 8)
    {
        var track = await _db.Tracks
            .Include(t => t.Artist)
            .FirstOrDefaultAsync(t => t.Id == trackId);

        if (track == null) return NotFound(new { message = "Track not found" });

        var artist = track.Artist?.Name ?? "";
        var title  = track.Title;
        var query  = $"{artist} {title} similar".Trim();

        // Primary: YouTube similar search
        var ytArgs = new[]
        {
            "--dump-json",
            "--flat-playlist",
            "--no-warnings",
            "--extractor-args", "youtube:skip=dash,hls",
            $"\"ytsearch{limit}:{query}\""
        };

        try
        {
            var result = await RunYtDlp(ytArgs);

            // Fallback: SoundCloud if YouTube yielded nothing
            if (!result.Success || string.IsNullOrWhiteSpace(result.Output))
            {
                var scQuery = $"{artist} {title}".Trim();
                var scArgs = new[]
                {
                    "--dump-json",
                    "--flat-playlist",
                    "--no-warnings",
                    $"\"scsearch{limit}:{scQuery}\""
                };
                result = await RunYtDlp(scArgs);
            }

            if (!result.Success || string.IsNullOrWhiteSpace(result.Output))
                return Ok(new List<object>());

            var items = new List<object>();
            foreach (var line in result.Output.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                try
                {
                    using var doc = JsonDocument.Parse(line);
                    var root = doc.RootElement;

                    var id      = root.TryGetProperty("id",          out var idP)       ? idP.GetString()       : null;
                    var t       = root.TryGetProperty("title",       out var titleP)    ? titleP.GetString()    : "Unknown";
                    var art     = root.TryGetProperty("uploader",    out var uploaderP) ? uploaderP.GetString()
                                : root.TryGetProperty("artist",      out var artistP)   ? artistP.GetString()   : null;
                    int? dur    = null;
                    if (root.TryGetProperty("duration", out var durP) && durP.ValueKind == JsonValueKind.Number)
                        dur = (int)durP.GetDouble();
                    var thumb   = root.TryGetProperty("thumbnail",   out var thumbP)    ? thumbP.GetString()    : null;
                    var webpage = root.TryGetProperty("webpage_url", out var wpP)       ? wpP.GetString()
                                : root.TryGetProperty("url",         out var urlP)      ? urlP.GetString()      : null;
                    var src     = webpage?.Contains("soundcloud") == true ? "soundcloud" : "youtube";

                    if (id == null || t == null) continue;

                    items.Add(new { id, title = t, artist = art, duration = dur, thumbnail = thumb, webpage_url = webpage, source = src });
                }
                catch { /* skip malformed line */ }
            }

            return Ok(items);
        }
        catch (System.ComponentModel.Win32Exception)
        {
            return StatusCode(503, new { message = "yt-dlp не встановлено. Встановіть: winget install yt-dlp" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Radio search failed for trackId={TrackId}", trackId);
            return Ok(new List<object>());
        }
    }

    // GET /api/externalsearch/previewurl?url=...
    // Returns the direct streamable audio URL (no download, just stream)
    [HttpGet("previewurl")]
    public async Task<IActionResult> GetPreviewUrl([FromQuery] string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return BadRequest();
        try
        {
            var args = new[]
            {
                "-f", "bestaudio[ext=m4a]/bestaudio/best",
                "--get-url",
                "--no-warnings",
                $"\"{url}\""
            };
            var result = await RunYtDlp(args);
            if (!result.Success || string.IsNullOrWhiteSpace(result.Output))
                return BadRequest(new { message = "Не вдалось отримати URL стріму" });

            var streamUrl = result.Output.Trim().Split('\n')[0];
            var proxyUrl = $"{Request.Scheme}://{Request.Host}/api/externalsearch/proxy?url={Uri.EscapeDataString(streamUrl)}";
            return Ok(new { streamUrl = proxyUrl });
        }
        catch (System.ComponentModel.Win32Exception)
        {
            return StatusCode(503, new { message = "yt-dlp не встановлено" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Preview URL failed");
            return BadRequest(new { message = ex.Message });
        }
    }

    // GET /api/externalsearch/proxy?url=...
    // Proxies the stream to bypass CORS for Web Audio API
    [HttpGet("proxy")]
    public async Task<IActionResult> ProxyStream([FromQuery] string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return BadRequest();
        try
        {
            var client = _http.CreateClient();
            client.Timeout = TimeSpan.FromMinutes(10); // For long streams
            var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
            if (!response.IsSuccessStatusCode) return BadRequest();
            
            Response.Headers.Append("Accept-Ranges", "bytes");
            return File(await response.Content.ReadAsStreamAsync(), response.Content.Headers.ContentType?.ToString() ?? "audio/mp4", enableRangeProcessing: true);
        }
        catch
        {
            return BadRequest();
        }
    }

    // Fetch lyrics from lrclib.net (free API, excellent quality)
    [HttpGet("fetchlyrics")]
    public async Task<IActionResult> FetchLyrics([FromQuery] string artist, [FromQuery] string title)
    {
        if (string.IsNullOrWhiteSpace(artist) || string.IsNullOrWhiteSpace(title))
            return BadRequest(new { message = "Потрібні параметри artist та title" });

        try
        {
            var client = _http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(15);
            client.DefaultRequestHeaders.Add("User-Agent", "Beatify/1.0 (https://github.com/beatify)");

            // 1. Try exact match
            var url = $"https://lrclib.net/api/get?artist_name={Uri.EscapeDataString(artist)}&track_name={Uri.EscapeDataString(title)}";
            var response = await client.GetAsync(url);
            
            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);
                var syncedText = doc.RootElement.TryGetProperty("syncedLyrics", out var syncedProp) && syncedProp.ValueKind == JsonValueKind.String ? syncedProp.GetString()?.Trim() : null;
                var plainText = doc.RootElement.TryGetProperty("plainLyrics", out var plainProp) && plainProp.ValueKind == JsonValueKind.String ? plainProp.GetString()?.Trim() : null;
                var lyrics = !string.IsNullOrWhiteSpace(syncedText) ? syncedText : plainText;
                
                if (!string.IsNullOrWhiteSpace(lyrics))
                    return Ok(new { lyrics, found = true });
            }

            // 2. Try search fallback
            var searchUrl = $"https://lrclib.net/api/search?q={Uri.EscapeDataString(artist + " " + title)}";
            var searchRes = await client.GetAsync(searchUrl);
            if (searchRes.IsSuccessStatusCode)
            {
                var searchJson = await searchRes.Content.ReadAsStringAsync();
                using var searchDoc = JsonDocument.Parse(searchJson);
                if (searchDoc.RootElement.ValueKind == JsonValueKind.Array)
                {
                    var options = new List<object>();
                    foreach (var match in searchDoc.RootElement.EnumerateArray().Take(5))
                    {
                        var trackName = match.TryGetProperty("trackName", out var tn) ? tn.GetString() : "";
                        var artistName = match.TryGetProperty("artistName", out var an) ? an.GetString() : "";
                        var sText = match.TryGetProperty("syncedLyrics", out var sp) && sp.ValueKind == JsonValueKind.String ? sp.GetString()?.Trim() : null;
                        var pText = match.TryGetProperty("plainLyrics", out var pp) && pp.ValueKind == JsonValueKind.String ? pp.GetString()?.Trim() : null;
                        var l = !string.IsNullOrWhiteSpace(sText) ? sText : pText;
                        if (!string.IsNullOrWhiteSpace(l))
                        {
                            options.Add(new {
                                title = trackName,
                                artist = artistName,
                                lyrics = l,
                                isSynced = !string.IsNullOrWhiteSpace(sText)
                            });
                        }
                    }

                    if (options.Count > 0)
                        return Ok(new { found = true, options = options });
                }
            }

            // 3. lyrics.ovh
            try
            {
                var ovhUrl = $"https://api.lyrics.ovh/v1/{Uri.EscapeDataString(artist)}/{Uri.EscapeDataString(title)}";
                var ovhRes = await client.GetAsync(ovhUrl);
                if (ovhRes.IsSuccessStatusCode)
                {
                    var ovhJson = await ovhRes.Content.ReadAsStringAsync();
                    using var ovhDoc = JsonDocument.Parse(ovhJson);
                    if (ovhDoc.RootElement.TryGetProperty("lyrics", out var ovhL) && ovhL.ValueKind == JsonValueKind.String)
                    {
                        var ovhLyrics = ovhL.GetString()?.Trim();
                        if (!string.IsNullOrWhiteSpace(ovhLyrics))
                            return Ok(new { lyrics = ovhLyrics, found = true, source = "lyrics.ovh" });
                    }
                }
            }
            catch { /* skip */ }

            // 4. lrclib with cleaned title (remove suffixes like "(official audio)", "(feat. ...)", etc.)
            var cleanTitle = System.Text.RegularExpressions.Regex.Replace(title,
                @"\s*[\(\[].*(official|audio|video|feat|ft\.|prod\.|remaster|remix|live).*[\)\]]", "",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase).Trim();
            if (!string.Equals(cleanTitle, title, StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(cleanTitle))
            {
                try
                {
                    var cleanUrl = $"https://lrclib.net/api/search?q={Uri.EscapeDataString(artist + " " + cleanTitle)}";
                    var cleanRes = await client.GetAsync(cleanUrl);
                    if (cleanRes.IsSuccessStatusCode)
                    {
                        var cleanJson = await cleanRes.Content.ReadAsStringAsync();
                        using var cleanDoc = JsonDocument.Parse(cleanJson);
                        if (cleanDoc.RootElement.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var match in cleanDoc.RootElement.EnumerateArray().Take(3))
                            {
                                var sText = match.TryGetProperty("syncedLyrics", out var sp2) && sp2.ValueKind == JsonValueKind.String ? sp2.GetString()?.Trim() : null;
                                var pText = match.TryGetProperty("plainLyrics", out var pp2) && pp2.ValueKind == JsonValueKind.String ? pp2.GetString()?.Trim() : null;
                                var l = !string.IsNullOrWhiteSpace(sText) ? sText : pText;
                                if (!string.IsNullOrWhiteSpace(l))
                                    return Ok(new { lyrics = l, found = true, source = "lrclib-clean" });
                            }
                        }
                    }
                }
                catch { /* skip */ }
            }

            // 5. ChartLyrics SOAP API (free, no key required)
            try
            {
                var chartUrl = $"http://api.chartlyrics.com/apiv1.asmx/SearchLyricDirect?artist={Uri.EscapeDataString(artist)}&song={Uri.EscapeDataString(cleanTitle.Length > 0 ? cleanTitle : title)}";
                var chartRes = await client.GetAsync(chartUrl);
                if (chartRes.IsSuccessStatusCode)
                {
                    var chartXml = await chartRes.Content.ReadAsStringAsync();
                    var lyricMatch = System.Text.RegularExpressions.Regex.Match(chartXml, @"<Lyric>([\s\S]*?)<\/Lyric>");
                    if (lyricMatch.Success)
                    {
                        var chartLyrics = lyricMatch.Groups[1].Value.Trim();
                        // decode XML entities
                        chartLyrics = System.Net.WebUtility.HtmlDecode(chartLyrics);
                        if (!string.IsNullOrWhiteSpace(chartLyrics) && chartLyrics.Length > 20)
                            return Ok(new { lyrics = chartLyrics, found = true, source = "chartlyrics" });
                    }
                }
            }
            catch { /* skip */ }

            // 6. Musixmatch unofficial API (no key for basic lookup)
            try
            {
                var mmUrl = $"https://api.musixmatch.com/ws/1.1/matcher.lyrics.get?q_track={Uri.EscapeDataString(cleanTitle.Length > 0 ? cleanTitle : title)}&q_artist={Uri.EscapeDataString(artist)}&apikey=live_6c53a97bad94f8df5e7f8d5028e32f8d";
                var mmRes = await client.GetAsync(mmUrl);
                if (mmRes.IsSuccessStatusCode)
                {
                    var mmJson = await mmRes.Content.ReadAsStringAsync();
                    using var mmDoc = JsonDocument.Parse(mmJson);
                    if (mmDoc.RootElement.TryGetProperty("message", out var mmMsg) &&
                        mmMsg.TryGetProperty("body", out var mmBody) &&
                        mmBody.TryGetProperty("lyrics", out var mmLyr) &&
                        mmLyr.TryGetProperty("lyrics_body", out var mmText) &&
                        mmText.ValueKind == JsonValueKind.String)
                    {
                        var mmLyrics = mmText.GetString()?.Trim();
                        if (mmLyrics != null) mmLyrics = System.Text.RegularExpressions.Regex.Replace(mmLyrics, @"\*{7}.*$", "", System.Text.RegularExpressions.RegexOptions.Singleline).Trim();
                        if (!string.IsNullOrWhiteSpace(mmLyrics) && mmLyrics.Length > 20)
                            return Ok(new { lyrics = mmLyrics, found = true, source = "musixmatch", partial = true });
                    }
                }
            }
            catch { /* skip */ }

            // 7. Genius.com scraping
            var geniusLyrics = await ScrapeGeniusLyrics(client, artist, cleanTitle.Length > 0 ? cleanTitle : title);
            if (!string.IsNullOrWhiteSpace(geniusLyrics))
                return Ok(new { lyrics = geniusLyrics, found = true, source = "genius" });

            return Ok(new { lyrics = (string?)null, found = false });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lyrics fetch failed for {Artist} - {Title}", artist, title);
            return Ok(new { lyrics = (string?)null, found = false });
        }
    }

    // GET /api/externalsearch/soundcloud/user?username=...&type=tracks|likes&limit=50
    [HttpGet("soundcloud/user")]
    public async Task<IActionResult> SoundCloudUser(
        [FromQuery] string username,
        [FromQuery] string type = "tracks",
        [FromQuery] int limit = 50)
    {
        if (string.IsNullOrWhiteSpace(username)) return BadRequest(new { message = "username обов'язковий" });

        var profileUrl = type == "likes"
            ? $"https://soundcloud.com/{username.Trim('/')}/likes"
            : $"https://soundcloud.com/{username.Trim('/')}";

        // Fetch user info + track list in one call
        var args = new[]
        {
            "--dump-json", "--flat-playlist", "--no-warnings",
            "--playlist-end", limit.ToString(),
            $"\"{profileUrl}\""
        };

        string? userName = null;
        string? userAvatar = null;
        string? userBio = null;

        try
        {
            var result = await RunYtDlp(args);
            if (!result.Success || string.IsNullOrWhiteSpace(result.Output))
                return Ok(new { user = new { username, name = (string?)null, avatar = (string?)null }, tracks = new List<object>() });

            var tracks = new List<object>();
            foreach (var line in result.Output.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                try
                {
                    using var doc = JsonDocument.Parse(line);
                    var root = doc.RootElement;

                    // First entry may be a playlist (user) — extract uploader info
                    if (userName == null && root.TryGetProperty("uploader", out var up))
                    {
                        userName = up.GetString();
                        if (root.TryGetProperty("thumbnail", out var av)) userAvatar = av.GetString();
                        if (root.TryGetProperty("description", out var d)) userBio = d.GetString();
                    }

                    var id      = root.TryGetProperty("id",          out var idP)  ? idP.GetString()  : null;
                    var title   = root.TryGetProperty("title",       out var ttP)  ? ttP.GetString()  : "Unknown";
                    var artist  = root.TryGetProperty("uploader",    out var upP)  ? upP.GetString()  : null;
                    int? dur    = null;
                    if (root.TryGetProperty("duration", out var durP) && durP.ValueKind == JsonValueKind.Number)
                        dur = (int)durP.GetDouble();
                    var thumb   = root.TryGetProperty("thumbnail",   out var thP)  ? thP.GetString()  : null;
                    var webpage = root.TryGetProperty("webpage_url", out var wpP)  ? wpP.GetString()
                                : root.TryGetProperty("url",         out var urlP) ? urlP.GetString() : null;

                    if (id == null || webpage == null) continue;

                    tracks.Add(new { id, title, artist, duration = dur, thumbnail = thumb, webpage_url = webpage, source = "soundcloud" });
                }
                catch { /* skip malformed line */ }
            }

            return Ok(new
            {
                user = new { username, name = userName ?? username, avatar = userAvatar, bio = userBio },
                tracks,
                type,
                total = tracks.Count
            });
        }
        catch (System.ComponentModel.Win32Exception)
        {
            return StatusCode(503, new { message = "yt-dlp не встановлено" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SoundCloud user fetch failed for {Username}", username);
            return StatusCode(500, new { message = ex.Message });
        }
    }

    // POST /api/externalsearch/fill-lyrics?maxTracks=50
    // Fill missing lyrics for all tracks (admin only)
    [HttpPost("fill-lyrics")]
    [Microsoft.AspNetCore.Authorization.Authorize(Roles = "admin")]
    public async Task<IActionResult> FillMissingLyrics([FromQuery] int maxTracks = 50)
    {
        var tracks = await _db.Tracks
            .Include(t => t.Artist)
            .Where(t => t.Lyrics == null || t.Lyrics == "")
            .Take(maxTracks)
            .ToListAsync();

        if (tracks.Count == 0)
            return Ok(new { filled = 0, skipped = 0, total = 0, message = "Всі треки вже мають текст пісні" });

        var client = _http.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(10);
        client.DefaultRequestHeaders.Add("User-Agent", "Beatify/1.0 (https://github.com/beatify)");

        int filled = 0, skipped = 0;

        foreach (var track in tracks)
        {
            var artist = track.Artist?.Name ?? "";
            if (string.IsNullOrWhiteSpace(artist) || string.IsNullOrWhiteSpace(track.Title))
            { skipped++; continue; }

            try
            {
                var cleanT = System.Text.RegularExpressions.Regex.Replace(track.Title,
                    @"\s*[\(\[].*(official|audio|video|feat|ft\.|prod\.|remaster|remix|live).*[\)\]]", "",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase).Trim();
                if (string.IsNullOrWhiteSpace(cleanT)) cleanT = track.Title;

                // Try lrclib exact match
                var url = $"https://lrclib.net/api/get?artist_name={Uri.EscapeDataString(artist)}&track_name={Uri.EscapeDataString(track.Title)}";
                var res = await client.GetAsync(url);
                if (res.IsSuccessStatusCode)
                {
                    var json = await res.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(json);
                    var synced = doc.RootElement.TryGetProperty("syncedLyrics", out var sp) && sp.ValueKind == JsonValueKind.String ? sp.GetString()?.Trim() : null;
                    var plain  = doc.RootElement.TryGetProperty("plainLyrics",  out var pp) && pp.ValueKind == JsonValueKind.String ? pp.GetString()?.Trim() : null;
                    var lyrics = !string.IsNullOrWhiteSpace(synced) ? synced : plain;
                    if (!string.IsNullOrWhiteSpace(lyrics))
                    { track.Lyrics = lyrics; filled++; continue; }
                }

                // Fallback: lrclib search
                var searchUrl = $"https://lrclib.net/api/search?q={Uri.EscapeDataString(artist + " " + track.Title)}";
                var sRes = await client.GetAsync(searchUrl);
                if (sRes.IsSuccessStatusCode)
                {
                    var sJson = await sRes.Content.ReadAsStringAsync();
                    using var sDoc = JsonDocument.Parse(sJson);
                    if (sDoc.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var match in sDoc.RootElement.EnumerateArray().Take(3))
                        {
                            var sText = match.TryGetProperty("syncedLyrics", out var s2) && s2.ValueKind == JsonValueKind.String ? s2.GetString()?.Trim() : null;
                            var pText = match.TryGetProperty("plainLyrics",  out var p2) && p2.ValueKind == JsonValueKind.String ? p2.GetString()?.Trim() : null;
                            var l = !string.IsNullOrWhiteSpace(sText) ? sText : pText;
                            if (!string.IsNullOrWhiteSpace(l)) { track.Lyrics = l; filled++; goto nextTrack; }
                        }
                    }
                }
                // Fallback: Genius scraping
                var geniusResult = await ScrapeGeniusLyrics(client, artist, cleanT);
                if (!string.IsNullOrWhiteSpace(geniusResult))
                { track.Lyrics = geniusResult; filled++; continue; }

                skipped++;
            }
            catch { skipped++; }
            nextTrack:;
        }

        await _db.SaveChangesAsync();
        return Ok(new { filled, skipped, total = tracks.Count, message = $"Знайдено: {filled}, не знайдено: {skipped}" });
    }

    // GET /api/externalsearch/lyrics?q=title+artist
    // Search lyrics in local DB
    [HttpGet("lyrics")]
    public async Task<IActionResult> SearchByLyrics([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Length < 3)
            return Ok(new List<object>());

        var lower = q.ToLower();
        var tracks = await _db.Tracks
            .Include(t => t.Artist)
            .Where(t => t.Lyrics != null && t.Lyrics.ToLower().Contains(lower))
            .Take(10)
            .Select(t => new
            {
                t.Id, t.Title,
                ArtistName = t.Artist!.Name,
                t.CoverPath, t.Duration, t.Lyrics, t.MediaType,
                // Return matching line context
                LyricsSnippet = t.Lyrics
            })
            .ToListAsync();

        return Ok(tracks);
    }

    private async Task<string?> ScrapeGeniusLyrics(HttpClient client, string artist, string title)
    {
        try
        {
            // Step 1: search via Genius internal API (no key needed)
            var q = Uri.EscapeDataString($"{artist} {title}");
            client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36");

            var searchUrl = $"https://genius.com/api/search/song?q={q}&per_page=3";
            var searchRes = await client.GetAsync(searchUrl);
            if (!searchRes.IsSuccessStatusCode) return null;

            var searchJson = await searchRes.Content.ReadAsStringAsync();
            using var searchDoc = JsonDocument.Parse(searchJson);

            string? songPath = null;
            if (searchDoc.RootElement.TryGetProperty("response", out var resp) &&
                resp.TryGetProperty("sections", out var sections) &&
                sections.ValueKind == JsonValueKind.Array)
            {
                foreach (var section in sections.EnumerateArray())
                {
                    if (!section.TryGetProperty("hits", out var hits)) continue;
                    foreach (var hit in hits.EnumerateArray())
                    {
                        if (hit.TryGetProperty("result", out var result) &&
                            result.TryGetProperty("path", out var path))
                        {
                            songPath = path.GetString();
                            break;
                        }
                    }
                    if (songPath != null) break;
                }
            }

            if (string.IsNullOrWhiteSpace(songPath)) return null;

            // Step 2: fetch lyrics page
            var pageUrl = $"https://genius.com{songPath}";
            var pageRes = await client.GetAsync(pageUrl);
            if (!pageRes.IsSuccessStatusCode) return null;

            var html = await pageRes.Content.ReadAsStringAsync();

            // Step 3: extract all data-lyrics-container="true" blocks
            var containerMatches = System.Text.RegularExpressions.Regex.Matches(
                html,
                @"data-lyrics-container=""true""[^>]*>([\s\S]*?)</div>(?=\s*<(?:div|section))",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase
            );

            if (containerMatches.Count == 0)
            {
                // Fallback: simpler pattern
                containerMatches = System.Text.RegularExpressions.Regex.Matches(
                    html,
                    @"data-lyrics-container=""true""[^>]*>([\s\S]{50,3000}?)</div>",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase
                );
            }

            if (containerMatches.Count == 0) return null;

            var sb = new System.Text.StringBuilder();
            foreach (System.Text.RegularExpressions.Match m in containerMatches)
            {
                var block = m.Groups[1].Value;
                // <br> → newline
                block = System.Text.RegularExpressions.Regex.Replace(block, @"<br\s*/?>", "\n", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                // strip all tags
                block = System.Text.RegularExpressions.Regex.Replace(block, @"<[^>]+>", "");
                // decode entities
                block = System.Net.WebUtility.HtmlDecode(block).Trim();
                if (!string.IsNullOrWhiteSpace(block))
                    sb.AppendLine(block);
            }

            var lyrics = sb.ToString().Trim();
            return lyrics.Length > 30 ? lyrics : null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Genius scrape failed: {msg}", ex.Message);
            return null;
        }
    }

    private static async Task<(bool Success, string Output, string Error)> RunYtDlp(string[] args)
    {
        var psi = new ProcessStartInfo("yt-dlp", string.Join(" ", args))
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        using var p = new Process { StartInfo = psi };
        p.Start();
        var outTask = p.StandardOutput.ReadToEndAsync();
        var errTask = p.StandardError.ReadToEndAsync();
        await p.WaitForExitAsync();
        return (p.ExitCode == 0, await outTask, await errTask);
    }
}
