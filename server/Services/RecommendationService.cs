using BeatifyServer.Data;
using BeatifyServer.DTOs;
using BeatifyServer.Models;
using Microsoft.EntityFrameworkCore;

namespace BeatifyServer.Services;

/// <summary>
/// Smart picks without genre metadata: similarity is learned from how people actually use the catalogue —
/// same artist/album, playlists that share tracks, users who like or play the same things,
/// plus a popularity prior. Everything is computed from the database on demand (the catalogue is small enough).
/// </summary>
public class RecommendationService
{
    private readonly AppDbContext _db;
    public RecommendationService(AppDbContext db) => _db = db;

    // ── Mapping ──────────────────────────────────────────────────────────────
    public static TrackDto ToDto(Track t, HashSet<int> liked) =>
        new(t.Id, t.Title, t.ArtistId, t.Artist?.Name ?? "—", t.AlbumId, t.Album?.Title,
            t.CoverPath, t.Duration, t.Genre, t.PlayCount, t.IsExplicit,
            liked.Contains(t.Id), t.CreatedAt, null, t.MediaType);

    public async Task<HashSet<int>> LikedIdsAsync(int? userId) =>
        userId is null ? new() : (await _db.LikedTracks.Where(l => l.UserId == userId).Select(l => l.TrackId).ToListAsync()).ToHashSet();

    private async Task<List<Track>> LoadAsync(IEnumerable<int> ids)
    {
        var list = ids.Distinct().ToList();
        var tracks = await _db.Tracks.AsNoTracking().Include(t => t.Artist).Include(t => t.Album)
            .Where(t => list.Contains(t.Id)).ToListAsync();
        var order = list.Select((id, i) => (id, i)).ToDictionary(x => x.id, x => x.i);
        return tracks.OrderBy(t => order[t.Id]).ToList();
    }

    // Keep playlists/mixes varied: at most `perArtist` tracks from one artist in a row of results
    private static List<int> Diversify(List<Track> ranked, int limit, int perArtist = 3)
    {
        var count = new Dictionary<int, int>();
        var outIds = new List<int>();
        foreach (var t in ranked)
        {
            var key = t.ArtistId ?? -t.Id;
            count[key] = count.GetValueOrDefault(key) + 1;
            if (count[key] > perArtist) continue;
            outIds.Add(t.Id);
            if (outIds.Count >= limit) break;
        }
        return outIds;
    }

    // ── Similar tracks ───────────────────────────────────────────────────────
    public async Task<List<TrackDto>> SimilarAsync(int trackId, int? userId, int limit)
    {
        var seed = await _db.Tracks.AsNoTracking().FirstOrDefaultAsync(t => t.Id == trackId);
        if (seed == null) return new();

        var score = new Dictionary<int, double>();
        void Add(int id, double s) { if (id != trackId) score[id] = score.GetValueOrDefault(id) + s; }

        // 1) Same artist / album
        if (seed.ArtistId != null)
        {
            var same = await _db.Tracks.AsNoTracking()
                .Where(t => t.ArtistId == seed.ArtistId && t.Id != trackId)
                .Select(t => new { t.Id, t.AlbumId, t.PlayCount }).ToListAsync();
            foreach (var t in same)
                Add(t.Id, 1.0 + (seed.AlbumId != null && t.AlbumId == seed.AlbumId ? 0.6 : 0) + Math.Log10(1 + t.PlayCount) * 0.15);
        }

        // 2) Tracks that share playlists with the seed
        var playlistIds = await _db.PlaylistTracks.Where(pt => pt.TrackId == trackId).Select(pt => pt.PlaylistId).Distinct().ToListAsync();
        if (playlistIds.Count > 0)
        {
            var neighbours = await _db.PlaylistTracks
                .Where(pt => playlistIds.Contains(pt.PlaylistId) && pt.TrackId != trackId)
                .GroupBy(pt => pt.TrackId)
                .Select(g => new { Id = g.Key, N = g.Select(x => x.PlaylistId).Distinct().Count() })
                .ToListAsync();
            foreach (var n in neighbours) Add(n.Id, 0.8 + 0.4 * n.N);
        }

        // 3) People who liked the seed also liked…
        var likers = await _db.LikedTracks.Where(l => l.TrackId == trackId).Select(l => l.UserId).ToListAsync();
        if (likers.Count > 0)
        {
            var co = await _db.LikedTracks.Where(l => likers.Contains(l.UserId) && l.TrackId != trackId)
                .GroupBy(l => l.TrackId).Select(g => new { Id = g.Key, N = g.Count() }).ToListAsync();
            foreach (var c in co) Add(c.Id, 0.7 + 0.5 * c.N);
        }

        // 4) …and people who played the seed also played
        var listeners = await _db.ListeningHistory.Where(h => h.TrackId == trackId).Select(h => h.UserId).Distinct().Take(300).ToListAsync();
        if (listeners.Count > 0)
        {
            var co = await _db.ListeningHistory.Where(h => listeners.Contains(h.UserId) && h.TrackId != trackId)
                .GroupBy(h => h.TrackId).Select(g => new { Id = g.Key, N = g.Select(x => x.UserId).Distinct().Count() }).ToListAsync();
            foreach (var c in co) Add(c.Id, 0.45 + 0.35 * c.N);
        }

        // 5) Popularity prior so the list is never empty on a young catalogue
        if (score.Count < limit * 2)
        {
            var popular = await _db.Tracks.AsNoTracking().Where(t => t.Id != trackId)
                .OrderByDescending(t => t.PlayCount).Take(limit * 3).Select(t => new { t.Id, t.PlayCount }).ToListAsync();
            foreach (var p in popular) Add(p.Id, 0.05 + Math.Log10(1 + p.PlayCount) * 0.08);
        }

        // Personal taste: favour what this listener hasn't just heard, lean toward their favourite artists
        if (userId != null)
        {
            var recent = (await _db.ListeningHistory.Where(h => h.UserId == userId).OrderByDescending(h => h.PlayedAt)
                .Select(h => h.TrackId).Take(25).ToListAsync()).ToHashSet();
            foreach (var id in recent) if (score.ContainsKey(id)) score[id] *= 0.35;
        }

        var topIds = score.OrderByDescending(kv => kv.Value).Take(limit * 4).Select(kv => kv.Key).ToList();
        var tracks = await LoadAsync(topIds);
        var ranked = tracks.OrderByDescending(t => score[t.Id]).ToList();
        var liked = await LikedIdsAsync(userId);
        return (await LoadAsync(Diversify(ranked, limit))).Select(t => ToDto(t, liked)).ToList();
    }

    // ── Artist affinity ──────────────────────────────────────────────────────
    private async Task<Dictionary<int, double>> ArtistAffinityAsync(int userId)
    {
        var aff = new Dictionary<int, double>();
        var plays = await _db.ListeningHistory.Where(h => h.UserId == userId && h.Track!.ArtistId != null)
            .GroupBy(h => h.Track!.ArtistId!.Value).Select(g => new { Id = g.Key, N = g.Count() }).ToListAsync();
        foreach (var p in plays) aff[p.Id] = aff.GetValueOrDefault(p.Id) + p.N;
        var likes = await _db.LikedTracks.Where(l => l.UserId == userId && l.Track!.ArtistId != null)
            .GroupBy(l => l.Track!.ArtistId!.Value).Select(g => new { Id = g.Key, N = g.Count() }).ToListAsync();
        foreach (var l in likes) aff[l.Id] = aff.GetValueOrDefault(l.Id) + l.N * 3;
        return aff;
    }

    /// <summary>Artists that tend to appear with `artistId` (same playlists, same listeners' libraries).</summary>
    public async Task<Dictionary<int, double>> SimilarArtistScoresAsync(int artistId)
    {
        var sim = new Dictionary<int, double>();

        var inPlaylists = await _db.PlaylistTracks.Where(pt => pt.Track!.ArtistId == artistId).Select(pt => pt.PlaylistId).Distinct().ToListAsync();
        if (inPlaylists.Count > 0)
        {
            var co = await _db.PlaylistTracks.Where(pt => inPlaylists.Contains(pt.PlaylistId) && pt.Track!.ArtistId != null && pt.Track.ArtistId != artistId)
                .GroupBy(pt => pt.Track!.ArtistId!.Value).Select(g => new { Id = g.Key, N = g.Select(x => x.PlaylistId).Distinct().Count() }).ToListAsync();
            foreach (var c in co) sim[c.Id] = sim.GetValueOrDefault(c.Id) + c.N * 1.2;
        }

        var fans = await _db.LikedTracks.Where(l => l.Track!.ArtistId == artistId).Select(l => l.UserId).Distinct().ToListAsync();
        if (fans.Count > 0)
        {
            var co = await _db.LikedTracks.Where(l => fans.Contains(l.UserId) && l.Track!.ArtistId != null && l.Track.ArtistId != artistId)
                .GroupBy(l => l.Track!.ArtistId!.Value).Select(g => new { Id = g.Key, N = g.Select(x => x.UserId).Distinct().Count() }).ToListAsync();
            foreach (var c in co) sim[c.Id] = sim.GetValueOrDefault(c.Id) + c.N * 1.0;
        }

        var listeners = await _db.ListeningHistory.Where(h => h.Track!.ArtistId == artistId).Select(h => h.UserId).Distinct().Take(300).ToListAsync();
        if (listeners.Count > 0)
        {
            var co = await _db.ListeningHistory.Where(h => listeners.Contains(h.UserId) && h.Track!.ArtistId != null && h.Track.ArtistId != artistId)
                .GroupBy(h => h.Track!.ArtistId!.Value).Select(g => new { Id = g.Key, N = g.Select(x => x.UserId).Distinct().Count() }).ToListAsync();
            foreach (var c in co) sim[c.Id] = sim.GetValueOrDefault(c.Id) + c.N * 0.6;
        }
        return sim;
    }

    public async Task<List<ArtistDto>> SimilarArtistsAsync(int artistId, int limit)
    {
        var sim = await SimilarArtistScoresAsync(artistId);
        var ids = sim.OrderByDescending(kv => kv.Value).Take(limit).Select(kv => kv.Key).ToList();
        if (ids.Count < limit)
        {
            // Fill with the busiest artists so the shelf is never empty
            var fill = await _db.Artists.AsNoTracking().Where(a => a.Id != artistId && !ids.Contains(a.Id) && a.Tracks.Any())
                .OrderByDescending(a => a.Tracks.Sum(t => t.PlayCount)).Take(limit - ids.Count).Select(a => a.Id).ToListAsync();
            ids.AddRange(fill);
        }
        return await ArtistCardsAsync(ids);
    }

    public async Task<List<ArtistDto>> ArtistCardsAsync(List<int> ids)
    {
        if (ids.Count == 0) return new();
        var rows = await _db.Artists.AsNoTracking().Where(a => ids.Contains(a.Id))
            .Select(a => new
            {
                a.Id, a.Name, a.ImagePath, a.Bio, a.Genre, a.MonthlyListeners,
                TrackCount = a.Tracks.Count,
                Covers = a.Tracks.Where(t => t.CoverPath != null).OrderByDescending(t => t.PlayCount).Select(t => t.CoverPath!).Take(8).ToList()
            }).ToListAsync();
        var byId = rows.ToDictionary(r => r.Id);
        return ids.Where(byId.ContainsKey).Select(id =>
        {
            var r = byId[id];
            return new ArtistDto(r.Id, r.Name, r.ImagePath, r.Bio, r.Genre, r.MonthlyListeners, r.TrackCount, r.Covers.Distinct().Take(4).ToList());
        }).ToList();
    }

    // ── Mixes ────────────────────────────────────────────────────────────────
    private record MixResult(string Id, string Title, string Subtitle, List<Track> Tracks);

    private async Task<MixResult?> BuildMixAsync(string id, int? userId, int size = 40)
    {
        var rng = new Random(DateTime.UtcNow.DayOfYear * 31 + (userId ?? 0));

        if (id == "top" && userId != null)
        {
            var ids = await _db.ListeningHistory.Where(h => h.UserId == userId).GroupBy(h => h.TrackId)
                .OrderByDescending(g => g.Count()).Select(g => g.Key).Take(size).ToListAsync();
            return ids.Count == 0 ? null : new("top", "Ваш топ", "Те, що ви крутите найчастіше", await LoadAsync(ids));
        }

        if (id == "rewind" && userId != null)
        {
            var cutoff = DateTime.UtcNow.AddDays(-30);
            var recentlyPlayed = await _db.ListeningHistory.Where(h => h.UserId == userId && h.PlayedAt > cutoff).Select(h => h.TrackId).Distinct().ToListAsync();
            var liked = await _db.LikedTracks.Where(l => l.UserId == userId && !recentlyPlayed.Contains(l.TrackId)).Select(l => l.TrackId).ToListAsync();
            var played = await _db.ListeningHistory.Where(h => h.UserId == userId && !recentlyPlayed.Contains(h.TrackId))
                .GroupBy(h => h.TrackId).OrderByDescending(g => g.Count()).Select(g => g.Key).Take(size).ToListAsync();
            var pool = liked.Concat(played).Distinct().OrderBy(_ => rng.Next()).Take(size).ToList();
            return pool.Count < 3 ? null : new("rewind", "Згадати все", "Улюблене, яке ви давно не слухали", await LoadAsync(pool));
        }

        if (id == "fresh")
        {
            IQueryable<Track> q = _db.Tracks.AsNoTracking();
            if (userId != null)
            {
                var heard = _db.ListeningHistory.Where(h => h.UserId == userId).Select(h => h.TrackId);
                q = q.Where(t => !heard.Contains(t.Id));
            }
            var pool = await q.OrderByDescending(t => t.PlayCount).ThenByDescending(t => t.CreatedAt).Take(size * 2).Select(t => t.Id).ToListAsync();
            var ids = pool.OrderBy(_ => rng.Next()).Take(size).ToList();
            return ids.Count < 3 ? null : new("fresh", userId == null ? "Відкрийте для себе" : "Нове для вас", userId == null ? "Добірка з каталогу" : "Треки, яких ви ще не чули", await LoadAsync(ids));
        }

        if (id == "popular")
        {
            var ids = await _db.Tracks.AsNoTracking().OrderByDescending(t => t.PlayCount).Take(size).Select(t => t.Id).ToListAsync();
            return ids.Count == 0 ? null : new("popular", "Найпопулярніше", "Що слухають зараз", await LoadAsync(ids));
        }

        if (id.StartsWith("artist-") && int.TryParse(id[7..], out var artistId))
        {
            var artist = await _db.Artists.AsNoTracking().FirstOrDefaultAsync(a => a.Id == artistId);
            if (artist == null) return null;
            var sim = await SimilarArtistScoresAsync(artistId);
            var friends = sim.OrderByDescending(kv => kv.Value).Take(4).Select(kv => kv.Key).ToList();
            var own = await _db.Tracks.AsNoTracking().Where(t => t.ArtistId == artistId).OrderByDescending(t => t.PlayCount).Take(size).ToListAsync();
            var other = friends.Count == 0 ? new List<Track>() :
                await _db.Tracks.AsNoTracking().Include(t => t.Artist).Where(t => t.ArtistId != null && friends.Contains(t.ArtistId.Value)).OrderByDescending(t => t.PlayCount).Take(size).ToListAsync();
            // weave: 2 of theirs, 1 of a neighbour — it should feel like a station, not a discography
            var mixed = new List<Track>();
            int a = 0, b = 0;
            while (mixed.Count < size && (a < own.Count || b < other.Count))
            {
                for (int k = 0; k < 2 && a < own.Count; k++) mixed.Add(own[a++]);
                if (b < other.Count) mixed.Add(other[b++]);
            }
            var tracks = await LoadAsync(mixed.Select(t => t.Id));
            return tracks.Count < 2 ? null : new(id, $"Мікс: {artist.Name}", "Виконавець і схожі на нього", tracks);
        }

        if (id.StartsWith("daily-") && int.TryParse(id[6..], out var n) && userId != null)
        {
            var aff = await ArtistAffinityAsync(userId.Value);
            var seeds = aff.OrderByDescending(kv => kv.Value).Select(kv => kv.Key).ToList();
            if (seeds.Count == 0) return null;
            var seed = seeds[Math.Min(n - 1, seeds.Count - 1)];
            var inner = await BuildMixAsync($"artist-{seed}", userId, size);
            if (inner == null) return null;
            var names = inner.Tracks.Select(t => t.Artist?.Name).Where(x => x != null).Distinct().Take(3).ToList();
            return new($"daily-{n}", $"Мікс дня {n}", string.Join(", ", names) + (names.Count >= 3 ? " та інші" : ""), inner.Tracks);
        }

        return null;
    }

    public async Task<object?> MixAsync(string id, int? userId)
    {
        var mix = await BuildMixAsync(id, userId, 50);
        if (mix == null) return null;
        var liked = await LikedIdsAsync(userId);
        return new { mix.Id, mix.Title, mix.Subtitle, Tracks = mix.Tracks.Select(t => ToDto(t, liked)).ToList() };
    }

    // ── Home ─────────────────────────────────────────────────────────────────
    public async Task<object> HomeAsync(int? userId)
    {
        var liked = await LikedIdsAsync(userId);

        var stats = new
        {
            tracks = await _db.Tracks.CountAsync(),
            artists = await _db.Artists.CountAsync(a => a.Tracks.Any()),
            minutes = (await _db.Tracks.SumAsync(t => (int?)t.Duration) ?? 0) / 60,
        };

        List<TrackDto> recent = new();
        if (userId != null)
        {
            var recentIds = await _db.ListeningHistory.Where(h => h.UserId == userId).OrderByDescending(h => h.PlayedAt)
                .Select(h => h.TrackId).Take(60).ToListAsync();
            recent = (await LoadAsync(recentIds.Distinct().Take(12))).Select(t => ToDto(t, liked)).ToList();
        }

        // Mix ids to try, in order of how personal they are
        var mixIds = new List<string>();
        List<int> topArtistIds;
        if (userId != null)
        {
            var aff = await ArtistAffinityAsync(userId.Value);
            topArtistIds = aff.OrderByDescending(kv => kv.Value).Select(kv => kv.Key).Take(6).ToList();
            for (int i = 1; i <= Math.Min(3, topArtistIds.Count); i++) mixIds.Add($"daily-{i}");
            mixIds.Add("fresh"); mixIds.Add("rewind"); mixIds.Add("top");
        }
        else
        {
            topArtistIds = await _db.Artists.AsNoTracking().Where(a => a.Tracks.Any())
                .OrderByDescending(a => a.Tracks.Sum(t => t.PlayCount)).Select(a => a.Id).Take(6).ToListAsync();
            foreach (var a in topArtistIds.Take(3)) mixIds.Add($"artist-{a}");
            mixIds.Add("fresh"); mixIds.Add("popular");
        }

        var mixes = new List<object>();
        foreach (var id in mixIds)
        {
            var m = await BuildMixAsync(id, userId, 24);
            if (m == null) continue;
            mixes.Add(new
            {
                m.Id, m.Title, m.Subtitle,
                TrackCount = m.Tracks.Count,
                Covers = m.Tracks.Where(t => t.CoverPath != null).Select(t => t.CoverPath!).Distinct().Take(4).ToList(),
            });
        }

        // "Because you listened to …"
        object? because = null;
        if (topArtistIds.Count > 0)
        {
            var seedArtist = topArtistIds[0];
            var seedCard = (await ArtistCardsAsync(new() { seedArtist })).FirstOrDefault();
            var sim = (await SimilarArtistScoresAsync(seedArtist)).OrderByDescending(kv => kv.Value).Take(5).Select(kv => kv.Key).ToList();
            var pool = await _db.Tracks.AsNoTracking().Include(t => t.Artist).Include(t => t.Album)
                .Where(t => t.ArtistId != null && (sim.Contains(t.ArtistId.Value) || t.ArtistId == seedArtist))
                .OrderByDescending(t => t.PlayCount).Take(80).ToListAsync();
            var ids = Diversify(pool, 10, 2);
            if (seedCard != null && ids.Count > 0)
                because = new { artist = seedCard, tracks = (await LoadAsync(ids)).Select(t => ToDto(t, liked)).ToList() };
        }

        var artistsShelfIds = topArtistIds;
        if (userId != null && topArtistIds.Count > 0)
        {
            var more = (await SimilarArtistScoresAsync(topArtistIds[0])).OrderByDescending(kv => kv.Value).Select(kv => kv.Key).Take(6);
            artistsShelfIds = topArtistIds.Concat(more).Distinct().Take(10).ToList();
        }
        var artists = await ArtistCardsAsync(artistsShelfIds);

        var newReleases = (await _db.Tracks.AsNoTracking().Include(t => t.Artist).Include(t => t.Album)
            .OrderByDescending(t => t.CreatedAt).Take(12).ToListAsync()).Select(t => ToDto(t, liked)).ToList();
        var trending = (await _db.Tracks.AsNoTracking().Include(t => t.Artist).Include(t => t.Album)
            .OrderByDescending(t => t.PlayCount).Take(12).ToListAsync()).Select(t => ToDto(t, liked)).ToList();

        return new { stats, recent, mixes, because, artists, newReleases, trending };
    }
}
