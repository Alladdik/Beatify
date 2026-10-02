using System.Security.Claims;
using BeatifyServer.Data;
using BeatifyServer.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BeatifyServer.Controllers;

/// <summary>Smart picks: home shelves, mixes, similar tracks, similar artists. Works for guests too.</summary>
[ApiController]
[Route("api/[controller]")]
public class DiscoverController : ControllerBase
{
    private readonly RecommendationService _rec;
    private readonly AppDbContext _db;

    public DiscoverController(RecommendationService rec, AppDbContext db)
    {
        _rec = rec;
        _db = db;
    }

    private int? UserId => int.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    [HttpGet("home")]
    public async Task<IActionResult> Home() => Ok(await _rec.HomeAsync(UserId));

    [HttpGet("mix/{id}")]
    public async Task<IActionResult> Mix(string id)
    {
        var mix = await _rec.MixAsync(id, UserId);
        return mix == null ? NotFound(new { message = "Мікс поки що порожній — послухайте більше музики" }) : Ok(mix);
    }

    [HttpGet("similar/{trackId:int}")]
    public async Task<IActionResult> Similar(int trackId, [FromQuery] int limit = 12) =>
        Ok(await _rec.SimilarAsync(trackId, UserId, Math.Clamp(limit, 1, 50)));

    [HttpGet("library")]
    public async Task<IActionResult> Library()
    {
        var uid = UserId;
        if (uid == null) return Ok(new { liked = 0, plays = 0, minutes = 0 });
        var liked = await _db.LikedTracks.CountAsync(l => l.UserId == uid);
        var plays = await _db.ListeningHistory.CountAsync(h => h.UserId == uid);
        var seconds = await _db.ListeningHistory.Where(h => h.UserId == uid).SumAsync(h => (int?)h.Track!.Duration) ?? 0;
        return Ok(new { liked, plays, minutes = seconds / 60 });
    }
}
