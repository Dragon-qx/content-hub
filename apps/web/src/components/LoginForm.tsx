'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function LoginForm() {
  const { t } = useT();
  const { login, register, mfaLogin } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // MFA second step — short-lived token issued by /auth/login.
  const [mfaPending, setMfaPending] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        const result = await login(email, password);
        if (result.mfaRequired && result.mfaToken) {
          setMfaPending(result.mfaToken);
          setCode('');
          return;
        }
      } else {
        await register(email, password, name);
      }
      router.replace('/dashboard');
    } catch (err: any) {
      setError(err?.message ?? t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const submitMfa = async (e: FormEvent) => {
    e.preventDefault();
    if (!mfaPending) return;
    setError(null);
    setBusy(true);
    try {
      await mfaLogin(mfaPending, code);
      setMfaPending(null);
      router.replace('/dashboard');
    } catch (err: any) {
      setError(err?.message ?? t('login.wrongCredentials'));
    } finally {
      setBusy(false);
    }
  };

  const cancelMfa = () => {
    setMfaPending(null);
    setCode('');
    setError(null);
  };

  // MFA verification step — shown only after a password-accepted, MFA-enabled
  // login returns an mfaToken.
  if (mfaPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="card w-full max-w-md p-6 sm:p-8">
          <h1 className="mb-1 text-xl font-bold sm:text-2xl">{t('login.mfaTitle')}</h1>
          <p className="mb-6 text-sm text-slate-500">
            {t('login.mfaSubtitle')}
          </p>
          <form onSubmit={submitMfa} className="flex flex-col gap-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{t('login.verificationCode')}</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                className="min-h-[48px] w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-lg tracking-[0.5em] outline-none focus:border-primary focus:ring-2 focus:ring-indigo-100"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                autoFocus
                required
              />
            </label>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="btn-primary min-h-[44px] w-full rounded-lg py-2 text-sm font-medium"
            >
              {busy ? t('login.pleaseWait') : t('common.confirm')}
            </button>
            <button
              type="button"
              className="min-h-[44px] w-full text-center text-sm text-slate-500 hover:underline"
              onClick={cancelMfa}
            >
              {t('common.cancel')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <h1 className="mb-1 text-xl font-bold sm:text-2xl">{t('login.title')}</h1>
        <p className="mb-6 text-sm text-slate-500">
          {mode === 'login' ? t('login.subtitle.login') : t('login.subtitle.register')}
        </p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === 'register' && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">{t('login.name')}</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-indigo-100 min-h-[44px]"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('login.email')}</span>
            <input
              type="email"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-indigo-100 min-h-[44px]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">{t('login.password')}</span>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-indigo-100 min-h-[44px]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : undefined}
            />
          </label>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn-primary min-h-[44px] w-full rounded-lg py-2 text-sm font-medium"
          >
            {busy
              ? t('login.pleaseWait')
              : mode === 'login'
                ? t('login.signIn')
                : t('login.createAccount')}
          </button>
        </form>

        <button
          className="min-h-[44px] mt-4 w-full text-center text-sm text-indigo-600 hover:underline"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? t('login.noAccount') : t('login.hasAccount')}
        </button>
      </div>
    </div>
  );
}
