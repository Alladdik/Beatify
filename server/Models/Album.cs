namespace BeatifyServer.Models;

public class Album
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public int ArtistId { get; set; }
    public Artist? Artist { get; set; }
    public string? CoverPath { get; set; }
    public int Year { get; set; } = DateTime.UtcNow.Year;
    public string? Genre { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Track> Tracks { get; set; } = new List<Track>();
}
