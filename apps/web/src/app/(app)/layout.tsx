'use client';

import { ReactNode } from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/lib/auth';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-slate-50 text-slate-800">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <Topbar user={user} />
          <main className="flex-1 overflow-auto p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
