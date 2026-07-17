'use client';

import { useAuth, AuthUser } from '@/lib/auth';

export default function Topbar({ user }: { user: AuthUser | null }) {
  const { logout } = useAuth();

  return (
    <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 lg:px-8">
      <div className="text-sm text-slate-500">Multi-platform content operations</div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-600">
          {user ? `${user.name} · ${user.role}` : 'Guest'}
        </span>
        {user && (
          <button
            onClick={logout}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}
