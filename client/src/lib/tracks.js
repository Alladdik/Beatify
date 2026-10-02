// A queue holds two kinds of items:
//  • library tracks    { id: 42, title, artistName, coverPath, ... }
//  • external tracks   { id: null, isExternal: true, source: 'youtube'|'soundcloud', externalUrl, thumbnail, ... }
// These helpers make every component treat both the same way.

export const isExternal = (t) => !!t && (t.isExternal === true || (t.id == null && !!(t.source || t.externalUrl || t.webpage_url)));

export function normalizeExternal(item) {
  if (!item) return null;
  const url = item.externalUrl || item.webpage_url;
  const source = item.source || (url && url.includes('soundcloud') ? 'soundcloud' : 'youtube');
  return {
    id: null,
    isExternal: true,
    source,
    externalUrl: url,
    title: item.title || 'Без назви',
    artistName: item.artistName || item.artist || item.uploader || 'Невідомий виконавець',
    thumbnail: item.thumbnail || null,
    coverPath: null,
    duration: item.duration || 0,
    albumTitle: null,
    mediaType: 'audio',
    lyrics: null,
    key: `ext:${source}:${item.id || url}`,
  };
}

export const trackKey = (t, i = 0) => (t?.id != null ? `t${t.id}` : t?.key || `x${i}`);

export const sameTrack = (a, b) => {
  if (!a || !b) return false;
  if (a.id != null || b.id != null) return a.id === b.id;
  return (a.externalUrl || a.key) === (b.externalUrl || b.key);
};

export const sourceLabel = (t) => {
  if (!t) return '';
  if (t.source === 'soundcloud') return 'SC';
  if (t.source === 'youtube') return 'YT';
  if (t.mediaType === 'video') return 'VID';
  return '';
};

export function shareUrl(track) {
  if (!track) return '';
  if (track.id != null) return `${window.location.origin}/track/${track.id}`;
  return track.externalUrl || '';
}
