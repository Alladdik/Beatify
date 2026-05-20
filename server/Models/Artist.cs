namespace BeatifyServer.Models;

public class Artist
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? ImagePath { get; set; }
    public string? Bio { get; set; }
    public string? Genre { get; set; }
    public int MonthlyListeners { get; set; } = 0;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public int? UserId { get; set; }
    public User? User { get; set; }

    public ICollection<Track> Tracks { get; set; } = new List<Track>();
    public ICollection<Album> Albums { get; set; } = new List<Album>();
}
