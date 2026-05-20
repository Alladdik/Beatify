using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BeatifyServer.Data;
using BeatifyServer.DTOs;
using BeatifyServer.Models;

namespace BeatifyServer.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ArtistsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;

    public ArtistsController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var artists = await _db.Artists
            .Include(a => a.Tracks)
            .Select(a => new ArtistDto(a.Id, a.Name, a.ImagePath, a.Bio, a.Genre, a.MonthlyListeners, a.Tracks.Count))
            .ToListAsync();
        return Ok(artists);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var artist = await _db.Artists.Include(a => a.Tracks).Include(a => a.Albums).FirstOrDefaultAsync(a => a.Id == id);
        if (artist == null) return NotFound();
        return Ok(new ArtistDto(artist.Id, artist.Name, artist.ImagePath, artist.Bio, artist.Genre, artist.MonthlyListeners, artist.Tracks.Count));
    }

    [HttpGet("{id}/tracks")]
    public async Task<IActionResult> GetArtistTracks(int id)
    {
        var tracks = await _db.Tracks
            .Include(t => t.Artist)
            .Include(t => t.Album)
            .Where(t => t.ArtistId == id)
            .OrderByDescending(t => t.PlayCount)
            .Select(t => new TrackDto(t.Id, t.Title, t.ArtistId, t.Artist!.Name, t.AlbumId, t.Album != null ? t.Album.Title : null,
                t.CoverPath, t.Duration, t.Genre, t.PlayCount, t.IsExplicit, false, t.CreatedAt, t.Lyrics, t.MediaType))
            .ToListAsync();
        return Ok(tracks);
    }

    [HttpGet("{id}/albums")]
    public async Task<IActionResult> GetArtistAlbums(int id)
    {
        var albums = await _db.Albums
            .Include(a => a.Artist)
            .Include(a => a.Tracks)
            .Where(a => a.ArtistId == id)
            .Select(a => new AlbumDto(a.Id, a.Title, a.ArtistId, a.Artist!.Name, a.CoverPath, a.Year, a.Genre, a.Tracks.Count))
            .ToListAsync();
        return Ok(albums);
    }

    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create([FromForm] CreateArtistDto dto, IFormFile? imageFile)
    {
        string? imagePath = null;
        if (imageFile != null)
        {
            var imagesPath = Path.Combine(_env.WebRootPath, "uploads", "artists");
            Directory.CreateDirectory(imagesPath);
            var fileName = $"{Guid.NewGuid()}{Path.GetExtension(imageFile.FileName)}";
            var fullPath = Path.Combine(imagesPath, fileName);
            using var stream = new FileStream(fullPath, FileMode.Create);
            await imageFile.CopyToAsync(stream);
            imagePath = fileName;
        }

        var artist = new Artist { Name = dto.Name, Bio = dto.Bio, Genre = dto.Genre, ImagePath = imagePath };
        _db.Artists.Add(artist);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = artist.Id },
            new ArtistDto(artist.Id, artist.Name, artist.ImagePath, artist.Bio, artist.Genre, 0, 0));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Update(int id, [FromForm] CreateArtistDto dto, IFormFile? imageFile)
    {
        var artist = await _db.Artists.FindAsync(id);
        if (artist == null) return NotFound();

        artist.Name = dto.Name;
        artist.Bio = dto.Bio;
        artist.Genre = dto.Genre;

        if (imageFile != null)
        {
            var imagesPath = Path.Combine(_env.WebRootPath, "uploads", "artists");
            Directory.CreateDirectory(imagesPath);
            var fileName = $"{Guid.NewGuid()}{Path.GetExtension(imageFile.FileName)}";
            using var stream = new FileStream(Path.Combine(imagesPath, fileName), FileMode.Create);
            await imageFile.CopyToAsync(stream);
            artist.ImagePath = fileName;
        }

        await _db.SaveChangesAsync();
        return Ok(new ArtistDto(artist.Id, artist.Name, artist.ImagePath, artist.Bio, artist.Genre, artist.MonthlyListeners, 0));
    }
}
