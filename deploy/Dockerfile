# ── Beatify — production image ────────────────────────────────────────────────
# Build from the repo root:  docker build -f deploy/Dockerfile .

# Stage 1: build the React client (web target)
FROM node:22-alpine AS client-build
WORKDIR /src/client
COPY client/package.json client/package-lock.json ./
RUN npm ci || npm install
COPY client/ ./
RUN npm run build:web

# Stage 2: publish the .NET server
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS server-build
WORKDIR /src/server
COPY server/BeatifyServer.csproj ./
RUN dotnet restore
COPY server/ ./
RUN dotnet publish -c Release -o /publish --no-restore

# Stage 3: runtime — ASP.NET + ffmpeg + yt-dlp
FROM mcr.microsoft.com/dotnet/aspnet:10.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# YouTube changes often and a stale yt-dlp answers 403. The update scripts pass today's date,
# so a rebuild on a new day re-downloads the latest release instead of reusing the cached layer.
ARG YTDLP_REFRESH=0
RUN echo "yt-dlp refresh: ${YTDLP_REFRESH}" \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app
COPY --from=server-build /publish ./
COPY --from=client-build /src/client/dist-web /app/spa

# Uploads (tracks, covers) and Studio projects live on volumes
RUN mkdir -p /app/wwwroot/uploads /data/studio && chown -R app:app /app /data
USER app

ENV ASPNETCORE_URLS=http://+:5000 \
    ASPNETCORE_ENVIRONMENT=Production \
    SPA_ROOT=/app/spa \
    Studio__Path=/data/studio
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://localhost:5000/healthz || exit 1
ENTRYPOINT ["dotnet", "BeatifyServer.dll"]
