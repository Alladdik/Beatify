using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BeatifyServer.Data;
using BeatifyServer.DTOs;

namespace BeatifyServer.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SearchController : ControllerBase
{
    private readonly AppDbContext _db;

    public SearchController(AppDbContext db) => _db = db;

    private int? GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier);
        return claim != null && int.TryParse(claim.Value, out var id) ? id : null;
    }

    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q)) return Ok(new SearchResultDto([], [], [], []));

        var lower = q.ToLower().Trim();
        var userId = GetUserId();

        // User preferences: liked track IDs & top genres
        HashSet<int> likedTrackIds = new();
        HashSet<string> favoriteGenres = new();
        HashSet<int> favoriteArtistIds = new();

        if (userId.HasValue)
        {
            likedTrackIds = (await _db.LikedTracks
                .Where(l => l.UserId == userId.Value)
                .Select(l => l.TrackId)
                .ToListAsync()).ToHashSet();

            var topHistory = await _db.ListeningHistory
                .Where(h => h.UserId == userId.Value)
                .Include(h => h.Track)
                .OrderByDescending(h => h.PlayedAt)
                .Take(50)
                .ToListAsync();

            foreach (var h in topHistory)
            {
                if (h.Track != null)
                {
                    if (h.Track.ArtistId.HasValue) favoriteArtistIds.Add(h.Track.ArtistId.Value);
                    if (!string.IsNullOrWhiteSpace(h.Track.Genre)) favoriteGenres.Add(h.Track.Genre.ToLower());
                }
            }
        }

        // Fetch candidate matching tracks
        var rawTracks = await _db.Tracks
            .Include(t => t.Artist)
            .Include(t => t.Album)
            .Where(t => t.Title.ToLower().Contains(lower) || 
                        (t.Artist != null && t.Artist.Name.ToLower().Contains(lower)) ||
                        (t.Album != null && t.Album.Title.ToLower().Contains(lower)) ||
                        (!string.IsNullOrEmpty(t.Genre) && t.Genre.ToLower().Contains(lower)))
            .Take(50)
            .ToListAsync();

        // Calculate recommendation/affinity score
        var scoredTracks = rawTracks.Select(t =>
        {
            double score = 100.0;
            var titleLower = t.Title.ToLower();
            var artistLower = t.Artist?.Name.ToLower() ?? "";

            // Title exact or prefix match boost
            if (titleLower == lower) score += 100;
            else if (titleLower.StartsWith(lower)) score += 50;

            // Artist match boost
            if (artistLower.Contains(lower)) score += 30;

            // User preference boosts
            bool isLiked = likedTrackIds.Contains(t.Id);
            if (isLiked) score += 45;
            if (t.ArtistId.HasValue && favoriteArtistIds.Contains(t.ArtistId.Value)) score += 35;
            if (!string.IsNullOrEmpty(t.Genre) && favoriteGenres.Contains(t.Genre.ToLower())) score += 25;

            // Play count boost
            score += Math.Min(50, t.PlayCount * 0.5);

            return new
            {
                Track = t,
                Score = score,
                IsLiked = isLiked
            };
        })
        .OrderByDescending(x => x.Score)
        .Take(15)
        .Select(x => new TrackDto(
            x.Track.Id,
            x.Track.Title,
            x.Track.ArtistId,
            x.Track.Artist != null ? x.Track.Artist.Name : "Unknown Artist",
            x.Track.AlbumId,
            x.Track.Album != null ? x.Track.Album.Title : null,
            x.Track.CoverPath,
            x.Track.Duration,
            x.Track.Genre,
            x.Track.PlayCount,
            x.Track.IsExplicit,
            x.IsLiked,
            x.Track.CreatedAt,
            x.Track.Lyrics,
            x.Track.MediaType
        ))
        .ToList();

        var artists = await _db.Artists
            .Include(a => a.Tracks)
            .Where(a => a.Name.ToLower().Contains(lower) || (!string.IsNullOrEmpty(a.Genre) && a.Genre.ToLower().Contains(lower)))
            .Take(6)
            .Select(a => new ArtistDto(a.Id, a.Name, a.ImagePath, a.Bio, a.Genre, a.MonthlyListeners, a.Tracks.Count))
            .ToListAsync();

        var albums = await _db.Albums
            .Include(a => a.Artist).Include(a => a.Tracks)
            .Where(a => a.Title.ToLower().Contains(lower) || (a.Artist != null && a.Artist.Name.ToLower().Contains(lower)))
            .Take(6)
            .Select(a => new AlbumDto(a.Id, a.Title, a.ArtistId, a.Artist!.Name, a.CoverPath, a.Year, a.Genre, a.Tracks.Count))
            .ToListAsync();

        var playlists = await _db.Playlists
            .Include(p => p.User).Include(p => p.PlaylistTracks)
            .Where(p => p.IsPublic && p.Title.ToLower().Contains(lower))
            .Take(5)
            .Select(p => new PlaylistDto(p.Id, p.UserId, p.User!.Name, p.Title, p.Description, p.CoverPath, p.IsPublic, p.IsCollaborative, p.PlaylistTracks.Count, p.CreatedAt))
            .ToListAsync();

        return Ok(new SearchResultDto(scoredTracks, artists, albums, playlists));
    }

    // GET /api/search/recommendations
    // Personalized smart recommendations based on preferences and popularity
    [HttpGet("recommendations")]
    public async Task<IActionResult> GetRecommendations([FromQuery] int limit = 12)
    {
        var userId = GetUserId();
        HashSet<int> likedTrackIds = new();
        List<int> favArtistIds = new();

        if (userId.HasValue)
        {
            likedTrackIds = (await _db.LikedTracks
                .Where(l => l.UserId == userId.Value)
                .Select(l => l.TrackId)
                .ToListAsync()).ToHashSet();

            favArtistIds = await _db.ListeningHistory
                .Where(h => h.UserId == userId.Value && h.Track.ArtistId.HasValue)
                .Select(h => h.Track.ArtistId!.Value)
                .Distinct()
                .Take(5)
                .ToListAsync();
        }

        var query = _db.Tracks
            .Include(t => t.Artist)
            .Include(t => t.Album)
            .AsQueryable();

        if (favArtistIds.Count > 0)
        {
            query = query.OrderByDescending(t => t.ArtistId.HasValue && favArtistIds.Contains(t.ArtistId.Value) ? 1 : 0)
                         .ThenByDescending(t => t.PlayCount);
        }
        else
        {
            query = query.OrderByDescending(t => t.PlayCount);
        }

        var recTracks = await query.Take(limit)
            .Select(t => new TrackDto(
                t.Id,
                t.Title,
                t.ArtistId,
                t.Artist != null ? t.Artist.Name : "Unknown Artist",
                t.AlbumId,
                t.Album != null ? t.Album.Title : null,
                t.CoverPath,
                t.Duration,
                t.Genre,
                t.PlayCount,
                t.IsExplicit,
                likedTrackIds.Contains(t.Id),
                t.CreatedAt,
                t.Lyrics,
                t.MediaType
            ))
            .ToListAsync();

        return Ok(recTracks);
    }
}
