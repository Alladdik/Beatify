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

    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q)) return Ok(new SearchResultDto([], [], [], []));

        var lower = q.ToLower();

        var tracks = await _db.Tracks
            .Include(t => t.Artist).Include(t => t.Album)
            .Where(t => t.Title.ToLower().Contains(lower) || t.Artist!.Name.ToLower().Contains(lower))
            .Take(10)
            .Select(t => new TrackDto(t.Id, t.Title, t.ArtistId, t.Artist!.Name, t.AlbumId,
                t.Album != null ? t.Album.Title : null, t.CoverPath, t.Duration, t.Genre, t.PlayCount, t.IsExplicit, false, t.CreatedAt, t.Lyrics, t.MediaType))
            .ToListAsync();

        var artists = await _db.Artists
            .Include(a => a.Tracks)
            .Where(a => a.Name.ToLower().Contains(lower))
            .Take(5)
            .Select(a => new ArtistDto(a.Id, a.Name, a.ImagePath, a.Bio, a.Genre, a.MonthlyListeners, a.Tracks.Count))
            .ToListAsync();

        var albums = await _db.Albums
            .Include(a => a.Artist).Include(a => a.Tracks)
            .Where(a => a.Title.ToLower().Contains(lower) || a.Artist!.Name.ToLower().Contains(lower))
            .Take(5)
            .Select(a => new AlbumDto(a.Id, a.Title, a.ArtistId, a.Artist!.Name, a.CoverPath, a.Year, a.Genre, a.Tracks.Count))
            .ToListAsync();

        var playlists = await _db.Playlists
            .Include(p => p.User).Include(p => p.PlaylistTracks)
            .Where(p => p.IsPublic && p.Title.ToLower().Contains(lower))
            .Take(5)
            .Select(p => new PlaylistDto(p.Id, p.UserId, p.User!.Name, p.Title, p.Description, p.CoverPath, p.IsPublic, p.PlaylistTracks.Count, p.CreatedAt))
            .ToListAsync();

        return Ok(new SearchResultDto(tracks, artists, albums, playlists));
    }
}
