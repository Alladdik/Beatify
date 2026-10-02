using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BeatifyServer.Controllers;

/// <summary>
/// Cloud storage for Beatify Studio projects. A project is a small JSON document owned by one user;
/// files live outside wwwroot (never served statically) under {Studio:Path | App_Data/studio}/{userId}/.
/// </summary>
[ApiController]
[Route("api/studio")]
[Authorize]
public class StudioController : ControllerBase
{
    private const int MaxBytes = 2 * 1024 * 1024;
    private readonly string _root;

    public StudioController(IConfiguration config, IWebHostEnvironment env)
    {
        _root = config["Studio:Path"] is { Length: > 0 } p ? p : Path.Combine(env.ContentRootPath, "App_Data", "studio");
    }

    private int UserId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
    private string UserDir() => Directory.CreateDirectory(Path.Combine(_root, UserId.ToString())).FullName;

    private static bool ValidId(string id) => id.Length is >= 8 and <= 40 && id.All(c => char.IsLetterOrDigit(c) || c == '-');

    [HttpGet("projects")]
    public IActionResult List()
    {
        var items = new List<object>();
        foreach (var file in new DirectoryInfo(UserDir()).GetFiles("*.json").OrderByDescending(f => f.LastWriteTimeUtc).Take(200))
        {
            try
            {
                using var doc = JsonDocument.Parse(System.IO.File.ReadAllBytes(file.FullName));
                var r = doc.RootElement;
                items.Add(new
                {
                    id = Path.GetFileNameWithoutExtension(file.Name),
                    name = r.TryGetProperty("name", out var n) ? n.GetString() : "Без назви",
                    bpm = r.TryGetProperty("bpm", out var b) && b.ValueKind == JsonValueKind.Number ? b.GetInt32() : 0,
                    genre = r.TryGetProperty("genre", out var g) ? g.GetString() : null,
                    updatedAt = file.LastWriteTimeUtc,
                });
            }
            catch { /* skip a corrupt file */ }
        }
        return Ok(items);
    }

    [HttpGet("projects/{id}")]
    public IActionResult Get(string id)
    {
        if (!ValidId(id)) return BadRequest();
        var path = Path.Combine(UserDir(), id + ".json");
        return System.IO.File.Exists(path) ? Content(System.IO.File.ReadAllText(path), "application/json") : NotFound();
    }

    [HttpPut("projects/{id}")]
    [RequestSizeLimit(MaxBytes)]
    public async Task<IActionResult> Save(string id)
    {
        if (!ValidId(id)) return BadRequest(new { message = "Некоректний id проєкту" });
        using var reader = new StreamReader(Request.Body);
        var json = await reader.ReadToEndAsync();
        if (json.Length > MaxBytes) return BadRequest(new { message = "Проєкт завеликий" });
        try { using var _ = JsonDocument.Parse(json); }
        catch (JsonException) { return BadRequest(new { message = "Некоректний JSON" }); }

        // a user may keep at most 200 projects
        var dir = UserDir();
        if (!System.IO.File.Exists(Path.Combine(dir, id + ".json")) && Directory.GetFiles(dir, "*.json").Length >= 200)
            return BadRequest(new { message = "Забагато проєктів. Видаліть непотрібні." });

        await System.IO.File.WriteAllTextAsync(Path.Combine(dir, id + ".json"), json);
        return Ok(new { id });
    }

    [HttpDelete("projects/{id}")]
    public IActionResult Delete(string id)
    {
        if (!ValidId(id)) return BadRequest();
        var path = Path.Combine(UserDir(), id + ".json");
        if (System.IO.File.Exists(path)) System.IO.File.Delete(path);
        return NoContent();
    }
}
