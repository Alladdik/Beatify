# 🎵 Beatify — Spotify Clone

Full-stack music streaming platform built with React + ASP.NET Core + SQLite + Electron.

## Stack
- **Frontend**: React.js (Vite) 
- **Backend**: ASP.NET Core 8 Web API
- **Database**: SQLite (Entity Framework Core)
- **Desktop**: Electron
- **Auth**: JWT Bearer Tokens

## Project Structure
```
spotify-clone/
├── client/          # React frontend
├── server/          # ASP.NET Core backend
├── electron/        # Electron desktop launcher
└── uploads/         # Local audio/image storage
```

## Setup & Run

### Backend
```bash
cd server
dotnet restore
dotnet run
```

### Frontend
```bash
cd client
npm install
npm run dev
```

### Electron
```bash
cd electron
npm install
npm start
```
