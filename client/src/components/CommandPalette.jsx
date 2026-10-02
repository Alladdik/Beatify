import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search, House, Compass, Library, Users, Piano, MicVocal, Gamepad2, CloudDownload, Heart, Clock,
  BarChart3, User, Sun, SlidersHorizontal, ListMusic, Keyboard, Shield, CornerDownLeft, Disc3,
} from 'lucide-react';
import Cover from './ui/Cover';
import { useUiStore } from '../store/uiStore';
import { usePlayerStore } from '../store/playerStore';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import { searchApi } from '../api';

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

// Ctrl/⌘ K — jump anywhere, play anything, flip a switch.
export default function CommandPalette() {
  const open = useUiStore((s) => s.cmdOpen);
  const close = useUiStore((s) => s.closeCmd);
  const ui = useUiStore;
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  const list = useRef(null);
  const dq = useDebounced(q.trim(), 160);

  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);

  const { data: found } = useQuery({
    queryKey: ['cmd-search', dq],
    queryFn: () => searchApi.search(dq).then((r) => r.data),
    enabled: open && dq.length >= 2,
    staleTime: 30_000,
  });

  const go = (to) => () => navigate(to);
  const commands = useMemo(() => {
    const p = () => usePlayerStore.getState();
    const c = [
      { id: 'home', label: 'Головна', icon: House, run: go('/') },
      { id: 'search', label: 'Пошук', icon: Search, run: go('/search') },
      { id: 'discovery', label: 'Відкриття', icon: Compass, run: go('/discovery') },
      { id: 'library', label: 'Бібліотека', icon: Library, run: go('/library') },
      { id: 'together', label: 'Слухати разом', icon: Users, run: go('/listen-together') },
      { id: 'studio', label: 'Студія: створити музику', icon: Piano, run: go('/studio') },
      { id: 'karaoke', label: 'Караоке', icon: MicVocal, run: go('/karaoke') },
      { id: 'quiz', label: 'Музична вікторина', icon: Gamepad2, run: go('/quiz') },
      { id: 'offline', label: 'Офлайн', icon: CloudDownload, run: go('/offline') },
      { id: 'liked', label: 'Вподобані', icon: Heart, run: go('/liked') },
      { id: 'history', label: 'Історія прослуховувань', icon: Clock, run: go('/history') },
      { id: 'stats', label: 'Моя статистика', icon: BarChart3, run: go('/stats') },
      { id: 'profile', label: 'Профіль і налаштування', icon: User, run: go('/profile') },
      { id: 'queue', label: 'Показати чергу', icon: ListMusic, run: () => ui.getState().openDock('queue') },
      { id: 'sound', label: 'Налаштувати звук (8D, EQ)', icon: SlidersHorizontal, run: () => ui.getState().openDock('sound') },
      { id: 'theme', label: 'Змінити тему (темна / світла / системна)', icon: Sun, run: () => useThemeStore.getState().cycle() },
      { id: 'keys', label: 'Гарячі клавіші', icon: Keyboard, run: () => ui.getState().toggleShortcuts() },
      { id: 'scene-concert', label: 'Звук: Арена 8D', icon: SlidersHorizontal, run: () => p().setPreset('concert') },
      { id: 'scene-club', label: 'Звук: Клуб', icon: SlidersHorizontal, run: () => p().setPreset('club') },
      { id: 'scene-retro', label: 'Звук: Lo-Fi стрічка', icon: SlidersHorizontal, run: () => p().setPreset('retro') },
      { id: 'scene-none', label: 'Звук: Оригінал', icon: SlidersHorizontal, run: () => p().setPreset('none') },
    ];
    if (user?.role === 'admin') c.push({ id: 'admin', label: 'Адмін-панель', icon: Shield, run: go('/admin') });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  const items = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const out = [];
    if (found) {
      (found.tracks || []).slice(0, 6).forEach((t) => out.push({ id: `t${t.id}`, group: 'Треки', label: t.title, sub: t.artistName, track: t, run: () => usePlayerStore.getState().playQueue(found.tracks, found.tracks.indexOf(t)) }));
      (found.artists || []).slice(0, 3).forEach((a) => out.push({ id: `a${a.id}`, group: 'Виконавці', label: a.name, sub: 'Виконавець', art: <Cover title={a.name} round />, run: go(`/artist/${a.id}`) }));
      (found.albums || []).slice(0, 3).forEach((a) => out.push({ id: `al${a.id}`, group: 'Альбоми', label: a.title, sub: a.artistName, icon: Disc3, run: go(`/album/${a.id}`) }));
    }
    const cmds = ql ? commands.filter((c) => c.label.toLowerCase().includes(ql)) : commands.slice(0, 9);
    cmds.forEach((c) => out.push({ ...c, group: 'Команди' }));
    if (ql.length >= 2) out.push({ id: 'full-search', group: 'Шукати скрізь', label: `Шукати «${q.trim()}» у бібліотеці, YouTube та SoundCloud`, icon: Search, run: go(`/search?q=${encodeURIComponent(q.trim())}`) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, found, commands]);

  useEffect(() => { setSel(0); }, [items.length, q]);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [sel]);

  if (!open) return null;

  const choose = (item) => { close(); item?.run?.(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(items[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  let lastGroup = null;
  return (
    <div className="cmdk-back" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="cmdk" role="dialog" aria-label="Швидкий пошук і команди" onKeyDown={onKey}>
        <div className="cmdk-input">
          <Search size={18} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Трек, виконавець, сторінка або команда…" aria-label="Пошук" />
          <span className="kbd">Esc</span>
        </div>
        <div className="cmdk-list" ref={list} role="listbox">
          {items.length === 0 && <div className="muted" style={{ padding: 20, fontSize: '0.9rem' }}>Нічого не знайдено</div>}
          {items.map((item, i) => {
            const head = item.group !== lastGroup ? <div key={`g${item.group}${i}`} className="cmdk-group label">{item.group}</div> : null;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <React.Fragment key={item.id}>
                {head}
                <button role="option" aria-selected={i === sel} className="cmdk-item" onMouseMove={() => setSel(i)} onClick={() => choose(item)}>
                  {item.track ? <Cover track={item.track} /> : item.art ? <span className="cover round" style={{ width: 30 }}>{item.art}</span> : Icon ? <Icon size={18} /> : null}
                  <span className="trunc">{item.label}</span>
                  {item.sub && <small className="trunc">{item.sub}</small>}
                  {i === sel && !item.sub && <CornerDownLeft size={14} style={{ marginLeft: 'auto' }} />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
