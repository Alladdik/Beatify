import { Monitor, Smartphone, ArrowRightLeft, Loader2, WifiOff } from 'lucide-react';
import { useDeviceStore } from '../../store/deviceStore';
import { useAuthStore } from '../../store/authStore';
import { Link } from 'react-router-dom';

const icon = (name = '') => (/iPhone|Android/.test(name) ? Smartphone : Monitor);

export default function DevicesPanel() {
  const { devices, connected, myId, transferring, takeOver } = useDeviceStore();
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return (
      <div className="empty" style={{ padding: 'var(--s-5)' }}>
        <div className="h2">Передача між пристроями</div>
        <p>Увійдіть в акаунт на ПК і телефоні — і перекидайте музику одним дотиком.</p>
        <Link className="btn primary" to="/login">Увійти</Link>
      </div>
    );
  }

  const others = devices.filter((d) => d.connectionId !== myId);

  return (
    <div style={{ padding: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <div className="note" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {connected ? <span className="eqbars paused" style={{ color: 'var(--ok)' }}><i /><i /><i /></span> : <WifiOff size={16} className="muted" />}
        <span>{connected ? `Підключено · пристроїв: ${devices.length}` : 'Підключення до сервера…'}</span>
      </div>

      <div>
        <div className="label" style={{ marginBottom: 8 }}>Цей пристрій</div>
        <div className="device on"><Monitor size={18} /><span>Зараз тут</span></div>
      </div>

      <div>
        <div className="label" style={{ marginBottom: 8 }}>Інші пристрої</div>
        {others.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.85rem' }}>Відкрийте Beatify на іншому пристрої з цим самим акаунтом — він з’явиться тут.</p>
        ) : others.map((d) => {
          const Icon = icon(d.name);
          return (
            <div key={d.connectionId} className="device">
              <Icon size={18} />
              <span className="trunc" style={{ flex: 1 }}>{d.name}</span>
              <button className="btn sm" disabled={transferring} onClick={() => takeOver(d)}>
                {transferring ? <Loader2 size={14} className="spin" /> : <ArrowRightLeft size={14} />} Перейняти
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
