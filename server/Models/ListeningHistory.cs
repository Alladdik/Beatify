namespace BeatifyServer.Models;

public class ListeningHistory
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }
    public int TrackId { get; set; }
    public Track? Track { get; set; }
    public DateTime PlayedAt { get; set; } = DateTime.UtcNow;
}
