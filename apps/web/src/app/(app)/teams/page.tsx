'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Input, StatusBadge } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { Table } from '@/components/Table';
import { Member, Paginated, Team } from '@/lib/types';
import { useT } from '@/lib/i18n';

export default function TeamsPage() {
  const { setActiveTeamId, refreshTeams } = useAuth();
  const { t } = useT();
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
      const team = await api.post<Team>('/teams', { name, description });
      setName('');
      setDescription('');
      setShowForm(false);
      await loadTeams();
      // Make the newly created team the active one so downstream pages
      // (accounts, contents, dashboard) immediately scope to it.
      setActiveTeam(team.id);
      setActiveTeamId(team.id);
      await refreshTeams();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-20 md:pb-8">
      <PageHeader
        title={t('teams.title')}
        subtitle={t('teams.subtitle')}
        actions={
          <Button onClick={() => setShowForm((s) => !s)}>
            {showForm ? t('common.cancel') : t('teams.newTeam')}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Input placeholder={t('teams.teamName')} value={name} onChange={(e) => setName(e.target.value)} required />
            <Input placeholder={t('teams.description')} value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? t('teams.creating') : t('teams.createTeam')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="text-slate-400">{t('common.loading')}</div>
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
              {teams.length === 0 && <li className="text-sm text-slate-400">{t('teams.empty')}</li>}
            </ul>
          </Card>

          <div className="lg:col-span-2">
            <div className="overflow-x-auto">
              <Table<Member>
                rows={members}
                emptyMessage={activeTeam ? t('teams.noMembers') : t('teams.selectTeam')}
                columns={[
                { key: 'user', header: t('teams.user'), render: (r) => <span className="font-mono text-xs">{r.userId}</span> },
                { key: 'role', header: t('teams.role'), render: (r) => <StatusBadge status={t(`teams.role.${r.role.toLowerCase()}`)} /> },
                { key: 'joined', header: t('teams.joined'), render: (r) => new Date(r.joinedAt).toLocaleDateString() },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
