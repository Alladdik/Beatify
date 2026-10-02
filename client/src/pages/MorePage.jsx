import { Link, useNavigate } from 'react-router-dom';
import {
  Users, Piano, MicVocal, Gamepad2, CloudDownload, Shield, Command, LogOut, LogIn,
  Sun, Moon, Monitor, ChevronRight, Clock, BarChart3, Download,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { useUiStore } from '../store/uiStore';
import { useTogetherStore } from '../store/togetherStore';
import { useOfflineStore } from '../store/offlineStore';
import { useInstallStore } from '../store/installStore';
import { fileUrl } from '../lib/config';

function Row({ to, icon: Icon, title, sub, onClick, danger }) {
  const inner = (
    <>
      <Icon size={21} />
      <span className="more-text"><span className="more-title">{title}</span>{sub && <span className="more-sub">{sub}</span>}</span>
      {to && <ChevronRight size={16} className="more-chev" />}
    </>
  );
  return to
    ? <Link to={to} className="more-row">{inner}</Link>
    : <button className={`more-row ${danger ? 'danger' : ''}`} onClick={onClick}>{inner}</button>;
}

/** Everything the desktop rail offers that doesn't fit the 4-tab phone bar. */
export default function MorePage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { pref, cycle } = useThemeStore();
  const openCmd = useUiStore((s) => s.openCmd);
  const room = useTogetherStore((s) => s.room);
  const installed = useInstallStore((s) => s.installed);
  const install = useInstallStore((s) => s.install);
  const offlineCount = useOfflineStore((s) => Object.keys(s.downloadedTracks).length);

  const ThemeIcon = pref === 'light' ? Sun : pref === 'dark' ? Moon : Monitor;
  const themeLabel = pref === 'light' ? 'Світла' : pref === 'dark' ? 'Темна' : 'Як у системі';

  return (
    <div className="page narrow more-page">
      <header className="page-head"><h1 className="display">Ще</h1></header>

      {user ? (
        <Link to="/profile" className="more-user">
          <span className="avatar lg">{user.avatarPath ? <img src={fileUrl('avatars', user.avatarPath)} alt="" /> : (user.name?.[0] || '?').toUpperCase()}</span>
          <span className="more-text">
            <span className="more-title">{user.name}</span>
            <span className="more-sub">{user.role === 'admin' ? 'Адміністратор' : user.artistId ? 'Виконавець' : 'Слухач'} · профіль і налаштування</span>
          </span>
          <ChevronRight size={16} className="more-chev" />
        </Link>
      ) : (
        <Link to="/login" className="more-user">
          <span className="avatar lg"><LogIn size={20} /></span>
          <span className="more-text"><span className="more-title">Увійти</span><span className="more-sub">Вподобані, плейлисти та синхронізація</span></span>
          <ChevronRight size={16} className="more-chev" />
        </Link>
      )}

      <div className="more-group">
        <div className="label">Слухай і грай</div>
        <Row to="/listen-together" icon={Users} title="Слухати разом" sub={room ? `Кімната ${room}` : 'Одночасно з друзями'} />
        <Row to="/studio" icon={Piano} title="Студія" sub="Створіть власну музику" />
        <Row to="/karaoke" icon={MicVocal} title="Караоке" sub="Текст у такт" />
        <Row to="/quiz" icon={Gamepad2} title="Вікторина" sub="Вгадайте трек" />
        <Row to="/offline" icon={CloudDownload} title="Офлайн" sub={offlineCount ? `${offlineCount} збережено` : 'Слухайте без мережі'} />
      </div>

      {user && (
        <div className="more-group">
          <div className="label">Ваше</div>
          <Row to="/history" icon={Clock} title="Історія" sub="Що ви слухали" />
          <Row to="/stats" icon={BarChart3} title="Статистика" sub="Виконавці й години" />
          {user.role === 'admin' && <Row to="/admin" icon={Shield} title="Адмінка" sub="Музика, імпорт, користувачі" />}
        </div>
      )}

      <div className="more-group">
        <div className="label">Застосунок</div>
        {!installed && <Row icon={Download} title="Встановити застосунок" sub="Ярлик на екрані, без адресного рядка" onClick={install} />}
        <Row icon={Command} title="Швидкий пошук і команди" onClick={openCmd} />
        <Row icon={ThemeIcon} title="Тема" sub={themeLabel} onClick={cycle} />
        {user && <Row icon={LogOut} title="Вийти" danger onClick={() => { logout(); navigate('/login'); }} />}
      </div>
    </div>
  );
}
