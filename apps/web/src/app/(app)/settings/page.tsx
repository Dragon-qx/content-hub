'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, qrCodeUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, Field, Input } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';

interface MfaSetup {
  secret: string;
  otpauthUrl: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // MFA state.
  const [mfaEnabled, setMfaEnabled] = useState(user?.mfaEnabled ?? false);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  // Keep the displayed name in sync if the auth context resolves after mount.
  useEffect(() => {
    if (user?.name) setName(user.name);
    setMfaEnabled(user?.mfaEnabled ?? false);
  }, [user]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.put('/users/me', { name, ...(password ? { password } : {}) });
      setMsg('Profile updated.');
      setPassword('');
      // Reflect any change by re-hydrating the user (name change shows on next load).
      window.location.reload();
    } catch (err: any) {
      setMsg(err?.message ?? 'Failed to update.');
    } finally {
      setBusy(false);
    }
  };

  const startSetup = async () => {
    setMfaError(null);
    setMfaBusy(true);
    try {
      const res = await api.post<MfaSetup>('/auth/mfa/setup', {});
      setSetup(res);
      setVerifyCode('');
    } catch (err: any) {
      setMfaError(err?.message ?? 'Failed to start setup.');
    } finally {
      setMfaBusy(false);
    }
  };

  // Retry setup until the status flips (and the relevant fields exist).
  const confirmSetup = async (e: FormEvent) => {
    e.preventDefault();
    if (!setup) return;
    setMfaError(null);
    setMfaBusy(true);
    try {
      await api.post('/auth/mfa/verify', { code: verifyCode });
      setSetup(null);
      setVerifyCode('');
      setMfaEnabled(true);
      window.location.reload();
    } catch (err: any) {
      setMfaError(err?.message ?? 'Verification failed.');
    } finally {
      setMfaBusy(false);
    }
  };

  const disableMfa = async () => {
    setMfaError(null);
    setMfaBusy(true);
    try {
      await api.post('/auth/mfa/disable', {});
      setMfaEnabled(false);
      setSetup(null);
      window.location.reload();
    } catch (err: any) {
      setMfaError(err?.message ?? 'Failed to disable.');
    } finally {
      setMfaBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-20 md:pb-8">
      <PageHeader title="Settings" subtitle="Profile and security" />

      <Card className="max-w-xl">
        <h2 className="mb-4 text-base font-semibold">Profile</h2>
        <form onSubmit={save} className="flex flex-col gap-4">
          <Field label="Email">
            <Input value={user?.email ?? ''} disabled />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="New password (optional)">
            <Input
              type="password"
              placeholder="Leave blank to keep current"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
            />
          </Field>
          {msg && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Two-factor authentication</h2>
          <Badge tone={mfaEnabled ? 'success' : 'warning'}>
            {mfaEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Protect your account with a time-based one-time password from an
          authenticator app.
        </p>

        {mfaError && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {mfaError}
          </div>
        )}

        {/* Setup flow: show QR + secret, then a code to confirm. */}
        {setup && !mfaEnabled && (
          <div className="mb-4 flex flex-col gap-4 rounded-lg border border-slate-200 p-4">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <img
                src={qrCodeUrl(setup.otpauthUrl)}
                alt="Scan this QR code with your authenticator app"
                width={160}
                height={160}
                className="rounded-lg border border-slate-200"
              />
              <div className="flex-1 text-sm text-slate-600">
                <p className="mb-2">
                  Scan the QR code with your authenticator app, or enter this
                  secret manually:
                </p>
                <code className="block break-all rounded bg-slate-100 px-2 py-1 font-mono text-xs">
                  {setup.secret}
                </code>
              </div>
            </div>
            <form onSubmit={confirmSetup} className="flex flex-col gap-3">
              <Field label="Enter the 6-digit code to confirm">
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-lg tracking-[0.5em] outline-none focus:border-primary focus:ring-2 focus:ring-indigo-100"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setSetup(null)} disabled={mfaBusy}>
                  Cancel
                </Button>
                <Button type="submit" disabled={mfaBusy || verifyCode.length !== 6}>
                  {mfaBusy ? 'Confirming…' : 'Confirm & enable'}
                </Button>
              </div>
            </form>
          </div>
        )}

        <div className="flex gap-2">
          {!mfaEnabled && !setup && (
            <Button onClick={startSetup} disabled={mfaBusy}>
              {mfaBusy ? 'Starting…' : 'Enable two-factor authentication'}
            </Button>
          )}
          {mfaEnabled && (
            <Button variant="danger" onClick={disableMfa} disabled={mfaBusy}>
              {mfaBusy ? 'Disabling…' : 'Disable two-factor authentication'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
