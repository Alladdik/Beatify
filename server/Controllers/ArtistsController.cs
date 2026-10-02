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
public class ArtistsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly RecommendationService _rec;

    public ArtistsController(AppDbContext db, IWebHostEnvironment env, RecommendationService rec)
    {
        _db = db;
        _env = env;
        _rec = rec;
    }

    private int? UserId => int.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var ids = await _db.Artists.OrderBy(a => a.Name).Select(a => a.Id).ToListAsync();
        return Ok(await _rec.ArtistCardsAsync(ids));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var artist = (await _rec.ArtistCardsAsync(new List<int> { id })).FirstOrDefault();
        return artist == null ? NotFound() : Ok(artist);
    }

    [HttpGet("{id}/similar")]
    public async Task<IActionResult> Similar(int id, [FromQuery] int limit = 10) =>
        Ok(await _rec.SimilarArtistsAsync(id, Math.Clamp(limit, 1, 30)));

    [HttpGet("{id}/tracks")]
    public async Task<IActionResult> GetArtistTracks(int id)
    {
        var liked = await _rec.LikedIdsAsync(UserId);
        var tracks = await _db.Tracks.AsNoTracking()
            .Include(t => t.Artist)
            .Include(t => t.Album)
            .Where(t => t.ArtistId == id)
            .OrderByDescending(t => t.PlayCount)
            .ToListAsync();
        return Ok(tracks.Select(t => RecommendationService.ToDto(t, liked)));
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
