'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import LoginForm from '@/components/LoginForm';

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { t } = useT();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!loading) setChecked(true);
  }, [loading]);

  useEffect(() => {
    if (checked && !user) {
      router.replace('/login');
    }
  }, [checked, user, router]);

  if (loading || !checked) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        {t('common.loading')}
      </div>
    );
  }

  if (!user) return <LoginForm />;

  return <>{children}</>;
}
