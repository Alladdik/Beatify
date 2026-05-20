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

    [HttpGet]
    public async Task<IActionResult> GetMyPlaylists()
    {
        var userId = GetUserId();
        var playlists = await _db.Playlists
            .Include(p => p.User)
            .Include(p => p.PlaylistTracks)
            .Where(p => p.UserId == userId)
            .Select(p => new PlaylistDto(p.Id, p.UserId, p.User!.Name, p.Title, p.Description, p.CoverPath, p.IsPublic, p.PlaylistTracks.Count, p.CreatedAt))
            .ToListAsync();
        return Ok(playlists);
    }

    [HttpGet("public")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPublicPlaylists()
    {
        var playlists = await _db.Playlists
            .Include(p => p.User)
            .Include(p => p.PlaylistTracks)
            .Where(p => p.IsPublic)
            .OrderByDescending(p => p.CreatedAt)
            .Take(50)
            .Select(p => new PlaylistDto(p.Id, p.UserId, p.User!.Name, p.Title, p.Description, p.CoverPath, p.IsPublic, p.PlaylistTracks.Count, p.CreatedAt))
            .ToListAsync();
        return Ok(playlists);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var userId = GetUserId();
        var playlist = await _db.Playlists
            .Include(p => p.User)
            .Include(p => p.PlaylistTracks)
            .FirstOrDefaultAsync(p => p.Id == id && (p.UserId == userId || p.IsPublic));
        if (playlist == null) return NotFound();
        return Ok(new PlaylistDto(playlist.Id, playlist.UserId, playlist.User!.Name, playlist.Title, playlist.Description, playlist.CoverPath, playlist.IsPublic, playlist.PlaylistTracks.Count, playlist.CreatedAt));
    }

    [HttpGet("{id}/tracks")]
    public async Task<IActionResult> GetPlaylistTracks(int id)
    {
        var userId = GetUserId();
        var likedIds = await _db.LikedTracks.Where(lt => lt.UserId == userId).Select(lt => lt.TrackId).ToListAsync();

        var tracks = await _db.PlaylistTracks
            .Include(pt => pt.Track).ThenInclude(t => t!.Artist)
            .Include(pt => pt.Track).ThenInclude(t => t!.Album)
            .Where(pt => pt.PlaylistId == id)
            .OrderBy(pt => pt.Order)
            .Select(pt => new TrackDto(
                pt.Track!.Id, pt.Track.Title,
                pt.Track.ArtistId, pt.Track.Artist!.Name,
                pt.Track.AlbumId, pt.Track.Album != null ? pt.Track.Album.Title : null,
                pt.Track.CoverPath, pt.Track.Duration,
                pt.Track.Genre, pt.Track.PlayCount, pt.Track.IsExplicit,
                likedIds.Contains(pt.Track.Id), pt.Track.CreatedAt, pt.Track.Lyrics, pt.Track.MediaType))
            .ToListAsync();
        return Ok(tracks);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePlaylistDto dto)
    {
        var userId = GetUserId();
        var playlist = new Playlist
        {
            UserId = userId,
            Title = dto.Title,
            Description = dto.Description,
            IsPublic = dto.IsPublic
        };
        _db.Playlists.Add(playlist);
        await _db.SaveChangesAsync();

        var user = await _db.Users.FindAsync(userId);
        return CreatedAtAction(nameof(GetById), new { id = playlist.Id },
            new PlaylistDto(playlist.Id, userId, user?.Name ?? "", playlist.Title, playlist.Description, playlist.CoverPath, playlist.IsPublic, 0, playlist.CreatedAt));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdatePlaylistDto dto)
    {
        var userId = GetUserId();
        var playlist = await _db.Playlists.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);
        if (playlist == null) return NotFound();

        if (dto.Title != null) playlist.Title = dto.Title;
        if (dto.Description != null) playlist.Description = dto.Description;
        if (dto.IsPublic.HasValue) playlist.IsPublic = dto.IsPublic.Value;

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
        var playlist = await _db.Playlists.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);
        if (playlist == null) return NotFound();

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
        var playlist = await _db.Playlists.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);
        if (playlist == null) return NotFound();

        var pt = await _db.PlaylistTracks.FirstOrDefaultAsync(pt => pt.PlaylistId == id && pt.TrackId == trackId);
        if (pt == null) return NotFound();
        _db.PlaylistTracks.Remove(pt);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("{id}/reorder")]
    [Authorize]
    public async Task<IActionResult> Reorder(int id, [FromBody] ReorderPlaylistDto dto)
    {
        var userId = GetUserId();
        var playlist = await _db.Playlists.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);
        if (playlist == null) return NotFound();

        if (dto.TrackIds == null || dto.TrackIds.Count == 0)
            return BadRequest(new { message = "trackIds is required" });

        var playlistTracks = await _db.PlaylistTracks
            .Where(pt => pt.PlaylistId == id)
            .ToListAsync();

        for (int i = 0; i < dto.TrackIds.Count; i++)
        {
            var trackId = dto.TrackIds[i];
            var pt = playlistTracks.FirstOrDefault(pt => pt.TrackId == trackId);
            if (pt != null)
                pt.Order = i;
        }

        await _db.SaveChangesAsync();
        return Ok();
    }
}
