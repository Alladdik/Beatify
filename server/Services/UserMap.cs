using BeatifyServer.DTOs;
using BeatifyServer.Models;

namespace BeatifyServer.Services;

public static class UserMap
{
    /// <summary>The user as the client sees it. Admins can always upload and import, so the flags say so.</summary>
    public static UserDto ToDto(this User u, int? artistId) =>
        new(u.Id, u.Email, u.Name, u.Role, u.AvatarPath, artistId,
            u.CanUpload || u.Role == "admin",
            u.CanImport || u.Role == "admin",
            u.UploadRequestedAt != null && !u.CanUpload && u.Role != "admin",
            u.UploadDeniedAt != null && u.UploadRequestedAt == null && !u.CanUpload && u.Role != "admin");
}
