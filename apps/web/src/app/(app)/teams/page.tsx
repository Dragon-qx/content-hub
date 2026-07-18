'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, Input, StatusBadge } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { Table } from '@/components/Table';
import { Member, Paginated, Team } from '@/lib/types';

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadTeams = async () => {
    try {
      const res = await api.get<Team[]>('/teams');
      setTeams(res);
      if (res.length && !activeTeam) setActiveTeam(res[0].id);
    } catch {
      setTeams([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async (teamId: string) => {
    try {
      const res = await api.get<Member[]>(`/teams/${teamId}/members`);
      setMembers(res);
    } catch {
      setMembers([]);
    }
  };

  useEffect(() => {
    loadTeams();
  }, []);

  useEffect(() => {
    if (activeTeam) loadMembers(activeTeam);
  }, [activeTeam]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/teams', { name, description });
      setName('');
      setDescription('');
      setShowForm(false);
      await loadTeams();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-20 md:pb-8">
      <PageHeader
        title="Teams"
        subtitle="Manage your teams and members"
        actions={
          <Button onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ New team'}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Input placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create team'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <h2 className="mb-3 text-base font-semibold">Teams</h2>
            <ul className="flex flex-col gap-2">
              {teams.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setActiveTeam(t.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                      activeTeam === t.id ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50'
                    }`}
                  >
                    {t.name}
                  </button>
                </li>
              ))}
              {teams.length === 0 && <li className="text-sm text-slate-400">No teams yet.</li>}
            </ul>
          </Card>

          <div className="lg:col-span-2">
            <div className="overflow-x-auto">
              <Table<Member>
                rows={members}
                emptyMessage={activeTeam ? 'No members in this team.' : 'Select a team.'}
                columns={[
                { key: 'user', header: 'User', render: (r) => <span className="font-mono text-xs">{r.userId}</span> },
                { key: 'role', header: 'Role', render: (r) => <StatusBadge status={r.role} /> },
                { key: 'joined', header: 'Joined', render: (r) => new Date(r.joinedAt).toLocaleDateString() },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
