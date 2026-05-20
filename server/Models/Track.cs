namespace BeatifyServer.Models;

public class Track
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public int? ArtistId { get; set; }
    public Artist? Artist { get; set; }
    public int? AlbumId { get; set; }
    public Album? Album { get; set; }
    public string FilePath { get; set; } = string.Empty;
    public string? CoverPath { get; set; }
    public int Duration { get; set; } // seconds
    public string? Genre { get; set; }
    public string? Lyrics { get; set; }
    // "audio" | "video"
    public string MediaType { get; set; } = "audio";
    public int PlayCount { get; set; } = 0;
    public bool IsExplicit { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<PlaylistTrack> PlaylistTracks { get; set; } = new List<PlaylistTrack>();
    public ICollection<LikedTrack> LikedByUsers { get; set; } = new List<LikedTrack>();
    public ICollection<ListeningHistory> ListeningHistory { get; set; } = new List<ListeningHistory>();
}
