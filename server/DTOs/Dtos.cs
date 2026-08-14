namespace BeatifyServer.DTOs;

// Auth
public record RegisterDto(string Email, string Password, string Name);
public record LoginDto(string Email, string Password);
public record AuthResponseDto(string Token, UserDto User);

// User
public record UserDto(int Id, string Email, string Name, string Role, string? AvatarPath, int? ArtistId);
public record UpdateUserDto(string? Name, string? Email);

// Artist
public record ArtistDto(int Id, string Name, string? ImagePath, string? Bio, string? Genre, int MonthlyListeners, int TrackCount);
public record CreateArtistDto(string Name, string? Bio, string? Genre);

// Album
public record AlbumDto(int Id, string Title, int ArtistId, string ArtistName, string? CoverPath, int Year, string? Genre, int TrackCount);
public record CreateAlbumDto(string Title, int ArtistId, int? Year, string? Genre);

// Track
public record TrackDto(
    int Id, string Title,
    int? ArtistId, string ArtistName,
    int? AlbumId, string? AlbumTitle,
    string? CoverPath, int Duration,
    string? Genre, int PlayCount, bool IsExplicit,
    bool IsLiked, DateTime CreatedAt,
    string? Lyrics, string MediaType);

public record CreateTrackDto(string Title, int? ArtistId, int? AlbumId, string? Genre, bool IsExplicit, int Duration, string? Lyrics, string? MediaType);
public record UpdateTrackDto(string? Title, int? ArtistId, int AlbumId, string? Genre, bool IsExplicit, string? Lyrics);

// Playlist
public record PlaylistDto(int Id, int UserId, string UserName, string Title, string? Description, string? CoverPath, bool IsPublic, bool IsCollaborative, int TrackCount, DateTime CreatedAt);
public record CreatePlaylistDto(string Title, string? Description, bool IsPublic, bool IsCollaborative = false);
public record UpdatePlaylistDto(string? Title, string? Description, bool? IsPublic, bool? IsCollaborative);
public record AddTrackToPlaylistDto(int TrackId);
public record ReorderPlaylistDto(List<int> TrackIds);

// Search
public record SearchResultDto(List<TrackDto> Tracks, List<ArtistDto> Artists, List<AlbumDto> Albums, List<PlaylistDto> Playlists);

// Player
public record PlaybackLogDto(int TrackId);

// Download
public record DownloadRequestDto(string Url, string? Title, string? ArtistName, int? ArtistId, int? AlbumId, string? Genre, string? CoverUrl);
public record DownloadPlaylistRequestDto(string Url, string? AlbumTitle, string? ArtistName, int? ArtistId, string? Genre);
