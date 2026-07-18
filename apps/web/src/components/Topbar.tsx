'use client';

import { useAuth } from '@/lib/auth';
import { AuthUser } from '@/lib/types';
import NotificationBell from './NotificationBell';

export default function Topbar({ user, onMenuClick }: { user: AuthUser | null; onMenuClick?: () => void }) {
  const { logout } = useAuth();

  return (
    <header className="flex h-14 md:h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 lg:px-8 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg"
          aria-label="Toggle navigation"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="17" y2="6" />
            <line x1="3" y1="10" x2="17" y2="10" />
            <line x1="3" y1="14" x2="17" y2="14" />
          </svg>
        </button>
        <span className="text-sm text-slate-500 hidden sm:inline">Multi-platform content operations</span>
      </div>
      <div className="flex items-center gap-2 md:gap-4">
        <NotificationBell />
        <span className="text-xs md:text-sm text-slate-600 truncate max-w-[120px] md:max-w-none">
          {user ? `${user.name} · ${user.role}` : 'Guest'}
        </span>
        {user && (
          <button
            onClick={logout}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs md:px-3 md:text-sm text-slate-600 hover:bg-slate-50"
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}
