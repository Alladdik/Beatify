using Microsoft.AspNetCore.SignalR;

namespace BeatifyServer.Hubs;

/// <summary>
/// Hub for real-time collaborative playlist editing.
/// Clients join a room per playlist and receive live updates when tracks are added/removed/reordered.
/// </summary>
public class CollaborativeHub : Hub
{
    // playlistId → { connectionId → userName }
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<
        string,
        System.Collections.Concurrent.ConcurrentDictionary<string, string>> Viewers = new();

    private static List<object> GetViewers(string playlistId) =>
        Viewers.TryGetValue(playlistId, out var users)
            ? users.Select(kv => (object)new { name = kv.Value }).Distinct().ToList()
            : new();

    public async Task JoinPlaylist(string playlistId, string userName)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, playlistId);
        var users = Viewers.GetOrAdd(playlistId, _ => new());
        users[Context.ConnectionId] = userName;
        await Clients.Group(playlistId).SendAsync("ViewersUpdated", GetViewers(playlistId));
    }

    public async Task LeavePlaylist(string playlistId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, playlistId);
        if (Viewers.TryGetValue(playlistId, out var users))
        {
            users.TryRemove(Context.ConnectionId, out _);
            if (users.IsEmpty) Viewers.TryRemove(playlistId, out _);
        }
        await Clients.Group(playlistId).SendAsync("ViewersUpdated", GetViewers(playlistId));
    }

    /// <summary>Broadcast a playlist change (track added/removed/reordered) to all viewers.</summary>
    public async Task PlaylistChanged(string playlistId, string changeType, object data)
    {
        await Clients.OthersInGroup(playlistId).SendAsync("PlaylistChanged", changeType, data);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        foreach (var kvp in Viewers)
        {
            var id = kvp.Key;
            var users = kvp.Value;
            if (users.TryRemove(Context.ConnectionId, out _))
            {
                if (users.IsEmpty) Viewers.TryRemove(id, out _);
                await Clients.Group(id).SendAsync("ViewersUpdated", GetViewers(id));
            }
        }
        await base.OnDisconnectedAsync(exception);
    }
}
