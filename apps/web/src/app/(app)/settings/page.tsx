'use client';

import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Input } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';

export default function SettingsPage() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.put('/users/me', { name, ...(password ? { password } : {}) });
      setMsg('Profile updated.');
      setPassword('');
    } catch (err: any) {
      setMsg(err?.message ?? 'Failed to update.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Profile and security" />
      <Card className="max-w-xl">
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
    </div>
  );
}
