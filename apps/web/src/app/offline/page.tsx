'use client';

import { useT } from '@/lib/i18n';

export default function OfflinePage() {
  const { t } = useT();
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">📡</div>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">{t('offline.title')}</h1>
        <p className="text-sm text-slate-500 mb-6">{t('offline.body')}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-primary min-h-[44px] px-6 py-2.5"
        >
          {t('offline.retry')}
        </button>
        <p className="text-xs text-slate-400 mt-4">{t('offline.reconnect')}</p>
      </div>
    </div>
  );
}
