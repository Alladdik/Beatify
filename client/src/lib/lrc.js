// LRC → [{ time, text }]. Lines without a timestamp get time 0 (plain, unsynced lyrics).
export function parseLRC(lrc) {
  if (!lrc) return [];
  const out = [];
  const stamp = /\[(\d{1,2}):(\d{2}(?:[.:]\d{1,3})?)\]/g;
  for (const raw of lrc.split(/\r?\n/)) {
    const times = [];
    let m;
    stamp.lastIndex = 0;
    while ((m = stamp.exec(raw)) !== null) times.push(+m[1] * 60 + parseFloat(m[2].replace(':', '.')));
    const text = raw.replace(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g, '').replace(/^\[[a-zA-Z]+:[^\]]*\]$/, '').trim();
    if (!text && !times.length) continue;
    if (times.length) times.forEach((t) => out.push({ time: t, text }));
    else if (text) out.push({ time: 0, text });
  }
  return out.sort((a, b) => a.time - b.time);
}

export const isSyncedLyrics = (lines) => lines.length > 0 && lines.some((l) => l.time > 0);

export function activeLineIndex(lines, t) {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (t >= lines[i].time - 0.15) idx = i; else break;
  }
  return idx;
}
