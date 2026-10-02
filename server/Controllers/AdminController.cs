using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using BeatifyServer.Data;
using BeatifyServer.Models;
using BeatifyServer.Services;

namespace BeatifyServer.Controllers;

/// <summary>User management for admins: who may sign in, upload, import, and who is an artist.</summary>
[ApiController]
[Route("api/admin/users")]
[Authorize(Roles = "admin")]
public class AdminController(AppDbContext db, IMemoryCache cache) : ControllerBase
{
    private int Me => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public record AdminUserDto(int Id, string Email, string Name, string Role, string? AvatarPath, DateTime CreatedAt,
        bool CanUpload, bool CanImport, bool IsBlocked, DateTime? UploadRequestedAt, DateTime? UploadDeniedAt, int? ArtistId, string? ArtistName, int TrackCount, int PlaylistCount);

    public record UpdateAdminUserDto(string? Role, bool? CanUpload, bool? CanImport, bool? IsBlocked, string? Name, bool? DenyUpload);
    public record ResetPasswordDto(string? NewPassword);
    public record LinkArtistDto(int? ArtistId);

    private static AdminUserDto Map(User u, IReadOnlyDictionary<int, (int Id, string Name, int Tracks)> artists, IReadOnlyDictionary<int, int> playlists) =>
        new(u.Id, u.Email, u.Name, u.Role, u.AvatarPath, u.CreatedAt, u.CanUpload, u.CanImport, u.IsBlocked, u.UploadRequestedAt, u.UploadDeniedAt,
            artists.TryGetValue(u.Id, out var a) ? a.Id : null, artists.TryGetValue(u.Id, out var b) ? b.Name : null,
            artists.TryGetValue(u.Id, out var c) ? c.Tracks : 0,
            playlists.TryGetValue(u.Id, out var p) ? p : 0);

    private async Task<Dictionary<int, int>> PlaylistCounts(IEnumerable<int> userIds)
    {
        var ids = userIds.ToList();
        return await db.Playlists.AsNoTracking().Where(p => ids.Contains(p.UserId))
            .GroupBy(p => p.UserId).Select(g => new { g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.N);
    }

    private async Task<Dictionary<int, (int Id, string Name, int Tracks)>> ArtistsByUser(IEnumerable<int> userIds)
    {
        var ids = userIds.ToList();
        var rows = await db.Artists.AsNoTracking()
            .Where(a => a.UserId != null && ids.Contains(a.UserId.Value))
            .Select(a => new { a.Id, a.Name, UserId = a.UserId!.Value, Tracks = a.Tracks.Count })
            .ToListAsync();
        return rows.GroupBy(r => r.UserId).ToDictionary(g => g.Key, g => (g.First().Id, g.First().Name, g.First().Tracks));
    }

    private async Task<AdminUserDto?> Load(int id)
    {
        var u = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        return u == null ? null : Map(u, await ArtistsByUser([id]), await PlaylistCounts([id]));
    }

    // GET /api/admin/users?q=
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? q)
    {
        var query = db.Users.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var t = q.Trim().ToLower();
            query = query.Where(u => u.Email.ToLower().Contains(t) || u.Name.ToLower().Contains(t));
        }
        // requests for upload rights first, then admins, then newest
        var users = await query
            .OrderByDescending(u => u.UploadRequestedAt != null && !u.CanUpload)
            .ThenByDescending(u => u.Role == "admin")
            .ThenByDescending(u => u.CreatedAt)
            .Take(300).ToListAsync();
        var artists = await ArtistsByUser(users.Select(u => u.Id));
        var playlists = await PlaylistCounts(users.Select(u => u.Id));
        return Ok(users.Select(u => Map(u, artists, playlists)));
    }

    // PUT /api/admin/users/{id}
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateAdminUserDto dto)
    {
        var user = await db.Users.FindAsync(id);
        if (user == null) return NotFound();

        if (dto.Role != null)
        {
            if (dto.Role is not ("user" or "admin")) return BadRequest(new { message = "Невідома роль" });
            if (dto.Role != user.Role)
            {
                if (id == Me) return BadRequest(new { message = "Свою роль змінити не можна" });
                if (user.Role == "admin" && await db.Users.CountAsync(u => u.Role == "admin" && !u.IsBlocked) <= 1)
                    return BadRequest(new { message = "Не можна зняти останнього адміністратора" });
                user.Role = dto.Role;
            }
        }
        if (dto.IsBlocked.HasValue && dto.IsBlocked != user.IsBlocked)
        {
            if (id == Me) return BadRequest(new { message = "Себе заблокувати не можна" });
            if (dto.IsBlocked == true && user.Role == "admin" && await db.Users.CountAsync(u => u.Role == "admin" && !u.IsBlocked) <= 1)
                return BadRequest(new { message = "Не можна заблокувати останнього адміністратора" });
            user.IsBlocked = dto.IsBlocked.Value;
        }
        if (dto.CanUpload.HasValue)
        {
            user.CanUpload = dto.CanUpload.Value;
            if (dto.CanUpload == true) { user.UploadRequestedAt = null; user.UploadDeniedAt = null; } // request answered: yes
        }
        if (dto.DenyUpload == true)
        {
            // request answered: no (the user sees that and may ask again later)
            user.CanUpload = false;
            user.UploadRequestedAt = null;
            user.UploadDeniedAt = DateTime.UtcNow;
        }
        if (dto.CanImport.HasValue) user.CanImport = dto.CanImport.Value;
        if (!string.IsNullOrWhiteSpace(dto.Name))
        {
            var n = dto.Name.Trim();
            if (n.Length is < 2 or > 60) return BadRequest(new { message = "Ім’я має містити від 2 до 60 символів" });
            user.Name = n;
        }

        await db.SaveChangesAsync();
        Perm.Forget(cache, id);
        return Ok(await Load(id));
    }

    // POST /api/admin/users/{id}/reset-password — new password is shown to the admin once
    [HttpPost("{id:int}/reset-password")]
    public async Task<IActionResult> ResetPassword(int id, [FromBody] ResetPasswordDto dto)
    {
        var user = await db.Users.FindAsync(id);
        if (user == null) return NotFound();
        var pw = string.IsNullOrWhiteSpace(dto.NewPassword) ? Generate(10) : dto.NewPassword;
        if (pw.Length is < 6 or > 200) return BadRequest(new { message = "Пароль має містити щонайменше 6 символів" });
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(pw);
        await db.SaveChangesAsync();
        return Ok(new { password = pw });
    }

    // POST /api/admin/users/{id}/artist — give the user an artist page (new, or link an existing unowned one)
    [HttpPost("{id:int}/artist")]
    public async Task<IActionResult> LinkArtist(int id, [FromBody] LinkArtistDto dto)
    {
        var user = await db.Users.FindAsync(id);
        if (user == null) return NotFound();
        if (await db.Artists.AnyAsync(a => a.UserId == id)) return BadRequest(new { message = "У користувача вже є сторінка виконавця" });

        if (dto.ArtistId is > 0)
        {
            var artist = await db.Artists.FindAsync(dto.ArtistId.Value);
            if (artist == null) return NotFound(new { message = "Виконавця не знайдено" });
            if (artist.UserId != null) return BadRequest(new { message = "Цей виконавець уже належить іншому користувачу" });
            artist.UserId = id;
        }
        else
        {
            db.Artists.Add(new Artist { Name = user.Name, UserId = id, Bio = "Новий виконавець на Beatify", Genre = "Various" });
        }
        await db.SaveChangesAsync();
        return Ok(await Load(id));
    }

    // DELETE /api/admin/users/{id}/artist — unlink (the artist page and its tracks stay in the catalog)
    [HttpDelete("{id:int}/artist")]
    public async Task<IActionResult> UnlinkArtist(int id)
    {
        var artist = await db.Artists.FirstOrDefaultAsync(a => a.UserId == id);
        if (artist == null) return NotFound();
        artist.UserId = null;
        await db.SaveChangesAsync();
        return Ok(await Load(id));
    }

    // DELETE /api/admin/users/{id} — remove the account and its personal data (likes, history, playlists).
    // Tracks the user published stay in the catalog; their artist page is detached, not deleted.
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        if (id == Me) return BadRequest(new { message = "Свій акаунт видалити не можна" });
        var user = await db.Users.FindAsync(id);
        if (user == null) return NotFound();
        if (user.Role == "admin" && await db.Users.CountAsync(u => u.Role == "admin" && u.Id != id) == 0)
            return BadRequest(new { message = "Не можна видалити останнього адміністратора" });

        await using var tx = await db.Database.BeginTransactionAsync();
        var playlistIds = await db.Playlists.Where(p => p.UserId == id).Select(p => p.Id).ToListAsync();
        await db.PlaylistTracks.Where(pt => playlistIds.Contains(pt.PlaylistId)).ExecuteDeleteAsync();
        await db.Playlists.Where(p => p.UserId == id).ExecuteDeleteAsync();
        await db.LikedTracks.Where(l => l.UserId == id).ExecuteDeleteAsync();
        await db.ListeningHistory.Where(h => h.UserId == id).ExecuteDeleteAsync();
        await db.Artists.Where(a => a.UserId == id).ExecuteUpdateAsync(s => s.SetProperty(a => a.UserId, (int?)null));
        db.Users.Remove(user);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        Perm.Forget(cache, id);
        return NoContent();
    }

    private static string Generate(int length)
    {
        const string alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return new string(Enumerable.Range(0, length).Select(_ => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)]).ToArray());
    }
}
