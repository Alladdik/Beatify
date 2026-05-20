using System;
using System.Linq;
using System.Threading.Tasks;
using SpotifyAPI.Web;

string url = "https://open.spotify.com/playlist/3PYqHTa9kSMN6ivU5h8RUm?si=c88c2910ccea40af";
string clientId = "YOUR_CLIENT_ID";
string clientSecret = "YOUR_CLIENT_SECRET";

try
{
    var playlistId = url.Split("/playlist/").LastOrDefault()?.Split('?').FirstOrDefault()?.Trim('/');
    Console.WriteLine("Parsed ID: " + playlistId);

    var config = SpotifyClientConfig.CreateDefault();
    var tokenResponse = await new OAuthClient(config).RequestToken(new ClientCredentialsRequest(clientId, clientSecret));
    var spotify = new SpotifyClient(config.WithToken(tokenResponse.AccessToken));

    var playlist = await spotify.Playlists.Get(playlistId!);
    Console.WriteLine("Playlist Name: " + playlist.Name);

    if (playlist.Items == null)
    {
        Console.WriteLine("No items found (playlist may be empty or inaccessible).");
        return;
    }

    var allItems = await spotify.PaginateAll(playlist.Items);
    Console.WriteLine("Total Tracks: " + allItems.Count);

    foreach (var item in allItems.Take(5))
    {
        if (item.Track is FullTrack track)
            Console.WriteLine($"  - {track.Artists.FirstOrDefault()?.Name} — {track.Name}");
    }
}
catch (APIException ex)
{
    var code = ex.Response?.StatusCode;
    if (code == System.Net.HttpStatusCode.Unauthorized || code == System.Net.HttpStatusCode.Forbidden)
        Console.WriteLine("ERROR: Invalid credentials or access denied. Check your Client ID and Secret.");
    else if (code == System.Net.HttpStatusCode.NotFound)
        Console.WriteLine("ERROR: Playlist not found or is private.");
    else
        Console.WriteLine("ERROR (API): " + ex.Message);
}
catch (Exception ex)
{
    Console.WriteLine("ERROR: " + ex.Message);
}
