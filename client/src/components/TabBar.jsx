import { NavLink } from 'react-router-dom';
import { House, Search, Compass, Library, Ellipsis } from 'lucide-react';

const items = [
  { to: '/', end: true, icon: House, label: 'Головна' },
  { to: '/search', icon: Search, label: 'Пошук' },
  { to: '/discovery', icon: Compass, label: 'Відкриття' },
  { to: '/library', icon: Library, label: 'Бібліотека' },
  { to: '/more', icon: Ellipsis, label: 'Ще' },
];

export default function TabBar() {
  return (
    <nav className="tabbar" aria-label="Головна навігація">
      {items.map(({ to, end, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}>
          <Icon size={22} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
