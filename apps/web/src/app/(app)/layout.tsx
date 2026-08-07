'use client';

import { ReactNode, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import AuthGuard from '@/components/AuthGuard';
import MobileNav from '@/components/MobileNav';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { t } = useT();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-slate-50 text-slate-800">
        {/* Sidebar - hidden on mobile, slides in when open */}
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex flex-1 flex-col min-w-0">
          <Topbar user={user} onMenuClick={() => setSidebarOpen(v => !v)} />
          <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 pb-20 md:pb-8">{children}</main>
        </div>
        {/* Bottom navigation - mobile only */}
        <MobileNav />
      </div>
    </AuthGuard>
  );
}
