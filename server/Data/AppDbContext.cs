using Microsoft.EntityFrameworkCore;
using BeatifyServer.Models;

namespace BeatifyServer.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Artist> Artists => Set<Artist>();
    public DbSet<Album> Albums => Set<Album>();
    public DbSet<Track> Tracks => Set<Track>();
    public DbSet<Playlist> Playlists => Set<Playlist>();
    public DbSet<PlaylistTrack> PlaylistTracks => Set<PlaylistTrack>();
    public DbSet<LikedTrack> LikedTracks => Set<LikedTrack>();
    public DbSet<ListeningHistory> ListeningHistory => Set<ListeningHistory>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(u => u.Email).IsUnique();
        });

        modelBuilder.Entity<PlaylistTrack>(entity =>
        {
            entity.HasOne(pt => pt.Playlist).WithMany(p => p.PlaylistTracks).HasForeignKey(pt => pt.PlaylistId);
            entity.HasOne(pt => pt.Track).WithMany(t => t.PlaylistTracks).HasForeignKey(pt => pt.TrackId);
        });

        modelBuilder.Entity<LikedTrack>(entity =>
        {
            entity.HasOne(lt => lt.User).WithMany(u => u.LikedTracks).HasForeignKey(lt => lt.UserId);
            entity.HasOne(lt => lt.Track).WithMany(t => t.LikedByUsers).HasForeignKey(lt => lt.TrackId);
            entity.HasIndex(lt => new { lt.UserId, lt.TrackId }).IsUnique();
        });

        modelBuilder.Entity<ListeningHistory>(entity =>
        {
            entity.HasOne(lh => lh.User).WithMany(u => u.ListeningHistory).HasForeignKey(lh => lh.UserId);
            entity.HasOne(lh => lh.Track).WithMany(t => t.ListeningHistory).HasForeignKey(lh => lh.TrackId);
        });

        modelBuilder.Entity<Track>(entity =>
        {
            entity.HasOne(t => t.Artist).WithMany(a => a.Tracks).HasForeignKey(t => t.ArtistId);
            entity.HasOne(t => t.Album).WithMany(a => a.Tracks).HasForeignKey(t => t.AlbumId).IsRequired(false);
        });

        modelBuilder.Entity<Album>(entity =>
        {
            entity.HasOne(a => a.Artist).WithMany(ar => ar.Albums).HasForeignKey(a => a.ArtistId);
        });

        modelBuilder.Entity<Playlist>(entity =>
        {
            entity.HasOne(p => p.User).WithMany(u => u.Playlists).HasForeignKey(p => p.UserId);
        });
    }
}
