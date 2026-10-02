import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { statsApi } from '../api';
import { fileUrl } from '../lib/config';
import { formatCount, formatTotalDuration, pluralUk } from '../lib/format';
import { usePlayerStore } from '../store/playerStore';
import Cover from '../components/ui/Cover';
import Tile from '../components/Tile';
import { Section, Shelf, EmptyState, SkeletonRows } from '../components/Section';

const dm = (iso) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; };

export default function StatsPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['stats'], queryFn: () => statsApi.get().then((r) => r.data), staleTime: 60_000 });

  const daily = useMemo(() => (data?.dailyPlays ?? []).map((d) => ({ ...d, label: dm(d.date) })), [data]);
  // hours are stored in UTC — shift them into the listener's own day
  const hours = useMemo(() => {
    const utc = data?.hourlyUtc ?? new Array(24).fill(0);
    const off = -new Date().getTimezoneOffset() / 60;
    return utc.map((_, h) => utc[(((h - off) % 24) + 24) % 24]);
  }, [data]);
  const peak = Math.max(1, ...hours);
  const busiest = hours.indexOf(Math.max(...hours));
  const top = data?.topTracks ?? [];
  const maxPlays = Math.max(1, ...top.map((t) => t.playCount || 0));

  if (isLoading) return <div className="page"><h1 className="display">Статистика</h1><SkeletonRows /></div>;
  if (isError || !data) return <div className="page"><EmptyState title="Статистика недоступна" text="Не вдалося її завантажити. Спробуйте за хвилину." /></div>;
  if (!data.totalPlays) return <div className="page"><h1 className="display">Статистика</h1><EmptyState title="Поки нічого рахувати" text="Послухайте кілька треків — і тут з’являться ваші виконавці, години прослуховування та найактивніший час доби." action={<Link className="btn primary" to="/">Слухати</Link>} /></div>;

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="display">Статистика</h1>
        <p className="facts">
          <span><b>{formatCount(data.totalPlays)}</b>{pluralUk(data.totalPlays, ['прослуховування', 'прослуховування', 'прослуховувань'])}</span>
          <span><b>{formatCount(data.uniqueTracks)}</b>різних треків</span>
          {data.minutes > 0 && <span><b>{formatTotalDuration(data.minutes * 60)}</b>музики</span>}
          {data.totalPlays > 5 && <span>найактивніше о <b style={{ marginLeft: 5 }}>{String(busiest).padStart(2, '0')}:00</b></span>}
        </p>
      </header>

      {daily.length > 0 && (
        <Section title="Останні 30 днів">
          <div style={{ height: 220, marginLeft: -12 }} role="img" aria-label="Графік прослуховувань по днях">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: 'var(--fg-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={{ stroke: 'var(--line)' }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: 'var(--fg-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
                <Tooltip cursor={{ stroke: 'var(--line-2)' }} contentStyle={{ background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 4, fontSize: 12 }} labelStyle={{ color: 'var(--fg-3)' }} itemStyle={{ color: 'var(--accent-text)' }} formatter={(v) => [v, 'разів']} />
                <Area type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={2} fill="var(--accent)" fillOpacity={0.14} dot={false} activeDot={{ r: 4, fill: 'var(--accent)' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      <Section title="Коли ви слухаєте">
        <div className="hours" role="img" aria-label="Активність за годинами доби">
          {hours.map((n, h) => (
            <div key={h} className="hour" title={`${String(h).padStart(2, '0')}:00 — ${n}`}>
              <i style={{ height: `${Math.max(3, (n / peak) * 100)}%`, opacity: n ? 1 : 0.25 }} />
              {h % 6 === 0 && <span className="mono">{String(h).padStart(2, '0')}</span>}
            </div>
          ))}
        </div>
      </Section>

      {top.length > 0 && (
        <Section title="Топ треків">
          <div className="rows no-album">
            {top.map((t, i) => (
              <div key={t.id ?? i} className="row" onDoubleClick={() => t.id && usePlayerStore.getState().playQueue(top.map((x) => ({ ...x, artistName: x.artistName })), i)}>
                <div className="row-idx"><span className="n">{i + 1}</span></div>
                <div className="row-main">
                  <Cover src={fileUrl('covers', t.coverPath)} title={t.title} className="row-art" />
                  <div className="row-text"><div className="row-title"><span className="trunc">{t.title}</span></div><div className="row-sub">{t.artistName}</div></div>
                </div>
                <div className="stat-bar" aria-hidden="true"><i style={{ width: `${(t.playCount / maxPlays) * 100}%` }} /></div>
                <div className="row-time">{t.playCount}×</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.topArtists?.length > 0 && (
        <Section title="Топ виконавців">
          <Shelf>
            {data.topArtists.map((a) => (
              <Tile key={a.id} to={`/artist/${a.id}`} round art={<Cover src={fileUrl('artists', a.imagePath)} title={a.name} round />} title={a.name} sub={`${a.playCount} ${pluralUk(a.playCount, ['прослуховування', 'прослуховування', 'прослуховувань'])}`} />
            ))}
          </Shelf>
        </Section>
      )}
    </div>
  );
}
