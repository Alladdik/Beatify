using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BeatifyServer.Data;
using BeatifyServer.DTOs;
using BeatifyServer.Models;
using BeatifyServer.Services;
using Microsoft.Extensions.Caching.Memory;

namespace BeatifyServer.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly IMemoryCache _cache;

    public UsersController(AppDbContext db, IWebHostEnvironment env, IMemoryCache cache)
    {
        _db = db;
        _env = env;
        _cache = cache;
    }

    private int GetUserId() => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

    [HttpPut("me")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateUserDto dto)
    {
        var userId = GetUserId();
        var user = await _db.Users.FindAsync(userId);
        if (user == null) return NotFound();

        if (!string.IsNullOrWhiteSpace(dto.Name))
        {
            var n = dto.Name.Trim();
            if (n.Length < 2 || n.Length > 60) return BadRequest(new { message = "Ім’я має містити від 2 до 60 символів" });
            user.Name = n;
        }
        if (!string.IsNullOrWhiteSpace(dto.Email))
        {
            var e = dto.Email.Trim().ToLowerInvariant();
            if (!System.Text.RegularExpressions.Regex.IsMatch(e, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
                return BadRequest(new { message = "Вкажіть коректний email" });
            if (await _db.Users.AnyAsync(u => u.Id != userId && u.Email.ToLower() == e))
                return Conflict(new { message = "Цей email уже використовується" });
            user.Email = e;
        }

        await _db.SaveChangesAsync();
        Perm.Forget(_cache, userId);

        var artist = await _db.Artists.FirstOrDefaultAsync(a => a.UserId == user.Id);
        return Ok(user.ToDto(artist?.Id));
    }

    // POST /api/users/me/password — change the password (the current one must be confirmed)
    [HttpPost("me/password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto)
    {
        var user = await _db.Users.FindAsync(GetUserId());
        if (user == null) return NotFound();
        if (string.IsNullOrEmpty(dto.CurrentPassword) || !BCrypt.Net.BCrypt.Verify(dto.CurrentPassword, user.PasswordHash))
            return BadRequest(new { message = "Поточний пароль невірний" });
        var np = dto.NewPassword ?? "";
        if (np.Length < 6 || np.Length > 200) return BadRequest(new { message = "Новий пароль має містити щонайменше 6 символів" });
        if (np == dto.CurrentPassword) return BadRequest(new { message = "Новий пароль збігається з поточним" });
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(np);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Пароль змінено" });
    }

    // POST /api/users/me/avatar — profile picture (jpg / png / webp, up to 5 MB)
    [HttpPost("me/avatar")]
    [RequestSizeLimit(6_000_000)]
    public async Task<IActionResult> UploadAvatar(IFormFile file)
    {
        var user = await _db.Users.FindAsync(GetUserId());
        if (user == null) return NotFound();
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext is not (".jpg" or ".jpeg" or ".png" or ".webp")) return BadRequest(new { message = "Фото має бути jpg, png або webp" });
        if (file.Length is 0 or > 5 * 1024 * 1024) return BadRequest(new { message = "Фото завелике (максимум 5 МБ)" });

        var dir = Path.Combine(_env.WebRootPath, "uploads", "avatars");
        Directory.CreateDirectory(dir);
        var name = $"{Guid.NewGuid()}{ext}";
        await using (var fs = new FileStream(Path.Combine(dir, name), FileMode.Create)) await file.CopyToAsync(fs);
        DeleteAvatarFile(user.AvatarPath);
        user.AvatarPath = name;
        await _db.SaveChangesAsync();
        var artist = await _db.Artists.FirstOrDefaultAsync(a => a.UserId == user.Id);
        return Ok(user.ToDto(artist?.Id));
    }

    [HttpDelete("me/avatar")]
    public async Task<IActionResult> RemoveAvatar()
    {
        var user = await _db.Users.FindAsync(GetUserId());
        if (user == null) return NotFound();
        DeleteAvatarFile(user.AvatarPath);
        user.AvatarPath = null;
        await _db.SaveChangesAsync();
        var artist = await _db.Artists.FirstOrDefaultAsync(a => a.UserId == user.Id);
        return Ok(user.ToDto(artist?.Id));
    }

    // POST /api/users/me/request-upload — ask the admin for the right to publish tracks
    [HttpPost("me/request-upload")]
    public async Task<IActionResult> RequestUpload()
    {
        var user = await _db.Users.FindAsync(GetUserId());
        if (user == null) return NotFound();
        if (user.CanUpload || user.Role == "admin") return BadRequest(new { message = "У вас уже є право публікувати треки" });
        user.UploadRequestedAt ??= DateTime.UtcNow;
        user.UploadDeniedAt = null; // asking again after a refusal is allowed
        await _db.SaveChangesAsync();
        var artist = await _db.Artists.FirstOrDefaultAsync(a => a.UserId == user.Id);
        return Ok(user.ToDto(artist?.Id));
    }

    private void DeleteAvatarFile(string? file)
    {
        if (string.IsNullOrEmpty(file)) return;
        try { System.IO.File.Delete(Path.Combine(_env.WebRootPath, "uploads", "avatars", Path.GetFileName(file))); } catch { /* already gone */ }
    }

    [HttpPost("become-artist")]
    public async Task<IActionResult> BecomeArtist()
    {
        var userId = GetUserId();
        var existing = await _db.Artists.AnyAsync(a => a.UserId == userId);
        if (existing) return BadRequest(new { message = "Ви вже зареєстровані як виконавець" });

        var user = await _db.Users.FindAsync(userId);
        if (user == null) return NotFound();

        var artist = new Artist
        {
            Name = user.Name,
            UserId = userId,
            Bio = "Новий виконавець на Beatify",
            Genre = "Various"
        };

        _db.Artists.Add(artist);
        await _db.SaveChangesAsync();

        return Ok(new { id = artist.Id, name = artist.Name });
    }
}
