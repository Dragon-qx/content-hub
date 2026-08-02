'use client';

import { useEffect, useState } from 'react';
import { Button, Field, Input, Select } from '@/lib/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { PLATFORMS, SocialAccount } from '@/lib/types';

interface PublishDialogProps {
  contentId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PublishDialog({ contentId, onClose, onSuccess }: PublishDialogProps) {
  const { t } = useT();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [platform, setPlatform] = useState('');
  const [accountId, setAccountId] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ items: SocialAccount[] }>('/accounts?take=100')
      .then((res) => setAccounts(res.items ?? []))
      .catch(() => setAccounts([]));
  }, []);

  const filteredAccounts = platform
    ? accounts.filter((a) => a.platform === platform && a.status === 'ACTIVE')
    : accounts;

  const selectedPlatformLabel = platform
    ? PLATFORMS.find((p) => p.value === platform)?.label ?? platform
    : '';

  const requiresCover = platform === 'WECHAT_OFFICIAL' || platform === 'WECHAT_VIDEO' || platform === 'BILIBILI';

  const handlePublish = async () => {
    if (!platform) {
      setError(t('content.publish.platform'));
      return;
    }
    if (requiresCover && !coverUrl) {
      setError(t('content.publish.coverRequired'));
      return;
    }

    setPublishing(true);
    setError('');

    try {
      await api.publish(contentId, platform, {
        mediaUrls: coverUrl ? [coverUrl] : undefined,
        accountId: accountId || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('content.publish.failed');
      setError(message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold">{t('content.publish.title')}</h3>

        <div className="flex flex-col gap-4">
          <Field label={t('content.publish.platform')}>
            <Select value={platform} onChange={(e) => { setPlatform(e.target.value); setAccountId(''); }}>
              <option value="">{t('common.select')}</option>
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>{t(p.label)}</option>
              ))}
            </Select>
          </Field>

          {filteredAccounts.length > 0 && (
            <Field label={t('content.publish.account')}>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">{t('common.select')}</option>
                {filteredAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.accountName} ({a.platform})
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {requiresCover && (
            <Field label={t('content.publish.coverImage')}>
              <Input
                type="url"
                placeholder="https://example.com/cover.jpg"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
              />
              <p className="mt-1 text-xs text-amber-600">{t('content.publish.coverRequired')}</p>
            </Field>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handlePublish} disabled={publishing}>
            {publishing ? t('content.publish.publishing') : t('content.action.publish')}
          </Button>
        </div>
      </div>
    </div>
  );
}
