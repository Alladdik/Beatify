using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BeatifyServer.Data;
using BeatifyServer.DTOs;
using BeatifyServer.Models;
using BeatifyServer.Services;

namespace BeatifyServer.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TracksController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly LyricsService _lyrics;
    private readonly RecommendationService _rec;

    public TracksController(AppDbContext db, IWebHostEnvironment env, LyricsService lyrics, RecommendationService rec)
    {
        _db = db;
        _env = env;
        _lyrics = lyrics;
        _rec = rec;
    }

    // Supported formats
    private static readonly HashSet<string> AudioExts = new(StringComparer.OrdinalIgnoreCase)
        { ".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma", ".opus", ".aiff", ".webm" };

    private static readonly HashSet<string> VideoExts = new(StringComparer.OrdinalIgnoreCase)
        { ".mp4", ".mkv", ".mov", ".avi", ".m4v" };

    private static string GetMediaType(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLower();
        if (VideoExts.Contains(ext)) return "video";
        return "audio";
    }

    private static string GetContentType(string ext) => ext.ToLower() switch
    {
        ".mp3"  => "audio/mpeg",
        ".wav"  => "audio/wav",
        ".flac" => "audio/flac",
        ".aac"  => "audio/aac",
        ".ogg"  => "audio/ogg",
        ".m4a"  => "audio/mp4",
        ".opus" => "audio/opus",
        ".wma"  => "audio/x-ms-wma",
        ".mp4"  => "video/mp4",
        ".webm" => "audio/webm",
        ".mkv"  => "video/x-matroska",
        ".mov"  => "video/quicktime",
        ".avi"  => "video/x-msvideo",
        ".m4v"  => "video/mp4",
        _       => "application/octet-stream"
    };

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 500);
        var userId = GetUserId();
        var likedIds = userId > 0
            ? await _db.LikedTracks.Where(lt => lt.UserId == userId).Select(lt => lt.TrackId).ToListAsync()
            : new List<int>();

        var tracks = await _db.Tracks
            .Include(t => t.Artist).Include(t => t.Album)
            .OrderByDescending(t => t.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .ToListAsync();

        return Ok(tracks.Select(t => MapTrack(t, likedIds)));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var userId = GetUserId();
        var likedIds = userId > 0
            ? await _db.LikedTracks.Where(lt => lt.UserId == userId).Select(lt => lt.TrackId).ToListAsync()
            : new List<int>();

        var track = await _db.Tracks.Include(t => t.Artist).Include(t => t.Album).FirstOrDefaultAsync(t => t.Id == id);
        if (track == null) return NotFound();
        return Ok(MapTrack(track, likedIds));
    }

    [HttpGet("{id}/stream")]
    public async Task<IActionResult> Stream(int id)
    {
        var track = await _db.Tracks.FindAsync(id);
        if (track == null) return NotFound();

        var folder = track.MediaType == "video" ? "videos" : "tracks";
        var filePath = Path.Combine(_env.WebRootPath, "uploads", folder, track.FilePath);
        if (!System.IO.File.Exists(filePath))
            return NotFound(new { message = "Файл не знайдено на сервері" });

        // WebM/Opus has no iPhone support: serve a cached AAC copy instead (audio only, the original stays as is)
        if (track.MediaType != "video" && AudioCompat.NeedsConversion(filePath))
            filePath = await AudioCompat.EnsureAacAsync(filePath, Path.Combine(_env.WebRootPath, "uploads", "aac"), HttpContext.RequestAborted);

        var ext = Path.GetExtension(filePath);
        var contentType = GetContentType(ext);

        Response.Headers.Append("Accept-Ranges", "bytes");
        var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        return File(fileStream, contentType, enableRangeProcessing: true);
    }

    [HttpPost]
    [Authorize(Roles = "admin")]
    [RequestSizeLimit(536_870_912)]
    [RequestFormLimits(MultipartBodyLengthLimit = 536_870_912)]
    public async Task<IActionResult> Upload([FromForm] CreateTrackDto dto, IFormFile mediaFile, IFormFile? coverFile)
    {
        var ext = Path.GetExtension(mediaFile.FileName).ToLower();
        if (!AudioExts.Contains(ext) && !VideoExts.Contains(ext))
            return BadRequest(new { message = $"Формат {ext} не підтримується" });

        var mediaType = GetMediaType(mediaFile.FileName);
        var folder = mediaType == "video" ? "videos" : "tracks";
        var uploadsPath = Path.Combine(_env.WebRootPath, "uploads", folder);
        Directory.CreateDirectory(uploadsPath);

        var mediaFileName = $"{Guid.NewGuid()}{ext}";
        var mediaPath = Path.Combine(uploadsPath, mediaFileName);
        using (var stream = new FileStream(mediaPath, FileMode.Create))
            await mediaFile.CopyToAsync(stream);

        string? coverPath = null;
        if (coverFile != null)
        {
            var coversPath = Path.Combine(_env.WebRootPath, "uploads", "covers");
            Directory.CreateDirectory(coversPath);
            var coverFileName = $"{Guid.NewGuid()}{Path.GetExtension(coverFile.FileName)}";
            using (var stream = new FileStream(Path.Combine(coversPath, coverFileName), FileMode.Create))
                await coverFile.CopyToAsync(stream);
            coverPath = coverFileName;
        }

        var track = new Track
        {
            Title = dto.Title,
            ArtistId = dto.ArtistId,
            AlbumId = dto.AlbumId,
            FilePath = mediaFileName,
            CoverPath = coverPath,
            Duration = dto.Duration,
            Genre = dto.Genre,
            IsExplicit = dto.IsExplicit,
            Lyrics = dto.Lyrics,
            MediaType = mediaType
        };

        _db.Tracks.Add(track);
        await _db.SaveChangesAsync();
        await _db.Entry(track).Reference(t => t.Artist).LoadAsync();
        await _db.Entry(track).Reference(t => t.Album).LoadAsync();

        return CreatedAtAction(nameof(GetById), new { id = track.Id }, MapTrack(track, new List<int>()));
    }

    // POST /api/tracks/mine — an artist releases their own track (also used by Studio → «Опублікувати»)
    [HttpPost("mine")]
    [Authorize(Policy = "CanUpload")]
    [RequestSizeLimit(157_286_400)]
    [RequestFormLimits(MultipartBodyLengthLimit = 157_286_400)]
    public async Task<IActionResult> UploadMine([FromForm] CreateTrackDto dto, IFormFile mediaFile, IFormFile? coverFile)
    {
        var userId = GetUserId();
        var artist = await _db.Artists.FirstOrDefaultAsync(a => a.UserId == userId);
        if (artist == null)
        {
            var owner = await _db.Users.FindAsync(userId);
            if (owner == null) return Unauthorized();
            artist = new Artist { Name = owner.Name, UserId = userId, Bio = "Новий виконавець на Beatify", Genre = "Various" };
            _db.Artists.Add(artist);
            await _db.SaveChangesAsync();
        }

        var title = (dto.Title ?? "").Trim();
        if (title.Length == 0 || title.Length > 200) return BadRequest(new { message = "Вкажіть назву треку (до 200 символів)" });

        var ext = Path.GetExtension(mediaFile.FileName).ToLower();
        if (!AudioExts.Contains(ext)) return BadRequest(new { message = $"Формат {ext} не підтримується. Завантажте аудіо: mp3, wav, flac, m4a, ogg, opus" });

        string? coverName = null;
        if (coverFile != null)
        {
            var cext = Path.GetExtension(coverFile.FileName).ToLower();
            if (cext is not (".jpg" or ".jpeg" or ".png" or ".webp")) return BadRequest(new { message = "Обкладинка має бути jpg, png або webp" });
            if (coverFile.Length > 8 * 1024 * 1024) return BadRequest(new { message = "Обкладинка завелика (максимум 8 МБ)" });
        }

        var uploadsPath = Path.Combine(_env.WebRootPath, "uploads", "tracks");
        Directory.CreateDirectory(uploadsPath);
        var mediaName = $"{Guid.NewGuid()}{ext}";
        await using (var stream = new FileStream(Path.Combine(uploadsPath, mediaName), FileMode.Create))
            await mediaFile.CopyToAsync(stream);

        if (coverFile != null)
        {
            var coversPath = Path.Combine(_env.WebRootPath, "uploads", "covers");
            Directory.CreateDirectory(coversPath);
            coverName = $"{Guid.NewGuid()}{Path.GetExtension(coverFile.FileName).ToLower()}";
            await using var cs = new FileStream(Path.Combine(coversPath, coverName), FileMode.Create);
            await coverFile.CopyToAsync(cs);
        }

        var track = new Track
        {
            Title = title,
            ArtistId = artist.Id,
            AlbumId = null,
            FilePath = mediaName,
            CoverPath = coverName,
            Duration = Math.Clamp(dto.Duration, 0, 60 * 60 * 6),
            Genre = string.IsNullOrWhiteSpace(dto.Genre) ? null : dto.Genre.Trim(),
            IsExplicit = dto.IsExplicit,
            Lyrics = string.IsNullOrWhiteSpace(dto.Lyrics) ? null : dto.Lyrics,
            MediaType = "audio",
        };
        _db.Tracks.Add(track);
        await _db.SaveChangesAsync();
        await _db.Entry(track).Reference(t => t.Artist).LoadAsync();
        return Ok(MapTrack(track, new List<int>()));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Update(int id, [FromForm] UpdateTrackDto dto, IFormFile? coverFile)
    {
        var track = await _db.Tracks
            .Include(t => t.Artist).Include(t => t.Album)
            .FirstOrDefaultAsync(t => t.Id == id);
        if (track == null) return NotFound();

        if (!string.IsNullOrWhiteSpace(dto.Title)) track.Title = dto.Title;
        if (dto.ArtistId is > 0) track.ArtistId = dto.ArtistId.Value;
        track.AlbumId = dto.AlbumId > 0 ? dto.AlbumId : null;
        if (dto.Genre != null) track.Genre = dto.Genre;
        track.IsExplicit = dto.IsExplicit;
        if (dto.Lyrics != null) track.Lyrics = dto.Lyrics;

        if (coverFile != null)
        {
            var coversPath = Path.Combine(_env.WebRootPath, "uploads", "covers");
            Directory.CreateDirectory(coversPath);
            var coverFileName = $"{Guid.NewGuid()}{Path.GetExtension(coverFile.FileName)}";
            await using var stream = new FileStream(Path.Combine(coversPath, coverFileName), FileMode.Create);
            await coverFile.CopyToAsync(stream);
            track.CoverPath = coverFileName;
        }

        await _db.SaveChangesAsync();
        await _db.Entry(track).Reference(t => t.Artist).LoadAsync();
        if (track.AlbumId.HasValue) await _db.Entry(track).Reference(t => t.Album).LoadAsync();

        return Ok(MapTrack(track, new List<int>()));
    }

    [HttpGet("{id}/recommendations")]
    public async Task<IActionResult> GetRecommendations(int id, [FromQuery] int limit = 6)
    {
        var uid = GetUserId();
        return Ok(await _rec.SimilarAsync(id, uid > 0 ? uid : null, Math.Clamp(limit, 1, 50)));
    }

    // Tracks whose lyrics we could not find — don't hammer the external services for them on every play
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<int, DateTime> LyricsMisses = new();

    // GET /api/tracks/{id}/lyrics — stored lyrics, or look them up once and keep them
    [HttpGet("{id}/lyrics")]
    public async Task<IActionResult> GetLyrics(int id)
    {
        var track = await _db.Tracks.Include(t => t.Artist).FirstOrDefaultAsync(t => t.Id == id);
        if (track == null) return NotFound();
        if (!string.IsNullOrWhiteSpace(track.Lyrics)) return Ok(new { lyrics = track.Lyrics, found = true, cached = true });
        if (LyricsMisses.TryGetValue(id, out var missedAt) && DateTime.UtcNow - missedAt < TimeSpan.FromHours(6))
            return Ok(new { lyrics = (string?)null, found = false });

        var r = await _lyrics.FindAsync(track.Artist?.Name ?? "", track.Title, track.Duration, HttpContext.RequestAborted);
        if (r == null) { LyricsMisses[id] = DateTime.UtcNow; return Ok(new { lyrics = (string?)null, found = false }); }
        track.Lyrics = r.Text;
        await _db.SaveChangesAsync();
        return Ok(new { lyrics = r.Text, found = true, synced = r.Synced, source = r.Source });
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(int id)
    {
        var track = await _db.Tracks.FindAsync(id);
        if (track == null) return NotFound();

        var folder = track.MediaType == "video" ? "videos" : "tracks";
        var filePath = Path.Combine(_env.WebRootPath, "uploads", folder, track.FilePath);
        if (System.IO.File.Exists(filePath)) System.IO.File.Delete(filePath);

        _db.Tracks.Remove(track);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("stats")]
    [Authorize]
    public async Task<IActionResult> GetStats()
    {
        var userId = GetUserId();
        var cutoff = DateTime.UtcNow.Date.AddDays(-29); // inclusive last 30 days

        // Daily plays: group by date for the last 30 days (current user only)
        var dailyPlays = await _db.ListeningHistory
            .Where(h => h.UserId == userId && h.PlayedAt >= cutoff)
            .GroupBy(h => h.PlayedAt.Date)
            .Select(g => new { date = g.Key, count = g.Count() })
            .OrderBy(x => x.date)
            .ToListAsync();

        // Top 10 tracks by play count from ListeningHistory (current user only)
        var topTrackIds = await _db.ListeningHistory
            .Where(h => h.UserId == userId)
            .GroupBy(h => h.TrackId)
            .Select(g => new { trackId = g.Key, playCount = g.Count() })
            .OrderByDescending(x => x.playCount)
            .Take(10)
            .ToListAsync();

        var topTrackIdList = topTrackIds.Select(x => x.trackId).ToList();
        var topTrackModels = await _db.Tracks
            .Include(t => t.Artist)
            .Where(t => topTrackIdList.Contains(t.Id))
            .ToListAsync();

        var topTracks = topTrackIds
            .Select(x =>
            {
                var t = topTrackModels.FirstOrDefault(m => m.Id == x.trackId);
                if (t == null) return null;
                return new
                {
                    id        = t.Id,
                    title     = t.Title,
                    artistName = t.Artist?.Name ?? "",
                    coverPath = t.CoverPath,
                    playCount = x.playCount
                };
            })
            .Where(x => x != null)
            .ToList();

        // Top 10 artists by play count from ListeningHistory (current user only)
        var topArtistData = await _db.ListeningHistory
            .Where(h => h.UserId == userId)
            .Join(_db.Tracks, h => h.TrackId, t => t.Id, (h, t) => new { t.ArtistId })
            .GroupBy(x => x.ArtistId)
            .Select(g => new { artistId = g.Key, playCount = g.Count() })
            .OrderByDescending(x => x.playCount)
            .Take(10)
            .ToListAsync();

        var topArtistIdList = topArtistData.Select(x => x.artistId).ToList();
        var topArtistModels = await _db.Artists
            .Where(a => topArtistIdList.Contains(a.Id))
            .ToListAsync();

        var topArtists = topArtistData
            .Select(x =>
            {
                var a = topArtistModels.FirstOrDefault(m => m.Id == x.artistId);
                if (a == null) return null;
                return new
                {
                    id        = a.Id,
                    name      = a.Name,
                    imagePath = a.ImagePath,
                    playCount = x.playCount
                };
            })
            .Where(x => x != null)
            .ToList();

        var hourly = await _db.ListeningHistory.Where(h => h.UserId == userId)
            .GroupBy(h => h.PlayedAt.Hour).Select(g => new { hour = g.Key, count = g.Count() }).ToListAsync();
        var seconds = await _db.ListeningHistory.Where(h => h.UserId == userId).SumAsync(h => (int?)h.Track!.Duration) ?? 0;
        var totalPlays   = await _db.ListeningHistory.Where(h => h.UserId == userId).CountAsync();
        var uniqueTracks = await _db.ListeningHistory.Where(h => h.UserId == userId).Select(h => h.TrackId).Distinct().CountAsync();

        return Ok(new
        {
            dailyPlays = dailyPlays.Select(d => new
            {
                date  = d.date.ToString("yyyy-MM-dd"),
                count = d.count
            }),
            topTracks,
            topArtists,
            totalPlays,
            uniqueTracks,
            minutes = seconds / 60,
            hourlyUtc = Enumerable.Range(0, 24).Select(hr => hourly.FirstOrDefault(x => x.hour == hr)?.count ?? 0).ToArray()
        });
    }

    [HttpGet("trending")]
    public async Task<IActionResult> GetTrending()
    {
        var userId = GetUserId();
        var likedIds = userId > 0
            ? await _db.LikedTracks.Where(lt => lt.UserId == userId).Select(lt => lt.TrackId).ToListAsync()
            : new List<int>();

        var tracks = await _db.Tracks.Include(t => t.Artist).Include(t => t.Album)
            .OrderByDescending(t => t.PlayCount).Take(10).ToListAsync();
        return Ok(tracks.Select(t => MapTrack(t, likedIds)));
    }

    [HttpGet("new-releases")]
    public async Task<IActionResult> GetNewReleases()
    {
        var userId = GetUserId();
        var likedIds = userId > 0
            ? await _db.LikedTracks.Where(lt => lt.UserId == userId).Select(lt => lt.TrackId).ToListAsync()
            : new List<int>();

        var tracks = await _db.Tracks.Include(t => t.Artist).Include(t => t.Album)
            .OrderByDescending(t => t.CreatedAt).Take(10).ToListAsync();
        return Ok(tracks.Select(t => MapTrack(t, likedIds)));
    }

    // The client calls this once per listen, after ~30 s (or half the track) — not on every range request.
    [HttpPost("{id}/log-play")]
    [AllowAnonymous]
    public async Task<IActionResult> LogPlay(int id, [FromQuery] int? seconds)
    {
        var track = await _db.Tracks.FindAsync(id);
        if (track == null) return NotFound();
        track.PlayCount++;
        var userId = GetUserId();
        if (userId > 0)
        {
            // ignore accidental double posts within 20 s
            var recent = await _db.ListeningHistory.AnyAsync(h => h.UserId == userId && h.TrackId == id && h.PlayedAt > DateTime.UtcNow.AddSeconds(-20));
            if (!recent) _db.ListeningHistory.Add(new ListeningHistory { UserId = userId, TrackId = id });
        }
        await _db.SaveChangesAsync();
        return Ok();
    }

    [HttpGet("history")]
    [Authorize]
    public async Task<IActionResult> GetHistory([FromQuery] int limit = 50, [FromQuery] int offset = 0)
    {
        var userId = GetUserId();
        var likedIds = await _db.LikedTracks
            .Where(lt => lt.UserId == userId)
            .Select(lt => lt.TrackId)
            .ToListAsync();

        var total = await _db.ListeningHistory.CountAsync(h => h.UserId == userId);

        var history = await _db.ListeningHistory
            .Where(h => h.UserId == userId)
            .OrderByDescending(h => h.PlayedAt)
            .Skip(offset)
            .Take(limit)
            .ToListAsync();

        var trackIds = history.Select(h => h.TrackId).Distinct().ToList();
        var tracks = await _db.Tracks
            .Include(t => t.Artist).Include(t => t.Album)
            .Where(t => trackIds.Contains(t.Id))
            .ToListAsync();

        var result = history
            .Select(h => new
            {
                historyId = h.Id,
                playedAt  = h.PlayedAt,
                track     = tracks.FirstOrDefault(t => t.Id == h.TrackId) is Track t ? MapTrack(t, likedIds) : null
            })
            .Where(x => x.track != null);

        return Ok(new { total, offset, limit, items = result });
    }

    [HttpPost("{id}/like")]
    [Authorize]
    public async Task<IActionResult> Like(int id)
    {
        var userId = GetUserId();
        var existing = await _db.LikedTracks.FirstOrDefaultAsync(lt => lt.UserId == userId && lt.TrackId == id);
        if (existing != null)
        {
            _db.LikedTracks.Remove(existing);
            await _db.SaveChangesAsync();
            return Ok(new { liked = false });
        }
        _db.LikedTracks.Add(new LikedTrack { UserId = userId, TrackId = id });
        await _db.SaveChangesAsync();
        return Ok(new { liked = true });
    }

    [HttpGet("liked")]
    [Authorize]
    public async Task<IActionResult> GetLiked()
    {
        var userId = GetUserId();
        var likes = await _db.LikedTracks.Where(l => l.UserId == userId).OrderByDescending(l => l.LikedAt)
            .Select(l => l.TrackId).ToListAsync();
        var tracks = await _db.Tracks.Include(t => t.Artist).Include(t => t.Album)
            .Where(t => likes.Contains(t.Id)).ToListAsync();
        var order = likes.Select((id, i) => (id, i)).ToDictionary(x => x.id, x => x.i);
        var likedSet = likes.ToList();
        return Ok(tracks.OrderBy(t => order[t.Id]).Select(t => MapTrack(t, likedSet)));
    }

    [HttpGet("liked/ids")]
    [Authorize]
    public async Task<IActionResult> GetLikedIds()
    {
        var userId = GetUserId();
        return Ok(await _db.LikedTracks.Where(l => l.UserId == userId).Select(l => l.TrackId).ToListAsync());
    }

    private int GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier);
        return claim != null ? int.Parse(claim.Value) : 0;
    }

    private static TrackDto MapTrack(Track t, List<int> likedIds) =>
        new(t.Id, t.Title, t.ArtistId, t.Artist?.Name ?? "-",
            t.AlbumId, t.Album?.Title,
            t.CoverPath, t.Duration, t.Genre, t.PlayCount, t.IsExplicit,
            likedIds.Contains(t.Id), t.CreatedAt, null, t.MediaType);
}
