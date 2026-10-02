import { create } from 'zustand';

// Transient UI state shared between the shell, the player and the command palette.
// dockTab: which panel is docked on the right ('queue' | 'lyrics' | 'sound' | 'devices') or null.
export const useUiStore = create((set) => ({
  dockTab: null,
  nowPlayingOpen: false,
  cmdOpen: false,
  trackMenu: null, // { track, x, y, context }
  shortcutsOpen: false,
  miniPlayerOpen: false,
  midiOpen: false,
  videoOpen: false,

  openDock: (tab) => set({ dockTab: tab }),
  closeDock: () => set({ dockTab: null }),
  toggleDock: (tab) => set((s) => ({ dockTab: s.dockTab === tab ? null : tab })),

  openNowPlaying: () => set({ nowPlayingOpen: true }),
  closeNowPlaying: () => set({ nowPlayingOpen: false }),

  openCmd: () => set({ cmdOpen: true }),
  closeCmd: () => set({ cmdOpen: false }),
  toggleCmd: () => set((s) => ({ cmdOpen: !s.cmdOpen })),

  openTrackMenu: (track, x, y, context = {}) => set({ trackMenu: { track, x, y, context } }),
  closeTrackMenu: () => set({ trackMenu: null }),

  toggleShortcuts: () => set((s) => ({ shortcutsOpen: !s.shortcutsOpen })),
  setMiniPlayer: (v) => set({ miniPlayerOpen: v }),
  setMidi: (v) => set({ midiOpen: v }),
  setVideo: (v) => set({ videoOpen: v }),
}));
