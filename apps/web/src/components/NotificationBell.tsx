'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Notification, NOTIFICATION_TONE, Paginated } from '@/lib/types';

/** Maps a notification type to a small visual tone. */
function toneClasses(tone: 'neutral' | 'success' | 'warning' | 'danger') {
  const map = {
    neutral: 'bg-slate-100 text-slate-500',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
  };
  return map[tone];
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await api.get<Paginated<Notification> & { unreadCount: number }>(
        '/notifications?skip=0&take=10',
      );
      setItems(res.items ?? []);
      setUnread(res.unreadCount ?? 0);
    } catch {
      // Silently ignore — the bell must never break the shell.
    }
  };

  // Poll for new notifications while the dropdown is open (and refresh the
  // badge on mount so unread counts are fresh when the user signs in).
  useEffect(() => {
    load();
    if (!open) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const markAll = async () => {
    setLoading(true);
    try {
      await api.patch('/notifications/read-all', {});
      await load();
    } finally {
      setLoading(false);
    }
  };

  const markOne = async (id: string) => {
    await api.patch(`/notifications/${id}/read`, {});
    await load();
  };

  const go = (n: Notification) => {
    if (!n.read) markOne(n.id);
    if (n.link) window.location.href = n.link;
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            {unread > 0 && (
              <button
                onClick={markAll}
                disabled={loading}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">No notifications.</div>
          ) : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => go(n)}
                    className={`flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-slate-50 ${n.read ? '' : 'bg-indigo-50/40'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${toneClasses(NOTIFICATION_TONE[n.type])}`}>
                        {n.type}
                      </span>
                      <span className="flex-1 truncate text-sm font-medium text-slate-800">{n.title}</span>
                    </div>
                    <span className="line-clamp-2 text-xs text-slate-500">{n.body}</span>
                    <span className="text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
