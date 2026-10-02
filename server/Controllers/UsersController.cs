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
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;

    public UsersController(AppDbContext db)
    {
        _db = db;
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
        
        var artist = await _db.Artists.FirstOrDefaultAsync(a => a.UserId == user.Id);
        return Ok(new UserDto(user.Id, user.Email, user.Name, user.Role, user.AvatarPath, artist?.Id));
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
