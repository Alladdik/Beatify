---
version: 1
slug: "client-src-app-jsx"
primary_target: "client/src/App.jsx"
related_targets: []
---

# Surface brief — Beatify app shell and all routes

Scope and mode: whole application, Operate (long listening sessions, short hops between catalog pages). Public Ukrainian-language audience on desktop (Electron/browser) and phone (PWA/Capacitor). One React codebase, three shells.

Constraints: PRODUCT.md. Functionality stays (sound/DSP, social, play, library). Name stays Beatify; every visual asset is replaceable. Real catalog: ~225 tracks, no genres, artists without photos (use cover collages), covers are the only photography.

Chosen direction: variable font specimen (user locked `challenger-specimen` in the 2026-10-01 direction round, code-led build path). Memorable moment: the title of the playing track is set in a variable face whose width and weight breathe with the actual audio spectrum; the DSP controls are laid out as specimen axes with live coordinate readouts.

Unresolved: none blocking. Illustration of artists is by cover collage, not invented photos.

## Direction contract

THESIS: Beatify is a type specimen of your own music. Hierarchy comes from scale contrast between an enormous variable display face and tiny monospace coordinates; sound drives the axes. It refuses the green-glow glass streamer: no gradient heroes, no emoji tiles, no shadows as depth.

OWN-WORLD: Two grounds, one system. "Lab" is ink near-black (#0c0c10) with hairline rules; "Plate" is cool near-white paper with ink text. One accent that is never fixed: it is the playing cover's hue, normalized to a legible lightness per theme, default lilac. Roboto Flex (width and weight axes) for everything spoken, Martian Mono for coordinates, counts, times and labels. Square covers with 2px radius; artists are the only circles. Rows over cards, hairlines over boxes, fills only for the one primary action and the active state.

STORY: A listener opens it and sees their own music laid out like a specimen sheet, understands in seconds that it is calm, precise and theirs, and starts playing in one click. Every signature feature (Sound axes, Together, Karaoke, Quiz, Library, Offline) is a named entry in the index, not a buried menu.

FIRST VIEWPORT: Desktop Home: a 248px index rail on the left with numbered entries (01 Головна, 02 Пошук, 03 Відкриття, 04 Бібліотека) and the playlists below; main sheet shows a 96px wide-light greeting that sets the tone, a mono strip of live coordinates (tracks, artists, hours, today's plays), then a continue row of square covers and typographic mix tiles. Player bar docked at the bottom with a full-width hairline scrubber; primary action is the filled accent Play on the first mix. Phone Home: same sheet in one column, tab bar of four entries, mini-player above it.

FORM: Variable font specimen (catalog world `variable-font-specimen`, user-pinned over the dice). Seed key 15bd5987 (direction roll, pin overrides assignment).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
