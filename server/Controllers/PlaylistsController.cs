using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BeatifyServer.Data;
using BeatifyServer.DTOs;
using BeatifyServer.Models;

namespace BeatifyServer.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PlaylistsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;

    public PlaylistsController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    private int GetUserId() => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

    /// <summary>Playlist cards with up to four distinct covers of their tracks (a playlist has no picture of its own).</summary>
    internal static async Task<List<PlaylistDto>> CardsAsync(IQueryable<Playlist> query)
    {
        var rows = await query.Select(p => new
        {
            p.Id, p.UserId, UserName = p.User!.Name, p.Title, p.Description, p.CoverPath, p.IsPublic, p.IsCollaborative,
            Count = p.PlaylistTracks.Count, p.CreatedAt,
            Covers = p.PlaylistTracks.Where(pt => pt.Track!.CoverPath != null)
                .OrderBy(pt => pt.Order).ThenBy(pt => pt.Id).Select(pt => pt.Track!.CoverPath!).Take(8).ToList(),
        }).ToListAsync();
        return rows.Select(r => new PlaylistDto(r.Id, r.UserId, r.UserName, r.Title, r.Description, r.CoverPath, r.IsPublic, r.IsCollaborative,
            r.Count, r.CreatedAt, r.Covers.Distinct().Take(4).ToList())).ToList();
    }

    // Who may change the track list: the owner, or anyone signed in when the playlist is shared
    private Task<Playlist?> EditablePlaylist(int id, int userId) =>
        _db.Playlists.FirstOrDefaultAsync(p => p.Id == id && (p.UserId == userId || (p.IsCollaborative && p.IsPublic)));

    [HttpGet]
    public async Task<IActionResult> GetMyPlaylists()
    {
        var userId = GetUserId();
        // own playlists + collaborative playlists that are shared (public) with everyone
        var playlists = await CardsAsync(_db.Playlists
            .Where(p => p.UserId == userId || (p.IsCollaborative && p.IsPublic))
            .OrderByDescending(p => p.CreatedAt));
        return Ok(playlists);
    }

    [HttpGet("public")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPublicPlaylists()
    {
        var playlists = await CardsAsync(_db.Playlists.Where(p => p.IsPublic).OrderByDescending(p => p.CreatedAt).Take(50));
        return Ok(playlists);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var userId = GetUserId();
        var card = (await CardsAsync(_db.Playlists.Where(p => p.Id == id && (p.UserId == userId || p.IsPublic)))).FirstOrDefault();
        if (card == null) return NotFound();
        return Ok(card);
    }

    [HttpGet("{id}/tracks")]
    public async Task<IActionResult> GetPlaylistTracks(int id)
    {
        var userId = GetUserId();
        var visible = await _db.Playlists.AnyAsync(p => p.Id == id && (p.UserId == userId || p.IsPublic));
        if (!visible) return NotFound();
        var likedIds = await _db.LikedTracks.Where(lt => lt.UserId == userId).Select(lt => lt.TrackId).ToListAsync();

        var tracks = await _db.PlaylistTracks
            .Include(pt => pt.Track).ThenInclude(t => t!.Artist)
            .Include(pt => pt.Track).ThenInclude(t => t!.Album)
            .Where(pt => pt.PlaylistId == id)
            .OrderBy(pt => pt.Order).ThenBy(pt => pt.Id)
            .Select(pt => new TrackDto(
                pt.Track!.Id, pt.Track.Title,
                pt.Track.ArtistId, pt.Track.Artist != null ? pt.Track.Artist.Name : "—",
                pt.Track.AlbumId, pt.Track.Album != null ? pt.Track.Album.Title : null,
                pt.Track.CoverPath, pt.Track.Duration,
                pt.Track.Genre, pt.Track.PlayCount, pt.Track.IsExplicit,
                likedIds.Contains(pt.Track.Id), pt.Track.CreatedAt, null, pt.Track.MediaType))
            .ToListAsync();
        return Ok(tracks);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePlaylistDto dto)
    {
        var userId = GetUserId();
        var title = (dto.Title ?? "").Trim();
        if (title.Length == 0 || title.Length > 120) return BadRequest(new { message = "Назва плейліста від 1 до 120 символів" });
        var playlist = new Playlist
        {
            UserId = userId,
            Title = title,
            Description = string.IsNullOrWhiteSpace(dto.Description) ? null : dto.Description.Trim(),
            IsCollaborative = dto.IsCollaborative,
            // a shared playlist is by definition visible to everyone it is shared with
            IsPublic = dto.IsPublic || dto.IsCollaborative,
        };
        _db.Playlists.Add(playlist);
        await _db.SaveChangesAsync();

        var user = await _db.Users.FindAsync(userId);
        return CreatedAtAction(nameof(GetById), new { id = playlist.Id },
            new PlaylistDto(playlist.Id, userId, user?.Name ?? "", playlist.Title, playlist.Description, playlist.CoverPath, playlist.IsPublic, playlist.IsCollaborative, 0, playlist.CreatedAt, new List<string>()));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdatePlaylistDto dto)
    {
        var userId = GetUserId();
        // only the owner edits the details; collaborators edit tracks
        var playlist = await _db.Playlists.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);
        if (playlist == null) return NotFound();

        if (dto.Title != null)
        {
            var title = dto.Title.Trim();
            if (title.Length == 0 || title.Length > 120) return BadRequest(new { message = "Назва плейліста від 1 до 120 символів" });
            playlist.Title = title;
        }
        if (dto.Description != null) playlist.Description = dto.Description.Trim();
        if (dto.IsPublic.HasValue) playlist.IsPublic = dto.IsPublic.Value;
        if (dto.IsCollaborative.HasValue) playlist.IsCollaborative = dto.IsCollaborative.Value;
        if (playlist.IsCollaborative) playlist.IsPublic = true;

        await _db.SaveChangesAsync();
        return Ok();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var userId = GetUserId();
        var playlist = await _db.Playlists.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);
        if (playlist == null) return NotFound();
        _db.Playlists.Remove(playlist);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id}/tracks")]
    public async Task<IActionResult> AddTrack(int id, [FromBody] AddTrackToPlaylistDto dto)
    {
        var userId = GetUserId();
        var playlist = await EditablePlaylist(id, userId);
        if (playlist == null) return NotFound();
        if (!await _db.Tracks.AnyAsync(t => t.Id == dto.TrackId)) return NotFound(new { message = "Трек не знайдено — можливо, його видалили з бібліотеки" });

        var exists = await _db.PlaylistTracks.AnyAsync(pt => pt.PlaylistId == id && pt.TrackId == dto.TrackId);
        if (exists) return Conflict(new { message = "Трек вже в плейлисті" });

        var maxOrder = await _db.PlaylistTracks.Where(pt => pt.PlaylistId == id).MaxAsync(pt => (int?)pt.Order) ?? 0;
        _db.PlaylistTracks.Add(new PlaylistTrack { PlaylistId = id, TrackId = dto.TrackId, Order = maxOrder + 1 });
        await _db.SaveChangesAsync();
        return Ok();
    }

    [HttpDelete("{id}/tracks/{trackId}")]
    public async Task<IActionResult> RemoveTrack(int id, int trackId)
    {
        var userId = GetUserId();
        var playlist = await EditablePlaylist(id, userId);
        if (playlist == null) return NotFound();

        var pt = await _db.PlaylistTracks.FirstOrDefaultAsync(pt => pt.PlaylistId == id && pt.TrackId == trackId);
        if (pt == null) return NotFound();
        _db.PlaylistTracks.Remove(pt);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("{id}/reorder")]
    public async Task<IActionResult> Reorder(int id, [FromBody] ReorderPlaylistDto dto)
    {
        var userId = GetUserId();
        var playlist = await EditablePlaylist(id, userId);
        if (playlist == null) return NotFound();

        if (dto.TrackIds == null || dto.TrackIds.Count == 0)
            return BadRequest(new { message = "trackIds is required" });

        var playlistTracks = await _db.PlaylistTracks
            .Where(pt => pt.PlaylistId == id)
            .OrderBy(pt => pt.Order).ThenBy(pt => pt.Id)
            .ToListAsync();

        // The requested order first; anything the client did not mention (added by someone else meanwhile) keeps its place at the end
        var byTrack = playlistTracks.GroupBy(pt => pt.TrackId).ToDictionary(g => g.Key, g => g.First());
        var ordered = new List<PlaylistTrack>();
        foreach (var trackId in dto.TrackIds)
            if (byTrack.Remove(trackId, out var pt)) ordered.Add(pt);
        ordered.AddRange(playlistTracks.Where(pt => !ordered.Contains(pt)));

        for (int i = 0; i < ordered.Count; i++) ordered[i].Order = i;

        await _db.SaveChangesAsync();
        return Ok();
    }
}
