'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊', href: '/dashboard' },
  { key: 'content', label: 'Content', icon: '📝', href: '/content' },
  { key: 'assistant', label: 'AI assistant', icon: '✨', href: '/assistant' },
  { key: 'calendar', label: 'Calendar', icon: '🗓️', href: '/content/calendar' },
  { key: 'media', label: 'Media', icon: '🖼️', href: '/media' },
  { key: 'scheduler', label: 'Scheduler', icon: '📅', href: '/scheduler' },
  { key: 'workflow', label: 'Approvals', icon: '🔄', href: '/workflow' },
  { key: 'analytics', label: 'Analytics', icon: '📈', href: '/analytics' },
  { key: 'reports', label: 'Reports', icon: '📋', href: '/reports' },
  { key: 'accounts', label: 'Accounts', icon: '🔗', href: '/accounts' },
  { key: 'teams', label: 'Teams', icon: '👥', href: '/teams' },
  { key: 'notifications', label: 'Notifications', icon: '🔔', href: '/notifications' },
  { key: 'engagement', label: 'Engagement', icon: '💬', href: '/engagement' },
  { key: 'audit', label: 'Audit log', icon: '🛡️', href: '/audit' },
  { key: 'settings', label: 'Settings', icon: '⚙️', href: '/settings' },
];

export default function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          sidebar fixed inset-y-0 left-0 z-50 w-64 flex-shrink-0 flex flex-col text-white
          transform transition-transform duration-200 ease-out
          md:relative md:translate-x-0 md:z-auto
          ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="px-6 py-6 text-lg font-bold tracking-wide flex items-center justify-between">
          <span>ContentHub</span>
          <button
            type="button"
            onClick={onClose}
            className="md:hidden p-1 text-indigo-200 hover:text-white"
            aria-label="Close navigation"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="16" y2="16" />
              <line x1="16" y1="4" x2="4" y2="16" />
            </svg>
          </button>
        </div>
        <nav className="mt-2 flex flex-1 flex-col gap-1 px-3 overflow-y-auto">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onClose}
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
    </>
  );
}
