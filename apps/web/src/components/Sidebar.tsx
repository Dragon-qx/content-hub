'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊', href: '/dashboard' },
  { key: 'content', label: 'Content', icon: '📝', href: '/content' },
  { key: 'media', label: 'Media', icon: '🖼️', href: '/media' },
  { key: 'scheduler', label: 'Scheduler', icon: '📅', href: '/scheduler' },
  { key: 'workflow', label: 'Approvals', icon: '🔄', href: '/workflow' },
  { key: 'analytics', label: 'Analytics', icon: '📈', href: '/analytics' },
  { key: 'accounts', label: 'Accounts', icon: '🔗', href: '/accounts' },
  { key: 'teams', label: 'Teams', icon: '👥', href: '/teams' },
  { key: 'audit', label: 'Audit log', icon: '🛡️', href: '/audit' },
  { key: 'settings', label: 'Settings', icon: '⚙️', href: '/settings' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar hidden w-60 flex-shrink-0 flex-col text-white lg:flex">
      <div className="px-6 py-6 text-lg font-bold tracking-wide">
        ContentHub
      </div>
      <nav className="mt-2 flex flex-1 flex-col gap-1 px-3">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? 'bg-white/15 text-white'
                  : 'text-indigo-200 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-6 py-4 text-xs text-indigo-300">v1.0</div>
    </aside>
  );
}
