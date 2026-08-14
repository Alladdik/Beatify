# ── Beatify — production image ────────────────────────────────────────────────
# Build from the repo root:  docker build -f deploy/Dockerfile .

# Stage 1: build React client (web target)
FROM node:22-alpine AS client-build
WORKDIR /src/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build:web

# Stage 2: publish .NET server
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS server-build
WORKDIR /src/server
COPY server/BeatifyServer.csproj ./
RUN dotnet restore
COPY server/ ./
RUN rm -rf bin obj && dotnet publish -c Release -o /publish

# Stage 3: runtime — ASP.NET + ffmpeg + yt-dlp
FROM mcr.microsoft.com/dotnet/aspnet:10.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
 && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=server-build /publish ./
# Program.cs serves the SPA from ../client/dist-web relative to the app dir
COPY --from=client-build /src/client/dist-web /client/dist-web

ENV ASPNETCORE_URLS=http://+:5000
EXPOSE 5000
ENTRYPOINT ["dotnet", "BeatifyServer.dll"]
