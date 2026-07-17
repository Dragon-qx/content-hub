'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function LoginForm() {
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
      setError(err?.message ?? 'Something went wrong');
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
      setError(err?.message ?? 'Invalid code');
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
        <div className="card w-full max-w-md p-8">
          <h1 className="mb-1 text-2xl font-bold">Two-factor authentication</h1>
          <p className="mb-6 text-sm text-slate-500">
            Enter the 6-digit code from your authenticator app.
          </p>
          <form onSubmit={submitMfa} className="flex flex-col gap-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">Verification code</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-lg tracking-[0.5em] outline-none focus:border-primary focus:ring-2 focus:ring-indigo-100"
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
              className="btn-primary w-full rounded-lg py-2 text-sm font-medium"
            >
              {busy ? 'Verifying…' : 'Verify'}
            </button>
            <button
              type="button"
              className="w-full text-center text-sm text-slate-500 hover:underline"
              onClick={cancelMfa}
            >
              Cancel
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="card w-full max-w-md p-8">
        <h1 className="mb-1 text-2xl font-bold">ContentHub</h1>
        <p className="mb-6 text-sm text-slate-500">
          {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
        </p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === 'register' && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">Name</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-indigo-100"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">Email</span>
            <input
              type="email"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-indigo-100"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">Password</span>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-indigo-100"
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
            className="btn-primary w-full rounded-lg py-2 text-sm font-medium"
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          className="mt-4 w-full text-center text-sm text-indigo-600 hover:underline"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login'
            ? "Don't have an account? Register"
            : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
