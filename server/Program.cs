using System.Text;
using BeatifyServer.Data;
using BeatifyServer.Hubs;
using BeatifyServer.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;

// Winget installs yt-dlp to a path not in the default .NET child-process PATH — add it.
var wingetLinks = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
    "Microsoft", "WinGet", "Links");
if (Directory.Exists(wingetLinks))
{
    var path = Environment.GetEnvironmentVariable("PATH") ?? "";
    if (!path.Contains(wingetLinks))
        Environment.SetEnvironmentVariable("PATH", wingetLinks + Path.PathSeparator + path);
}

var builder = WebApplication.CreateBuilder(args);

// Ensure wwwroot exists so WebRootPath is never null
var wwwrootPath = Path.Combine(builder.Environment.ContentRootPath, "wwwroot");
Directory.CreateDirectory(wwwrootPath);
builder.Environment.WebRootPath = wwwrootPath;

// DB Config (PostgreSQL)
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Jwt:Key is missing from configuration");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(5)
        };
        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = ctx =>
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"[JWT FAIL] {ctx.Exception.GetType().Name}: {ctx.Exception.Message}");
                Console.ResetColor();
                return Task.CompletedTask;
            },
            OnTokenValidated = ctx =>
            {
                Console.WriteLine($"[JWT OK] user={ctx.Principal?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value}");
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddScoped<JwtService>();
builder.Services.AddHttpClient();
builder.Services.AddControllers();
builder.Services.AddSignalR();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials()  // required for SignalR WebSocket/SSE negotiation
              .WithExposedHeaders("Content-Range", "Accept-Ranges", "Content-Length");
    });
});

var app = builder.Build();

// Auto-migrate
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

// Ensure upload directories exist under wwwroot
foreach (var dir in new[] { "covers", "tracks", "artists", "avatars" })
    Directory.CreateDirectory(Path.Combine(app.Environment.WebRootPath, "uploads", dir));

// Serve wwwroot as static files with CORS + 1-day cache for images
var contentTypeProvider = new FileExtensionContentTypeProvider();
contentTypeProvider.Mappings[".m4a"]  = "audio/mp4";
contentTypeProvider.Mappings[".webm"] = "audio/webm";
contentTypeProvider.Mappings[".flac"] = "audio/flac";
contentTypeProvider.Mappings[".opus"] = "audio/opus";

app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = contentTypeProvider,
    OnPrepareResponse = ctx =>
    {
        var path = ctx.File.PhysicalPath ?? "";
        // Images: cache 7 days; audio: no cache (streamed via controller anyway)
        if (path.Contains("covers") || path.Contains("artists") || path.Contains("avatars"))
            ctx.Context.Response.Headers.Append("Cache-Control", "public,max-age=604800,immutable");
        else
            ctx.Context.Response.Headers.Append("Cache-Control", "public,max-age=3600");
    }
});

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<ListenTogetherHub>("/hubs/listentogether");
app.MapHub<CollaborativeHub>("/hubs/collaborative");
app.MapHub<DeviceSyncHub>("/hubs/devicesync");

app.Run();
