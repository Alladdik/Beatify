import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { statsApi, fileUrl } from '../api';
import { BarChart2 } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${day}.${month}`;
}

export default function StatsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['stats'],
    queryFn: () => statsApi.get().then(r => r.data),
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        <p>Не вдалося завантажити статистику.</p>
      </div>
    );
  }

  const dailyPlays = Array.isArray(data.dailyPlays) ? data.dailyPlays.map(d => ({
    ...d,
    label: formatDate(d.date),
  })) : [];

  const topTracks = Array.isArray(data.topTracks) ? data.topTracks.slice(0, 10) : [];
  const topArtists = Array.isArray(data.topArtists) ? data.topArtists.slice(0, 10) : [];
  const maxCount = topTracks.length > 0 ? Math.max(...topTracks.map(t => t.playCount || 0)) : 1;

  return (
    <div className="main-content">
      {/* Header */}
      <div style={{ padding: '40px 32px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(29,185,84,0.15)', border: '1px solid rgba(29,185,84,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
          <BarChart2 size={24} />
        </div>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>Статистика</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>Ваша активність за останні 30 днів</p>
        </div>
      </div>

      <div className="content-body" style={{ paddingTop: 0 }}>

        {/* Stats cards */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160, background: 'var(--bg-elevated)', borderRadius: 16, padding: '20px 24px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>Всього прослухано</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--accent)' }}>{(data.totalPlays ?? 0).toLocaleString()}</div>
          </div>
          <div style={{ flex: 1, minWidth: 160, background: 'var(--bg-elevated)', borderRadius: 16, padding: '20px 24px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>Унікальних треків</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#a78bfa' }}>{(data.uniqueTracks ?? 0).toLocaleString()}</div>
          </div>
        </div>

        {/* Area chart: daily plays */}
        {dailyPlays.length > 0 && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: '24px', marginBottom: 32, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Щоденні прослуховування</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyPlays} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPlays" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1db954" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#1db954" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#1a1a24', border: '1px solid #27272a', borderRadius: 10, fontSize: 13 }}
                  labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                  itemStyle={{ color: '#1db954' }}
                />
                <Area type="monotone" dataKey="count" stroke="#1db954" strokeWidth={2} fill="url(#colorPlays)" dot={false} activeDot={{ r: 4, fill: '#1db954' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top tracks */}
        {topTracks.length > 0 && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: '24px', marginBottom: 32, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Топ треків</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topTracks.map((track, i) => {
                const barWidth = maxCount > 0 ? (track.playCount / maxCount) * 100 : 0;
                const cover = track.coverPath ? fileUrl('covers', track.coverPath) : null;
                return (
                  <div key={track.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 24, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-hover)' }}>
                      {cover
                        ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--accent-dim), var(--purple))' }} />
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.artistName}</div>
                    </div>
                    <div style={{ width: 120, flexShrink: 0 }}>
                      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${barWidth}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.6s ease' }} />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, textAlign: 'right' }}>{track.playCount} разів</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top artists */}
        {topArtists.length > 0 && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: '24px', marginBottom: 32, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Топ виконавців</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {topArtists.map((artist, i) => {
                const avatar = artist.imagePath ? fileUrl('artists', artist.imagePath) : null;
                return (
                  <div key={artist.id ?? i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 88 }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, var(--accent-dim), var(--purple))', flexShrink: 0 }}>
                      {avatar
                        ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: '#fff' }}>
                            {(artist.name || '?')[0].toUpperCase()}
                          </div>
                      }
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{artist.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{artist.playCount} разів</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
