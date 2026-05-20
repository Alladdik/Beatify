namespace BeatifyServer.Models;

public class LikedTrack
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }
    public int TrackId { get; set; }
    public Track? Track { get; set; }
    public DateTime LikedAt { get; set; } = DateTime.UtcNow;
}
