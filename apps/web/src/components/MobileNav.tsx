'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/i18n';
import type { ZhCnKey } from '@/lib/locales/zhCn';

interface BottomNavItem {
  key: ZhCnKey;
  icon: string;
  href: string;
}

const BOTTOM_NAV: BottomNavItem[] = [
  { key: 'nav.dashboard', icon: '🏠', href: '/dashboard' },
  { key: 'nav.content', icon: '📝', href: '/content' },
  { key: 'nav.analytics', icon: '📈', href: '/analytics' },
  { key: 'nav.reports', icon: '📋', href: '/reports' },
  { key: 'nav.settings', icon: '⋯', href: '/settings' },
];

export default function MobileNav() {
  const { t } = useT();
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_3px_rgba(0,0,0,0.06)]">
      {BOTTOM_NAV.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 py-2 px-3 min-w-[56px] text-xs transition ${
              active
                ? 'text-indigo-600 font-medium'
                : 'text-slate-400 active:text-slate-600'
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span>{t(item.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
