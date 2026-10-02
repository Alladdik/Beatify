namespace BeatifyServer.Models;

public class User
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = "user"; // "user" or "admin"
    public string? AvatarPath { get; set; }

    // Permissions the admin hands out. Admin role implies both.
    public bool CanUpload { get; set; }                 // publish own audio files to the catalog
    public bool CanImport { get; set; }                 // pull tracks into the catalog from YouTube / SoundCloud links
    public bool IsBlocked { get; set; }                 // cannot sign in; existing tokens stop working
    public DateTime? UploadRequestedAt { get; set; }    // the user asked the admin for upload rights
    public DateTime? UploadDeniedAt { get; set; }       // the admin said no to that request (the user can ask again)
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Playlist> Playlists { get; set; } = new List<Playlist>();
    public ICollection<LikedTrack> LikedTracks { get; set; } = new List<LikedTrack>();
    public ICollection<ListeningHistory> ListeningHistory { get; set; } = new List<ListeningHistory>();
}
