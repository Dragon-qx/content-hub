'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, Field, Input, Select } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { Table } from '@/components/Table';
import {
  HEALTH_TONE,
  PLATFORMS,
  Paginated,
  SocialAccount,
  TeamHealthSummary,
} from '@/lib/types';
import { useT } from '@/lib/i18n';

type BindMode = 'manual' | 'oauth';

interface ValidationResult {
  accountId: string;
  platform: string;
  valid: boolean;
  status: string;
  message: string;
  checks: { name: string; ok: boolean; detail: string }[];
  suggestions: string[];
}

/** Result banner shown after the OAuth provider redirects back to this page. */
function OAuthBanner() {
  const { t } = useT();
  const params = useSearchParams();
  const oauth = params.get('oauth');
  if (oauth !== 'success' && oauth !== 'error') return null;
  const platform = params.get('platform');
  const message = params.get('message');
  return (
    <div
      role="status"
      className={`mb-4 rounded-lg px-4 py-3 text-sm ${
        oauth === 'success'
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-red-50 text-red-700'
      }`}
    >
      {oauth === 'success' ? (
        <>
          {t('common.success')}{platform ? ` · ${platform} ${t('accounts.connectOAuth')}` : ''}
          {params.get('account') ? ` (${params.get('account')})` : ''}
        </>
      ) : (
        <>{t('common.error')}{platform ? ` · ${platform}` : ''}
          {message ? `: ${decodeURIComponent(message)}` : ''}</>
      )}
    </div>
  );
}

export default function AccountsPage() {
  const { t } = useT();
  const { activeTeamId } = useAuth();
  const [rows, setRows] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<BindMode>('manual');

  const [platform, setPlatform] = useState('WECHAT_OFFICIAL');
  const [accountId, setAccountId] = useState('');
  const [accountName, setAccountName] = useState('');
  const [appid, setAppid] = useState('');
  const [secret, setSecret] = useState('');
  // Active team is owned by AuthProvider (resolved from GET /teams).
  const teamId = activeTeamId;

  // OAuth fields: the developer-registered *app* credentials for the platform.
  const [oauthAppKey, setOauthAppKey] = useState('');
  const [oauthAppSecret, setOauthAppSecret] = useState('');
  const [oauthAccountName, setOauthAccountName] = useState('');

  // Health monitoring (PRD §3.2).
  const [health, setHealth] = useState<TeamHealthSummary | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Paginated<SocialAccount>>(
        '/accounts?skip=0&take=50',
      );
      setRows(res.items);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const res = await api.get<TeamHealthSummary>(
        `/health-monitor/teams/${teamId}`,
      );
      setHealth(res);
    } catch {
      setHealth(null);
    }
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  // Once an OAuth result is consumed, strip it from the URL so a refresh can't
  // replay the (already-cleared) message.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth')) {
      params.delete('oauth');
      params.delete('platform');
      params.delete('account');
      params.delete('message');
      const qs = params.toString();
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${qs ? `?${qs}` : ''}`,
      );
    }
  }, []);

  const submitManual = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/accounts', {
        teamId,
        platform,
        accountId,
        accountName,
        appid,
        secret,
      });
      setShowForm(false);
      setAccountId('');
      setAccountName('');
      setAppid('');
      setSecret('');
      await load();
      await loadHealth();
      alert(t('accounts.bindSuccess'));
    } catch (err: any) {
      const msg = err?.message ?? t('common.error');
      window.alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const submitOAuth = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // The backend mints a signed `state` + returns the provider authorize URL.
      // We hand the browser to the provider; it redirects back to our callback,
      // which binds the account and 302-redirects here with ?oauth=success.
      const res = await api.post<{ authUrl: string }>(
        `/accounts/oauth/${platform}/authorize`,
        {
          teamId,
          platform,
          accountName: oauthAccountName || undefined,
          appKey: oauthAppKey,
          appSecret: oauthAppSecret,
        },
      );
      window.location.href = res.authUrl;
    } catch (err) {
      // If the POST itself fails we stay on the page; the message surfaces via
      // the API error. Use a banner-style alert here for immediate feedback.
      const msg =
        err instanceof Error ? err.message : 'Failed to start OAuth flow';
      window.alert(msg);
      setSubmitting(false);
    }
  };

  const runHealthCheck = async () => {
    setChecking(true);
    try {
      const res = await api.post<{ notified: number }>(
        `/health-monitor/teams/${teamId}/run`,
      );
      await loadHealth();
      if (res.notified > 0) {
        alert(
          `Health check complete: ${res.notified} account(s) need attention. Team notified.`,
        );
      } else {
        alert('Health check complete: all accounts healthy.');
      }
    } finally {
      setChecking(false);
    }
  };

  // Account validation (row-level)
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  // Pre-save validation (form-level)
  const [formValidating, setFormValidating] = useState(false);
  const [formValidation, setFormValidation] = useState<ValidationResult | null>(null);

  const validateBeforeSave = async (formPlatform: string, appId: string, secret: string) => {
    setFormValidating(true);
    setFormValidation(null);
    try {
      const res = await api.post<ValidationResult>('/accounts/validate', {
        teamId,
        platform: formPlatform,
        accountName: 'validation-check',
        accountId: 'validation-check',
        appid: appId || undefined,
        secret: secret || undefined,
      });
      setFormValidation(res);
    } catch {
      setFormValidation({
        accountId: '',
        platform: formPlatform,
        valid: false,
        status: 'ERROR',
        message: '验证请求失败',
        checks: [],
        suggestions: ['请检查网络连接'],
      });
    } finally {
      setFormValidating(false);
    }
  };

  // Account edit
  const [editingAccount, setEditingAccount] = useState<SocialAccount | null>(null);
  const [editName, setEditName] = useState('');
  const [editAppId, setEditAppId] = useState('');
  const [editSecret, setEditSecret] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Account delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const validateAccount = async (accountId: string) => {
    setValidating(true);
    setValidationResult(null);
    setShowValidation(true);
    try {
      const res = await api.post<ValidationResult>(`/accounts/${accountId}/validate`);
      setValidationResult(res);
    } catch (err: unknown) {
      setValidationResult({
        accountId,
        platform: '',
        valid: false,
        status: 'ERROR',
        message: err instanceof Error ? err.message : '验证失败',
        checks: [],
        suggestions: ['请检查网络连接或联系管理员'],
      });
    } finally {
      setValidating(false);
    }
  };

  // Edit account
  const startEdit = (account: SocialAccount) => {
    setEditingAccount(account);
    setEditName(account.accountName);
    setEditAppId('');
    setEditSecret('');
  };

  const saveEdit = async () => {
    if (!editingAccount) return;
    setSavingEdit(true);
    try {
      const body: Record<string, string> = { accountName: editName };
      if (editAppId) body.appid = editAppId;
      if (editAppId) body.appId = editAppId;
      if (editSecret) body.secret = editSecret;
      await api.patch(`/accounts/${editingAccount.id}`, body);
      setEditingAccount(null);
      await load();
      await loadHealth();
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete account
  const confirmDelete = async (accountId: string) => {
    setDeletingId(accountId);
  };

  const executeDelete = async () => {
    if (!deletingId) return;
    try {
      await api.del(`/accounts/${deletingId}`);
      setDeletingId(null);
      await load();
      await loadHealth();
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : '删除失败');
      setDeletingId(null);
    }
  };

  return (
    <div className="pb-20 md:pb-8">
      <PageHeader
        title={t('accounts.title')}
        subtitle={t('accounts.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={runHealthCheck} disabled={checking}>
              {checking ? t('accounts.checking') : t('accounts.runHealthCheck')}
            </Button>
            <Button onClick={() => setShowForm((s) => !s)}>
              {showForm ? t('common.cancel') : t('accounts.bindAccount')}
            </Button>
          </div>
        }
      />

      <OAuthBanner />

      {health && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm font-medium text-slate-600">
              {t('accounts.health')}
            </span>
            <Badge tone="success">{health.totals.healthy} {t('accounts.healthy')}</Badge>
            <Badge tone="warning">{health.totals.warning} {t('accounts.warning')}</Badge>
            <Badge tone="danger">{health.totals.critical} {t('accounts.critical')}</Badge>
            <span className="ml-auto text-xs text-slate-400">
              {health.totals.total} account(s) · evaluated{' '}
              {new Date(health.evaluatedAt).toLocaleString()}
            </span>
          </div>
        </Card>
      )}

      {showForm && (
        <Card className="mb-6">
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                mode === 'manual'
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {t('accounts.pasteCredentials')}
            </button>
            <button
              type="button"
              onClick={() => setMode('oauth')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                mode === 'oauth'
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {t('accounts.connectOAuth')}
            </button>
          </div>

          {mode === 'manual' ? (
            <form onSubmit={submitManual} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {t(p.label)}
                  </option>
                ))}
              </Select>
              <Input
                placeholder={t('accounts.accountId')}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
              />
              <Input
                placeholder={t('accounts.accountName')}
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                required
              />
              <Input
                placeholder={t('accounts.appId')}
                value={appid}
                onChange={(e) => setAppid(e.target.value)}
              />
              <Input
                placeholder={t('accounts.secret')}
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />

              {/* Inline validation result */}
              {formValidation && (
                <div className="sm:col-span-2 rounded-lg border border-slate-200 p-3">
                  <div className={`mb-2 text-sm font-medium ${formValidation.valid ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formValidation.valid ? '✓ ' : '✗ '}{formValidation.message}
                  </div>
                  {formValidation.checks.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                      <span className={c.ok ? 'text-emerald-500' : 'text-red-500'}>{c.ok ? '✓' : '✗'}</span>
                      <span>{c.name}: {c.detail}</span>
                    </div>
                  ))}
                  {formValidation.suggestions.length > 0 && (
                    <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
                      {formValidation.suggestions[0]}
                    </div>
                  )}
                </div>
              )}

              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="secondary" disabled={formValidating || !appid || !secret} onClick={() => validateBeforeSave(platform, appid, secret)}>
                  {formValidating ? t('accounts.validating') : t('accounts.validate')}
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? t('accounts.binding') : t('accounts.bind')}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={submitOAuth} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <p className="sm:col-span-2 text-sm text-slate-500">
                OAuth2 authorization-code flow. Provide your registered app
                key/secret for the platform; you&apos;ll be redirected to
                authorize, and the account binds on return.
              </p>
              <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {t(p.label)}
                  </option>
                ))}
              </Select>
              <Input
                placeholder={t('accounts.accountName')}
                value={oauthAccountName}
                onChange={(e) => setOauthAccountName(e.target.value)}
              />
              <Input
                placeholder={t('accounts.appId')}
                value={oauthAppKey}
                onChange={(e) => setOauthAppKey(e.target.value)}
                required
              />
              <Input
                placeholder={t('accounts.secret')}
                type="password"
                value={oauthAppSecret}
                onChange={(e) => setOauthAppSecret(e.target.value)}
                required
              />
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit" disabled={submitting}>
                  {submitting ? t('accounts.redirecting') : t('accounts.connectOAuth')}
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}

      {/* Validation result modal */}
      {showValidation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t('accounts.validateTitle')}</h3>
              <button
                onClick={() => setShowValidation(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {validating && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-primary" />
                {t('accounts.validating')}
              </div>
            )}

            {!validating && validationResult && (
              <div className="flex flex-col gap-4">
                {/* Status banner */}
                <div
                  className={`rounded-lg px-4 py-3 text-sm font-medium ${
                    validationResult.valid
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {validationResult.valid ? '✓ ' : '✗ '}
                  {validationResult.message}
                </div>

                {/* Checks */}
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-slate-600">{t('accounts.validateChecks')}</span>
                  {validationResult.checks.map((check, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={check.ok ? 'text-emerald-500' : 'text-red-500'}>
                          {check.ok ? '✓' : '✗'}
                        </span>
                        <span className="text-sm text-slate-700">{check.name}</span>
                      </div>
                      <span className="text-xs text-slate-500">{check.detail}</span>
                    </div>
                  ))}
                </div>

                {/* Suggestions */}
                {validationResult.suggestions.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-slate-600">{t('accounts.validateSuggestions')}</span>
                    <ul className="list-inside list-disc rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {validationResult.suggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-slate-400">{t('common.loading')}</div>
      ) : (
        <div className="overflow-x-auto">
          <Table<SocialAccount>
            rows={rows}
            emptyMessage={t('accounts.empty')}
            columns={[
            { key: 'name', header: t('accounts.column.account'), render: (r) => r.accountName },
            {
              key: 'platform',
              header: t('accounts.column.platform'),
              render: (r) => r.platform,
            },
            {
              key: 'followers',
              header: t('accounts.column.followers'),
              render: (r) => (r.followerCount ?? 0).toLocaleString(),
            },
            {
              key: 'health',
              header: t('accounts.column.health'),
              render: (r) => {
                const found = health?.accounts.find((a) => a.accountId === r.id);
                if (!found) return <span className="text-slate-400">—</span>;
                const critical = found.signals.filter(
                  (s) => s.severity === 'critical',
                ).length;
                const warnings = found.signals.filter(
                  (s) => s.severity === 'warning',
                ).length;
                const label =
                  found.health === 'HEALTHY'
                    ? t('accounts.healthy')
                    : `${critical}C / ${warnings}W`;
                return <Badge tone={HEALTH_TONE[found.health]}>{label}</Badge>;
              },
            },
            {
              key: 'actions',
              header: t('common.actions'),
              render: (r) => (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" onClick={() => startEdit(r)}>{t('common.edit')}</Button>
                  <Button variant="ghost" onClick={() => confirmDelete(r.id)}>{t('common.delete')}</Button>
                  <Button variant="secondary" disabled={validating} onClick={() => validateAccount(r.id)}>
                    {validating ? t('common.loading') : t('accounts.validate')}
                  </Button>
                </div>
              ),
            },
            ]}
          />
        </div>
      )}

      {/* Edit account dialog */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">{t('common.edit')} — {editingAccount.accountName}</h3>
            <div className="flex flex-col gap-4">
              <Field label={t('accounts.column.platform')}>
                <Input value={editingAccount.platform} disabled className="bg-slate-50" />
              </Field>
              <Field label={t('accounts.accountId')}>
                <Input value={editingAccount.accountId} disabled className="bg-slate-50" />
              </Field>
              <Field label={t('accounts.accountName')}>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </Field>
              <Field label={t('accounts.appId')}>
                <Input
                  placeholder={t('accounts.appId')}
                  value={editAppId}
                  onChange={(e) => setEditAppId(e.target.value)}
                />
              </Field>
              <Field label={t('accounts.secret')}>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={editSecret}
                  onChange={(e) => setEditSecret(e.target.value)}
                />
              </Field>
              <p className="text-xs text-slate-400">{t('accounts.leaveBlankToKeep')}</p>

              {/* Inline validation result */}
              {formValidation && (
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className={`mb-2 text-sm font-medium ${formValidation.valid ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formValidation.valid ? '✓ ' : '✗ '}{formValidation.message}
                  </div>
                  {formValidation.checks.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                      <span className={c.ok ? 'text-emerald-500' : 'text-red-500'}>{c.ok ? '✓' : '✗'}</span>
                      <span>{c.name}: {c.detail}</span>
                    </div>
                  ))}
                  {formValidation.suggestions.length > 0 && (
                    <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
                      {formValidation.suggestions[0]}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditingAccount(null)}>{t('common.cancel')}</Button>
              <Button variant="secondary" disabled={formValidating || !editAppId || !editSecret} onClick={() => validateBeforeSave(editingAccount.platform, editAppId, editSecret)}>
                {formValidating ? t('accounts.validating') : t('accounts.validate')}
              </Button>
              <Button onClick={saveEdit} disabled={savingEdit}>
                {savingEdit ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold">{t('common.delete')}</h3>
            <p className="mb-6 text-sm text-slate-600">Are you sure you want to unbind this account? This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeletingId(null)}>{t('common.cancel')}</Button>
              <Button variant="danger" onClick={executeDelete}>{t('common.delete')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
