export function formatTime(s) {
  if (!s || !Number.isFinite(s) || s < 0) return '0:00';
  const total = Math.floor(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// 1 234 → "1 234", 12 400 → "12,4 тис."
export function formatCount(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} млн`;
  if (v >= 10_000) return `${(v / 1000).toFixed(1).replace('.', ',')} тис.`;
  return v.toLocaleString('uk-UA');
}

// Ukrainian plural: pluralUk(5, ['трек', 'треки', 'треків'])
export function pluralUk(n, forms) {
  const v = Math.abs(Number(n) || 0);
  const mod10 = v % 10;
  const mod100 = v % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export const tracksLabel = (n) => `${n} ${pluralUk(n, ['трек', 'треки', 'треків'])}`;

export function formatTotalDuration(seconds) {
  const m = Math.round((seconds || 0) / 60);
  if (m < 60) return `${m} хв`;
  const h = Math.floor(m / 60);
  return `${h} год ${m % 60} хв`;
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Тиха ніч';
  if (h < 12) return 'Доброго ранку';
  if (h < 18) return 'Добрий день';
  return 'Добрий вечір';
}

export function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'щойно';
  if (diff < 3600) return `${Math.floor(diff / 60)} хв тому`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} год тому`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} дн тому`;
  return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
}
