using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace BeatifyServer.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "CanImport")]
public class SpotifyController : ControllerBase
{
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _config;

    public SpotifyController(IHttpClientFactory http, IConfiguration config)
    {
        _http = http;
        _config = config;
    }

    public record SpotifyPlaylistRequest(string? Url, string? ClientId, string? ClientSecret);

    // POST (not GET): the client secret must never travel in a URL, where it ends up in logs.
    // Credentials may also come from server configuration (Spotify:ClientId / Spotify:ClientSecret).
    [HttpPost("playlist")]
    public async Task<IActionResult> GetPlaylist([FromBody] SpotifyPlaylistRequest req)
    {
        var url = req.Url;
        var clientId = !string.IsNullOrWhiteSpace(req.ClientId) ? req.ClientId : _config["Spotify:ClientId"];
        var clientSecret = !string.IsNullOrWhiteSpace(req.ClientSecret) ? req.ClientSecret : _config["Spotify:ClientSecret"];
        if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            return BadRequest(new { message = "Всі поля (URL, ClientID, ClientSecret) обов'язкові!" });

        var playlistId = url.Split("/playlist/").LastOrDefault()?.Split('?').FirstOrDefault()?.Trim('/');
        if (string.IsNullOrWhiteSpace(playlistId))
            return BadRequest(new { message = "Невірний лінк на Spotify плейлист." });

        try
        {
            var http = _http.CreateClient();

            // Step 1: get access token
            var creds = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{clientId}:{clientSecret}"));
            http.Timeout = TimeSpan.FromSeconds(30);
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", creds);

            var tokenResp = await http.PostAsync(
                "https://accounts.spotify.com/api/token",
                new FormUrlEncodedContent(new Dictionary<string, string> { ["grant_type"] = "client_credentials" })
            );

            if (!tokenResp.IsSuccessStatusCode)
                return BadRequest(new { message = "Невірні Client ID або Client Secret. Перевірте дані у Spotify Developer Dashboard." });

            using var tokenDoc = JsonDocument.Parse(await tokenResp.Content.ReadAsStringAsync());
            var token = tokenDoc.RootElement.GetProperty("access_token").GetString()!;

            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

            // Step 2: get playlist metadata + first 100 tracks (embedded in GET /playlists/{id})
            var playlistResp = await http.GetAsync($"https://api.spotify.com/v1/playlists/{playlistId}");

            if (playlistResp.StatusCode == HttpStatusCode.NotFound)
                return BadRequest(new { message = "Плейлист не знайдено або він приватний. Зробіть плейлист «Публічним» у Spotify." });

            if (playlistResp.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized)
                return BadRequest(new { message = "Spotify заблокував доступ. Переконайтеся, що плейлист публічний і ключі правильні." });

            if (!playlistResp.IsSuccessStatusCode)
                return BadRequest(new { message = $"Помилка Spotify API: {(int)playlistResp.StatusCode}" });

            using var doc = JsonDocument.Parse(await playlistResp.Content.ReadAsStringAsync());
            var root = doc.RootElement;

            var playlistName = root.TryGetProperty("name", out var np) ? np.GetString() : "";
            var ownerName = root.TryGetProperty("owner", out var op) && op.TryGetProperty("display_name", out var dp)
                ? dp.GetString() : "";

            var tracks = new List<object>();
            string? nextUrl = null;

            // Parse first page — Spotify embeds tracks under root.tracks.items
            if (root.TryGetProperty("tracks", out var tracksPage))
            {
                ParsePage(tracksPage, tracks);
                if (tracksPage.TryGetProperty("next", out var nxt) && nxt.ValueKind == JsonValueKind.String)
                    nextUrl = nxt.GetString();
            }

            // Step 3: paginate remaining pages
            while (!string.IsNullOrEmpty(nextUrl))
            {
                var pageResp = await http.GetAsync(nextUrl);
                if (!pageResp.IsSuccessStatusCode) break;

                using var pageDoc = JsonDocument.Parse(await pageResp.Content.ReadAsStringAsync());
                ParsePage(pageDoc.RootElement, tracks);

                if (pageDoc.RootElement.TryGetProperty("next", out var nxt2) && nxt2.ValueKind == JsonValueKind.String)
                    nextUrl = nxt2.GetString();
                else
                    nextUrl = null;
            }

            return Ok(new { name = playlistName, owner = ownerName, total = tracks.Count, tracks });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = $"Помилка: {ex.Message}" });
        }
    }

    private static void ParsePage(JsonElement page, List<object> tracks)
    {
        if (!page.TryGetProperty("items", out var items)) return;

        foreach (var item in items.EnumerateArray())
        {
            if (!item.TryGetProperty("track", out var t) || t.ValueKind == JsonValueKind.Null) continue;

            var title = t.TryGetProperty("name", out var tn) ? tn.GetString() ?? "Unknown" : "Unknown";
            var durationMs = t.TryGetProperty("duration_ms", out var dm) ? dm.GetInt32() : 0;

            var artistNames = new List<string>();
            if (t.TryGetProperty("artists", out var arr))
                foreach (var a in arr.EnumerateArray())
                    if (a.TryGetProperty("name", out var an))
                        artistNames.Add(an.GetString() ?? "");

            var artist = artistNames.Count > 0 ? string.Join(", ", artistNames) : "Unknown Artist";
            var firstArtist = artistNames.Count > 0 ? artistNames[0] : artist;

            var album = "";
            string? coverUrl = null;
            if (t.TryGetProperty("album", out var alb))
            {
                album = alb.TryGetProperty("name", out var aln) ? aln.GetString() ?? "" : "";
                // images array is sorted largest → smallest by Spotify
                if (alb.TryGetProperty("images", out var imgs) && imgs.GetArrayLength() > 0)
                    coverUrl = imgs[0].TryGetProperty("url", out var iu) ? iu.GetString() : null;
            }

            tracks.Add(new
            {
                title,
                artist,
                album,
                durationMs,
                coverUrl,
                query = $"ytsearch1:{firstArtist} - {title} audio"
            });
        }
    }
}
