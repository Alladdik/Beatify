using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BeatifyServer.Data;
using BeatifyServer.DTOs;
using BeatifyServer.Models;
using BeatifyServer.Services;

namespace BeatifyServer.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly JwtService _jwt;
    private readonly IConfiguration _config;

    public AuthController(AppDbContext db, JwtService jwt, IConfiguration config)
    {
        _db = db;
        _jwt = jwt;
        _config = config;
    }

    /// <summary>Lets the login screen hide “create account” on closed (invite-only) servers.</summary>
    [HttpGet("config")]
    public async Task<IActionResult> GetConfig() =>
        Ok(new { allowRegistration = await RegistrationOpen(), firstRun = !await _db.Users.AnyAsync() });

    // Registration is always open for the very first account (it becomes the admin); after that
    // Auth__AllowRegistration=false closes the door.
    private async Task<bool> RegistrationOpen() =>
        !string.Equals(_config["Auth:AllowRegistration"], "false", StringComparison.OrdinalIgnoreCase)
        || !await _db.Users.AnyAsync();

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterDto dto)
    {
        if (!await RegistrationOpen())
            return StatusCode(403, new { message = "Реєстрацію на цьому сервері закрито" });
        var email = (dto.Email ?? "").Trim().ToLowerInvariant();
        var name = (dto.Name ?? "").Trim();
        if (!System.Text.RegularExpressions.Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$") || email.Length > 200)
            return BadRequest(new { message = "Вкажіть коректний email" });
        if (name.Length < 2 || name.Length > 60)
            return BadRequest(new { message = "Ім’я має містити від 2 до 60 символів" });
        if ((dto.Password ?? "").Length < 6 || dto.Password!.Length > 200)
            return BadRequest(new { message = "Пароль має містити щонайменше 6 символів" });
        if (await _db.Users.AnyAsync(u => u.Email.ToLower() == email))
            return Conflict(new { message = "Email вже використовується" });

        var user = new User
        {
            Email = email,
            Name = name,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
            Role = (await _db.Users.CountAsync()) == 0 ? "admin" : "user"
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var token = _jwt.GenerateToken(user);
        return Ok(new AuthResponseDto(token, new UserDto(user.Id, user.Email, user.Name, user.Role, user.AvatarPath, null)));
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginDto dto)
    {
        var email = (dto.Email ?? "").Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email);
        if (user == null || string.IsNullOrEmpty(dto.Password) || !BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
            return Unauthorized(new { message = "Невірний email або пароль" });

        var artist = await _db.Artists.FirstOrDefaultAsync(a => a.UserId == user.Id);
        var token = _jwt.GenerateToken(user);
        return Ok(new AuthResponseDto(token, new UserDto(user.Id, user.Email, user.Name, user.Role, user.AvatarPath, artist?.Id)));
    }

    [HttpGet("me")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public async Task<IActionResult> Me()
    {
        var id = int.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        var user = await _db.Users.FindAsync(id);
        if (user == null) return Unauthorized();
        var artist = await _db.Artists.FirstOrDefaultAsync(a => a.UserId == user.Id);
        return Ok(new UserDto(user.Id, user.Email, user.Name, user.Role, user.AvatarPath, artist?.Id));
    }
}
