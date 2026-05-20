using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

namespace BeatifyServer.Hubs;

/// <summary>
/// Hub for Network Handoff — syncing playback state across multiple devices/tabs.
/// Each user gets a "session" identified by userId. Devices register and can request/transfer playback.
/// </summary>
public class DeviceSyncHub : Hub
{
    // userId → { connectionId → deviceName }
    private static readonly ConcurrentDictionary<string, ConcurrentDictionary<string, string>> UserDevices = new();

    private string UserId => Context.UserIdentifier ?? Context.ConnectionId;

    private List<object> GetUserDevices(string userId)
    {
        if (!UserDevices.TryGetValue(userId, out var devices)) return new();
        return devices.Select(kv => (object)new { connectionId = kv.Key, name = kv.Value }).ToList();
    }

    public async Task RegisterDevice(string deviceName)
    {
        var userId = UserId;
        var devices = UserDevices.GetOrAdd(userId, _ => new());
        devices[Context.ConnectionId] = deviceName;
        await Groups.AddToGroupAsync(Context.ConnectionId, $"user-{userId}");
        await Clients.Group($"user-{userId}").SendAsync("DevicesUpdated", GetUserDevices(userId));
    }

    public async Task BroadcastState(object state)
    {
        await Clients.OthersInGroup($"user-{UserId}").SendAsync("ReceiveState", state);
    }

    public async Task RequestHandoff(string targetConnectionId)
    {
        // Ask target device to transfer its playback state
        await Clients.Client(targetConnectionId).SendAsync("HandoffRequested", Context.ConnectionId);
    }

    public async Task SendHandoffState(string targetConnectionId, object state)
    {
        await Clients.Client(targetConnectionId).SendAsync("HandoffReceived", state);
    }

    public override async Task OnDisconnectedAsync(Exception? ex)
    {
        var userId = UserId;
        if (UserDevices.TryGetValue(userId, out var devices))
        {
            devices.TryRemove(Context.ConnectionId, out _);
            if (devices.IsEmpty) UserDevices.TryRemove(userId, out _);
            await Clients.Group($"user-{userId}").SendAsync("DevicesUpdated", GetUserDevices(userId));
        }
        await base.OnDisconnectedAsync(ex);
    }
}
