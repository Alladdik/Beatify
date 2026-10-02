using System.IO.Compression;
using System.Text;
using System.Threading.RateLimiting;
using BeatifyServer.Data;
using BeatifyServer.Hubs;
using BeatifyServer.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.ResponseCompression;
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

// ── Database (PostgreSQL) ─────────────────────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// ── Auth ──────────────────────────────────────────────────────────────────────
const string SampleJwtKey = "THIS_IS_A_VERY_SIMPLE_SECRET_KEY_123456789";
var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Jwt:Key is missing from configuration");
if (jwtKey.Length < 32)
    throw new InvalidOperationException("Jwt:Key must be at least 32 characters.");
if (builder.Environment.IsProduction() && jwtKey == SampleJwtKey)
    Console.WriteLine("[SECURITY] Jwt:Key is the public sample key. Set Jwt__Key to a long random secret before exposing this server.");

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
            ClockSkew = TimeSpan.FromMinutes(2)
        };
        options.Events = new JwtBearerEvents
        {
            // Browsers can't set headers on WebSockets / SSE — SignalR passes the token in the query string
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) && ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                    ctx.Token = token;
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddScoped<JwtService>();
builder.Services.AddScoped<RecommendationService>();
builder.Services.AddScoped<LyricsService>();
builder.Services.AddHttpClient();
builder.Services.AddMemoryCache();
builder.Services.AddControllers();
builder.Services.AddSignalR();

// ── Uploads up to 512 MB (tracks / video) ─────────────────────────────────────
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 536_870_912);
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = 536_870_912);

// ── Compression for the SPA and JSON (never audio — it is already compressed) ─
builder.Services.AddResponseCompression(o =>
{
    o.EnableForHttps = true;
    o.Providers.Add<BrotliCompressionProvider>();
    o.Providers.Add<GzipCompressionProvider>();
    o.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(new[] { "image/svg+xml", "application/manifest+json" });
});
builder.Services.Configure<BrotliCompressionProviderOptions>(o => o.Level = CompressionLevel.Fastest);

// ── Rate limiting: brute-force on auth, abuse of yt-dlp-backed endpoints ──────
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
    {
        var p = ctx.Request.Path.Value ?? "";
        var ip = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        if (p.StartsWith("/api/auth/login") || p.StartsWith("/api/auth/register"))
            return RateLimitPartition.GetFixedWindowLimiter($"auth:{ip}", _ => new FixedWindowRateLimiterOptions { PermitLimit = 15, Window = TimeSpan.FromMinutes(1) });
        if (p.StartsWith("/api/externalsearch") && !p.StartsWith("/api/externalsearch/proxy") && !p.StartsWith("/api/externalsearch/fetchlyrics"))
            return RateLimitPartition.GetFixedWindowLimiter($"ext:{ip}", _ => new FixedWindowRateLimiterOptions { PermitLimit = 90, Window = TimeSpan.FromMinutes(1) });
        if (p.StartsWith("/api/") && !p.Contains("/stream"))
            return RateLimitPartition.GetFixedWindowLimiter($"api:{ip}", _ => new FixedWindowRateLimiterOptions { PermitLimit = 1500, Window = TimeSpan.FromMinutes(1) });
        return RateLimitPartition.GetNoLimiter("static");
    });
});

// ── CORS: same-origin needs none; apps (Electron/Capacitor/dev server) need it ─
var corsOrigins = (builder.Configuration["Cors:Origins"] ?? "")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        if (corsOrigins.Length > 0) policy.WithOrigins(corsOrigins);
        else policy.SetIsOriginAllowed(_ => true);
        policy.AllowAnyHeader().AllowAnyMethod().AllowCredentials()
              .WithExposedHeaders("Content-Range", "Accept-Ranges", "Content-Length");
    });
});

builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

var app = builder.Build();

app.UseForwardedHeaders();
app.UseResponseCompression();
// CORS first: uploaded covers/audio are fetched cross-origin by the dev server, Electron and Capacitor shells
app.UseCors();

// ── Auto-migrate ──────────────────────────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

// Ensure upload directories exist under wwwroot
foreach (var dir in new[] { "covers", "tracks", "artists", "avatars", "videos", "studio" })
    Directory.CreateDirectory(Path.Combine(app.Environment.WebRootPath, "uploads", dir));

// Security headers
app.Use(async (ctx, next) =>
{
    var h = ctx.Response.Headers;
    h["X-Content-Type-Options"] = "nosniff";
    h["Referrer-Policy"] = "strict-origin-when-cross-origin";
    h["X-Frame-Options"] = "SAMEORIGIN";
    h["Permissions-Policy"] = "microphone=(self), camera=(), geolocation=()";
    await next();
});

// Uploaded media (covers / audio) from wwwroot/uploads
var contentTypeProvider = new FileExtensionContentTypeProvider();
contentTypeProvider.Mappings[".m4a"] = "audio/mp4";
contentTypeProvider.Mappings[".webm"] = "audio/webm";
contentTypeProvider.Mappings[".flac"] = "audio/flac";
contentTypeProvider.Mappings[".opus"] = "audio/opus";
contentTypeProvider.Mappings[".webmanifest"] = "application/manifest+json";

app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = contentTypeProvider,
    OnPrepareResponse = ctx =>
    {
        var p = ctx.File.PhysicalPath ?? "";
        // Images are content-addressed (GUID names) → cache hard; audio is streamed, revalidate cheaply
        ctx.Context.Response.Headers.CacheControl =
            p.Contains("covers") || p.Contains("artists") || p.Contains("avatars")
                ? "public,max-age=2592000,immutable"
                : "public,max-age=3600";
    }
});

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/healthz", async (AppDbContext db) =>
    await db.Database.CanConnectAsync() ? Results.Ok(new { status = "ok" }) : Results.StatusCode(503));

app.MapControllers();
app.MapHub<ListenTogetherHub>("/hubs/listentogether");
app.MapHub<CollaborativeHub>("/hubs/collaborative");
app.MapHub<DeviceSyncHub>("/hubs/devicesync");

// ── Serve React SPA (client/dist-web) ─────────────────────────────────────────
// Dev layout: server/../client/dist-web.  Docker layout: SPA_ROOT or /client/dist-web.
var spaRoot = Environment.GetEnvironmentVariable("SPA_ROOT")
    ?? Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "../client/dist-web"));

if (Directory.Exists(spaRoot))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(spaRoot),
        RequestPath = "",
        ContentTypeProvider = contentTypeProvider,
        OnPrepareResponse = ctx =>
        {
            // Vite fingerprints everything in /assets → immutable. Shell files must always revalidate
            // (otherwise a deploy keeps serving the old index.html / service worker for a day).
            var name = ctx.File.Name;
            ctx.Context.Response.Headers.CacheControl =
                ctx.Context.Request.Path.StartsWithSegments("/assets")
                    ? "public,max-age=31536000,immutable"
                    : (name is "sw.js" or "index.html" or "manifest.json" ? "no-cache" : "public,max-age=86400");
        }
    });

    // SPA fallback: any non-API/hub/upload path returns index.html
    app.MapFallback(async ctx =>
    {
        var p = ctx.Request.Path.Value ?? "";
        if (p.StartsWith("/api") || p.StartsWith("/hubs") || p.StartsWith("/uploads"))
        {
            ctx.Response.StatusCode = 404;
            return;
        }
        var indexFile = Path.Combine(spaRoot, "index.html");
        if (File.Exists(indexFile))
        {
            ctx.Response.ContentType = "text/html; charset=utf-8";
            ctx.Response.Headers.CacheControl = "no-cache";
            await ctx.Response.SendFileAsync(indexFile);
        }
    });

    Console.WriteLine("[SPA] Serving React app from: " + spaRoot);
}
else
{
    Console.WriteLine("[SPA] client build not found — run `npm run build:web` in /client to enable the web UI.");
}

// ── Print network URLs ────────────────────────────────────────────────────────
if (!app.Environment.IsProduction() || Environment.GetEnvironmentVariable("BEATIFY_BANNER") == "1")
{
    var ip = System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces()
        .SelectMany(i => i.GetIPProperties().UnicastAddresses)
        .Where(a => a.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork
                 && !System.Net.IPAddress.IsLoopback(a.Address)
                 && (a.Address.ToString().StartsWith("192.") || a.Address.ToString().StartsWith("10.")))
        .Select(a => a.Address.ToString())
        .FirstOrDefault() ?? "YOUR_LOCAL_IP";
    Console.WriteLine($"Beatify → http://localhost:5000  ·  phone: http://{ip}:5000");
}

app.Run();
