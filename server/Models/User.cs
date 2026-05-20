namespace BeatifyServer.Models;

public class User
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = "user"; // "user" or "admin"
    public string? AvatarPath { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Playlist> Playlists { get; set; } = new List<Playlist>();
    public ICollection<LikedTrack> LikedTracks { get; set; } = new List<LikedTrack>();
    public ICollection<ListeningHistory> ListeningHistory { get; set; } = new List<ListeningHistory>();
}
