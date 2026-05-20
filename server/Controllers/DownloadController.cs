using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BeatifyServer.Data;
using BeatifyServer.DTOs;
using BeatifyServer.Models;

namespace BeatifyServer.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "admin")]
public class DownloadController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<DownloadController> _logger;
    private readonly IHttpClientFactory _http;

    public DownloadController(AppDbContext db, IWebHostEnvironment env, ILogger<DownloadController> logger, IHttpClientFactory http)
    {
        _db = db;
        _env = env;
        _logger = logger;
        _http = http;
    }

    // GET /api/download/info?url=...
    // Отримати мета-дані треку без завантаження
    [HttpGet("info")]
    public async Task<IActionResult> GetInfo([FromQuery] string url)
    {
        if (string.IsNullOrWhiteSpace(url))
            return BadRequest(new { message = "URL обов'язковий" });

        try
        {
            var info = await RunYtDlp(new[] { "--dump-json", "--no-playlist", url });
            if (!info.Success)
                return BadRequest(new { message = info.Error });

            using var doc = JsonDocument.Parse(info.Output);
            var root = doc.RootElement;

            var title = root.TryGetProperty("title", out var t) ? t.GetString() : "Unknown";
            var artist = root.TryGetProperty("artist", out var ar) ? ar.GetString()
                       : root.TryGetProperty("uploader", out var up) ? up.GetString() : "Unknown";
            var album = root.TryGetProperty("album", out var al) ? al.GetString() : null;
            var duration = root.TryGetProperty("duration", out var d) ? (int?)d.GetInt32() : null;
            var thumbnail = root.TryGetProperty("thumbnail", out var th) ? th.GetString() : null;
            var webpage = root.TryGetProperty("webpage_url", out var wp) ? wp.GetString() : url;

            return Ok(new { title, artist, album, duration, thumbnail, webpage_url = webpage });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching info for {Url}", url);
            return BadRequest(new { message = "Не вдалось отримати інформацію. Перевірте URL." });
        }
    }

    // POST /api/download
    // Завантажити та імпортувати трек у бібліотеку
    [HttpPost]
    public async Task<IActionResult> Download([FromBody] DownloadRequestDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Url))
            return BadRequest(new { message = "URL обов'язковий" });

        // Validate/create artist
        Artist artist;
        if (dto.ArtistId.HasValue && dto.ArtistId > 0)
        {
            var found = await _db.Artists.FindAsync(dto.ArtistId.Value);
            if (found == null) return BadRequest(new { message = "Виконавця не знайдено" });
            artist = found;
        }
        else
        {
            var artistName = string.IsNullOrWhiteSpace(dto.ArtistName) ? "Unknown Artist" : dto.ArtistName;
            var existing = await _db.Artists.FirstOrDefaultAsync(a => a.Name == artistName);
            if (existing != null) artist = existing;
            else
            {
                artist = new Artist { Name = artistName };
                _db.Artists.Add(artist);
                await _db.SaveChangesAsync();
            }
        }

        var tracksPath = Path.Combine(_env.WebRootPath, "uploads", "tracks");
        Directory.CreateDirectory(tracksPath);
        var coversPath = Path.Combine(_env.WebRootPath, "uploads", "covers");
        Directory.CreateDirectory(coversPath);

        var outputId = Guid.NewGuid().ToString();
        var outputTemplate = Path.Combine(tracksPath, $"{outputId}.%(ext)s");

        // Step 1: grab duration from JSON metadata (no ffprobe needed)
        int metaDuration = 0;
        var infoResult = await RunYtDlp(new[] { "--dump-json", "--no-playlist", $"\"{dto.Url}\"" });
        if (infoResult.Success && !string.IsNullOrWhiteSpace(infoResult.Output))
        {
            try
            {
                using var infoDoc = JsonDocument.Parse(infoResult.Output);
                if (infoDoc.RootElement.TryGetProperty("duration", out var dProp))
                    metaDuration = dProp.ValueKind == JsonValueKind.Number
                        ? (int)Math.Round(dProp.GetDouble()) : 0;
            }
            catch { /* ignore parse errors */ }
        }

        // Step 2: download best native audio — no ffmpeg conversion required
        var args = new List<string>
        {
            "--no-playlist",
            "--format", "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
            "--write-thumbnail",
            "-o", $"\"{outputTemplate}\"",
            $"\"{dto.Url}\""
        };

        var result = await RunYtDlp(args.ToArray());
        if (!result.Success)
        {
            _logger.LogWarning("yt-dlp failed: {Error}", result.Error);
            return BadRequest(new { message = $"Помилка завантаження: {result.Error}" });
        }

        static bool IsImageExt(string f) =>
            f.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) ||
            f.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase) ||
            f.EndsWith(".png", StringComparison.OrdinalIgnoreCase) ||
            f.EndsWith(".webp", StringComparison.OrdinalIgnoreCase);

        // Find downloaded audio file (anything that is not an image)
        var mp3File = Directory.GetFiles(tracksPath, $"{outputId}.*")
            .FirstOrDefault(f => !IsImageExt(f));
        if (mp3File == null)
            return StatusCode(500, new { message = "Файл не знайдено після завантаження" });

        // Find thumbnail (any image format — no conversion needed)
        var thumbFile = Directory.GetFiles(tracksPath, $"{outputId}.*")
            .FirstOrDefault(IsImageExt);

        string? coverPath = null;

        // Prefer Spotify cover art (high-res, correctly tagged) over yt-dlp thumbnail
        if (!string.IsNullOrWhiteSpace(dto.CoverUrl))
        {
            try
            {
                var httpClient = _http.CreateClient();
                var imageBytes = await httpClient.GetByteArrayAsync(dto.CoverUrl);
                var rawExt = dto.CoverUrl.Split('.').LastOrDefault()?.Split('?').FirstOrDefault() ?? "jpg";
                var ext = rawExt is "jpg" or "jpeg" or "png" or "webp" ? rawExt : "jpg";
                var coverFileName = $"{Guid.NewGuid()}.{ext}";
                await System.IO.File.WriteAllBytesAsync(Path.Combine(coversPath, coverFileName), imageBytes);
                coverPath = coverFileName;
                if (thumbFile != null && System.IO.File.Exists(thumbFile))
                    System.IO.File.Delete(thumbFile);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to download Spotify cover, falling back to yt-dlp thumbnail");
                if (thumbFile != null)
                {
                    var coverFileName = $"{Guid.NewGuid()}{Path.GetExtension(thumbFile)}";
                    System.IO.File.Move(thumbFile, Path.Combine(coversPath, coverFileName));
                    coverPath = coverFileName;
                }
            }
        }
        else if (thumbFile != null)
        {
            var coverFileName = $"{Guid.NewGuid()}{Path.GetExtension(thumbFile)}";
            System.IO.File.Move(thumbFile, Path.Combine(coversPath, coverFileName));
            coverPath = coverFileName;
        }

        // Fetch lyrics from lrclib.net (free, no auth needed)
        string? lyrics = null;
        if (!string.IsNullOrWhiteSpace(dto.Title) && !string.IsNullOrWhiteSpace(dto.ArtistName))
        {
            try
            {
                var httpClient = _http.CreateClient();
                var lrcUrl = $"https://lrclib.net/api/get?artist_name={Uri.EscapeDataString(dto.ArtistName)}&track_name={Uri.EscapeDataString(dto.Title)}";
                var lrcRes = await httpClient.GetAsync(lrcUrl);
                if (lrcRes.IsSuccessStatusCode)
                {
                    using var lrcDoc = JsonDocument.Parse(await lrcRes.Content.ReadAsStringAsync());
                    var synced = lrcDoc.RootElement.TryGetProperty("syncedLyrics", out var sp) && sp.ValueKind == JsonValueKind.String ? sp.GetString()?.Trim() : null;
                    var plain = lrcDoc.RootElement.TryGetProperty("plainLyrics", out var pp) && pp.ValueKind == JsonValueKind.String ? pp.GetString()?.Trim() : null;
                    lyrics = !string.IsNullOrWhiteSpace(synced) ? synced : plain;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Lyrics fetch failed for {Title}", dto.Title);
            }
        }

        // Prefer ffprobe for duration when ffmpeg is present; fall back to metadata
        var dur = metaDuration > 0 ? metaDuration : await GetDurationAsync(mp3File);

        var track = new Track
        {
            Title = dto.Title ?? Path.GetFileNameWithoutExtension(mp3File),
            ArtistId = artist.Id,
            AlbumId = dto.AlbumId,
            FilePath = Path.GetFileName(mp3File),
            CoverPath = coverPath,
            Duration = dur,
            Genre = dto.Genre,
            Lyrics = lyrics,
            MediaType = "audio"
        };

        _db.Tracks.Add(track);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            message = "Трек успішно завантажено!",
            trackId = track.Id,
            title = track.Title,
            artist = artist.Name
        });
    }

    // GET /api/download/artistsearch?name=...&platform=youtube|soundcloud&limit=50
    // Search for an artist's discography on external platforms
    [HttpGet("artistsearch")]
    public async Task<IActionResult> SearchArtistDiscography(
        [FromQuery] string name,
        [FromQuery] string platform = "youtube",
        [FromQuery] int limit = 200)
    {
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "name обов'язковий" });

        var searchQuery = $"{name}";
        var prefix = platform == "soundcloud" ? "scsearch" : "ytsearch";
        var searchArg = $"\"{prefix}{limit}:{searchQuery}\"";

        var args = new[]
        {
            "--dump-json",
            "--flat-playlist",
            "--no-warnings",
            searchArg
        };

        try
        {
            var result = await RunYtDlp(args);
            if (!result.Success || string.IsNullOrWhiteSpace(result.Output))
                return Ok(new { artist = name, tracks = new List<object>() });

            var items = new List<object>();
            foreach (var line in result.Output.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                try
                {
                    using var doc = JsonDocument.Parse(line);
                    var root = doc.RootElement;

                    var id      = root.TryGetProperty("id",          out var idP)  ? idP.GetString()  : null;
                    var title   = root.TryGetProperty("title",       out var ttP)  ? ttP.GetString()  : "Unknown";
                    var artist  = root.TryGetProperty("uploader",    out var upP)  ? upP.GetString()
                                : root.TryGetProperty("artist",      out var arP)  ? arP.GetString()  : null;
                    var album   = root.TryGetProperty("album",       out var alP)  ? alP.GetString()  : null;
                    int? dur    = null;
                    if (root.TryGetProperty("duration", out var durP) && durP.ValueKind == JsonValueKind.Number)
                        dur = (int)durP.GetDouble();

                    // Get the best thumbnail: prefer the last (usually highest-res) entry in thumbnails array
                    string? thumb = null;
                    if (root.TryGetProperty("thumbnails", out var thumbsArr) && thumbsArr.ValueKind == JsonValueKind.Array)
                    {
                        var thumbList = thumbsArr.EnumerateArray().ToList();
                        thumb = thumbList.LastOrDefault().TryGetProperty("url", out var tu) ? tu.GetString() : null;
                    }
                    if (thumb == null && root.TryGetProperty("thumbnail", out var thP))
                        thumb = thP.GetString();

                    var webpage = root.TryGetProperty("webpage_url", out var wpP)  ? wpP.GetString()
                                : root.TryGetProperty("url",         out var urlP) ? urlP.GetString() : null;

                    // Skip channels, playlists, and non-video entries (ie_key should be "Youtube" or "Soundcloud")
                    var ieKey = root.TryGetProperty("ie_key", out var ieP) ? ieP.GetString() : null;
                    if (ieKey != null && ieKey != "Youtube" && ieKey != "Soundcloud") continue;

                    if (id == null || webpage == null) continue;
                    // Must be a watchable video URL (not a channel/playlist URL)
                    if (platform == "youtube" && !webpage.Contains("/watch?v=")) continue;

                    items.Add(new {
                        id, title, artist, album, duration = dur,
                        thumbnail = thumb,
                        webpage_url = webpage,
                        source = platform,
                    });
                }
                catch { /* skip malformed */ }
            }

            // Try to determine best matching artist name and thumbnail from results
            var artistName = items.Cast<dynamic>().FirstOrDefault()?.artist ?? name;
            var artistThumb = items.Cast<dynamic>().FirstOrDefault()?.thumbnail;

            return Ok(new {
                artist = name,
                platform,
                total = items.Count,
                tracks = items,
            });
        }
        catch (System.ComponentModel.Win32Exception)
        {
            return StatusCode(503, new { message = "yt-dlp не встановлено. Встановіть: winget install yt-dlp" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Artist search failed for {Name}", name);
            return StatusCode(500, new { message = ex.Message });
        }
    }

    private static async Task<int> GetDurationAsync(string filePath)
    {
        try
        {
            var psi = new ProcessStartInfo("ffprobe",
                $"-v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \"{filePath}\"")
            {
                RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true
            };
            using var p = Process.Start(psi)!;
            var output = await p.StandardOutput.ReadToEndAsync();
            await p.WaitForExitAsync();
            return (int)Math.Round(double.Parse(output.Trim(), System.Globalization.CultureInfo.InvariantCulture));
        }
        catch { return 0; }
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

        using var process = new Process { StartInfo = psi };
        process.Start();

        var outputTask = process.StandardOutput.ReadToEndAsync();
        var errorTask = process.StandardError.ReadToEndAsync();

        await process.WaitForExitAsync();

        var output = await outputTask;
        var error = await errorTask;

        return (process.ExitCode == 0, output, error);
    }
}

public record DownloadRequestDto(
    string Url,
    string? Title,
    string? ArtistName,
    int? ArtistId,
    int? AlbumId,
    string? Genre,
    string? CoverUrl
);
