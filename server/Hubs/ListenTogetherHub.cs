using Microsoft.AspNetCore.SignalR;

namespace BeatifyServer.Hubs;

/// <summary>
/// SignalR hub for collaborative (synchronized) listening sessions.
/// Rooms are identified by a short roomId (e.g. 4-char code).
/// </summary>
public class ListenTogetherHub : Hub
{
    // roomId → { connectionId → userName }
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<
        string,
        System.Collections.Concurrent.ConcurrentDictionary<string, string>> RoomUsers = new();

    private static List<string> GetMemberNames(string roomId)
    {
        if (RoomUsers.TryGetValue(roomId, out var users))
            return users.Values.Distinct().ToList();
        return new List<string>();
    }

    /// <summary>Join a room and notify all members.</summary>
    public async Task JoinRoom(string roomId, string userName)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, roomId);

        var users = RoomUsers.GetOrAdd(roomId, _ => new());
        users[Context.ConnectionId] = userName;

        // Send the full updated member list to everyone in the room
        await Clients.Group(roomId).SendAsync("MembersUpdated", GetMemberNames(roomId));
    }

    /// <summary>Leave a room explicitly.</summary>
    public async Task LeaveRoom(string roomId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomId);

        if (RoomUsers.TryGetValue(roomId, out var users))
        {
            users.TryRemove(Context.ConnectionId, out _);
            if (users.IsEmpty) RoomUsers.TryRemove(roomId, out _);
        }

        await Clients.Group(roomId).SendAsync("MembersUpdated", GetMemberNames(roomId));
    }

    /// <summary>Broadcast playback state to other room members.</summary>
    public async Task SyncState(string roomId, object state)
    {
        await Clients.OthersInGroup(roomId).SendAsync("ReceiveState", state);
    }

    /// <summary>Clean up on disconnect (tab closed, network drop, etc.).</summary>
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        foreach (var kvp in RoomUsers)
        {
            var roomId = kvp.Key;
            var users  = kvp.Value;
            if (users.TryRemove(Context.ConnectionId, out _))
            {
                if (users.IsEmpty) RoomUsers.TryRemove(roomId, out _);
                await Clients.Group(roomId).SendAsync("MembersUpdated", GetMemberNames(roomId));
            }
        }

        await base.OnDisconnectedAsync(exception);
    }
}
