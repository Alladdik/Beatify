# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(One React codebase ships as a PWA, an Electron desktop app, and a Capacitor mobile wrapper. `mobile/src` is currently a near-copy of `client/src`.)

## Users

Public audience: people who want a music streaming service, listening on desktop (Electron / browser) and phone (PWA / Capacitor). Interface language is Ukrainian.

## Product Purpose

Beatify is a full-stack music streaming service: a catalog of artists, albums, and tracks, personal playlists and likes, and listening experiences around the music. Success means listeners choose Beatify over a generic streamer because it does more with the music than play it.

## Positioning

Beatify combines four things a plain streamer keeps separate, and the owner wants all four treated as the product's heart together:

- **Sound**: DSP modes, 8D audio, audio effects / equalizer, MIDI visualizer.
- **Social**: Listen Together rooms and real-time sync across devices (SignalR).
- **Play**: karaoke with lyrics and a music quiz.
- **Library**: catalog import (Spotify, SoundCloud), offline downloads, listening history and stats.

## Operating Context

Long listening sessions with the player always present; frequent short navigation between home, search, artist/album/playlist pages. Desktop app window with custom title bar; mobile with bottom navigation, mini player, and fullscreen player. Media Session API and a floating mini player.

## Capabilities and Constraints

- Stack: React 19 + Vite, React Router, TanStack Query, Zustand, lucide-react icons, recharts; ASP.NET Core backend with SignalR; Electron shell; Capacitor mobile.
- Album-art color extraction already drives a dynamic background (`useAlbumColor`).
- Styling today is ~1,400 lines of global CSS plus ~1,500 inline `style={{}}` objects and ~280 hard-coded hex colors in JSX; a redesign must move styling into tokens/classes.
- Admin area (download, Spotify import, SoundCloud, artist hunter) exists for operators.
- Owner has released all visual constraints: name, logo, theme, and navigation structure may all change.

## Brand Commitments

Name: Beatify. No binding visual assets; the current logo and green accent are not commitments.

## Evidence on Hand

Real catalog content from the running backend (artists, albums, covers, play counts). No testimonials, user numbers, or press; do not invent them.

## Product Principles

1. The music leads: covers, sound, and the now-playing track are the richest things on screen.
2. Every signature feature (sound, social, play, library) is reachable and visible, not buried in menus.
3. Listening never gets interrupted by navigation; the player is a permanent citizen of the layout.
4. One codebase, three shells: decisions must hold on desktop and phone.
