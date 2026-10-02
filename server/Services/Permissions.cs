using System.Security.Claims;
using BeatifyServer.Data;
using BeatifyServer.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace BeatifyServer.Services;

/// <summary>What the database says about a signed-in user right now (the JWT only says what was true at login).</summary>
public sealed record AuthInfo(string Role, bool IsBlocked, bool CanUpload, bool CanImport);

public static class Perm
{
    public const string Upload = "CanUpload";
    public const string Import = "CanImport";

    public static string CacheKey(int userId) => $"authinfo:{userId}";

    /// <summary>Short-lived cache: role / permission / block changes made by an admin reach the user within seconds.</summary>
    public static async Task<AuthInfo?> LoadAsync(AppDbContext db, IMemoryCache cache, int userId)
    {
        if (cache.TryGetValue(CacheKey(userId), out AuthInfo? hit)) return hit;
        var info = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new AuthInfo(u.Role, u.IsBlocked, u.CanUpload, u.CanImport))
            .FirstOrDefaultAsync();
        cache.Set(CacheKey(userId), info, TimeSpan.FromSeconds(15));
        return info;
    }

    public static void Forget(IMemoryCache cache, int userId) => cache.Remove(CacheKey(userId));

    public static bool Has(AuthInfo i, string permission) =>
        !i.IsBlocked && (i.Role == "admin" || (permission == Upload && i.CanUpload) || (permission == Import && i.CanImport));
}

public sealed class PermissionRequirement(string permission) : IAuthorizationRequirement
{
    public string Permission { get; } = permission;
}

/// <summary>Policy "CanUpload" / "CanImport": admin, or a user the admin switched the permission on for.</summary>
public sealed class PermissionHandler(AppDbContext db, IMemoryCache cache) : AuthorizationHandler<PermissionRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        if (!int.TryParse(context.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id)) return;
        var info = await Perm.LoadAsync(db, cache, id);
        if (info != null && Perm.Has(info, requirement.Permission)) context.Succeed(requirement);
    }
}
