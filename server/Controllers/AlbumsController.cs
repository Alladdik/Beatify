using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BeatifyServer.Data;
using BeatifyServer.DTOs;
using BeatifyServer.Models;

namespace BeatifyServer.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AlbumsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;

    public AlbumsController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var albums = await _db.Albums
            .Include(a => a.Artist)
            .Include(a => a.Tracks)
            .Select(a => new AlbumDto(a.Id, a.Title, a.ArtistId, a.Artist!.Name, a.CoverPath, a.Year, a.Genre, a.Tracks.Count))
            .ToListAsync();
        return Ok(albums);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var album = await _db.Albums
            .Include(a => a.Artist)
            .Include(a => a.Tracks)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (album == null) return NotFound();
        return Ok(new AlbumDto(album.Id, album.Title, album.ArtistId, album.Artist!.Name, album.CoverPath, album.Year, album.Genre, album.Tracks.Count));
    }

    [HttpGet("{id}/tracks")]
    public async Task<IActionResult> GetAlbumTracks(int id)
    {
        var tracks = await _db.Tracks
            .Include(t => t.Artist)
            .Include(t => t.Album)
            .Where(t => t.AlbumId == id)
            .OrderBy(t => t.CreatedAt).ThenBy(t => t.Id)
            .ToListAsync();
        var uid = int.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var u) ? u : 0;
        var liked = uid > 0 ? (await _db.LikedTracks.Where(l => l.UserId == uid).Select(l => l.TrackId).ToListAsync()).ToHashSet() : new HashSet<int>();
        return Ok(tracks.Select(t => BeatifyServer.Services.RecommendationService.ToDto(t, liked)));
    }

    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create([FromForm] CreateAlbumDto dto, IFormFile? coverFile)
    {
        string? coverPath = null;
        if (coverFile != null)
        {
            var coversPath = Path.Combine(_env.WebRootPath, "uploads", "covers");
            Directory.CreateDirectory(coversPath);
            var fileName = $"{Guid.NewGuid()}{Path.GetExtension(coverFile.FileName)}";
            using var stream = new FileStream(Path.Combine(coversPath, fileName), FileMode.Create);
            await coverFile.CopyToAsync(stream);
            coverPath = fileName;
        }

        var album = new Album
        {
            Title = dto.Title,
            ArtistId = dto.ArtistId,
            Year = dto.Year ?? DateTime.UtcNow.Year,
            Genre = dto.Genre,
            CoverPath = coverPath
        };
        _db.Albums.Add(album);
        await _db.SaveChangesAsync();
        var artist = await _db.Artists.FindAsync(album.ArtistId);
        return CreatedAtAction(nameof(GetById), new { id = album.Id },
            new AlbumDto(album.Id, album.Title, album.ArtistId, artist?.Name ?? "", album.CoverPath, album.Year, album.Genre, 0));
    }
}
