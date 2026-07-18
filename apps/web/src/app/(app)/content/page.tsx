'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button, Card, Input, Select, Badge } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import MarkdownEditor from '@/components/MarkdownEditor';
import { Table } from '@/components/Table';
import {
  Content,
  ContentTemplate,
  Paginated,
  ContentStatus,
  CONTENT_STATUSES,
  CONTENT_TYPES,
  STATUS_LABELS,
  TemplateDraftSeed,
} from '@/lib/types';

export default function ContentPage() {
  const [rows, setRows] = useState<Content[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Filters — both supported by the backend `findAll` query.
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | ContentStatus>('');

  // Create form
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [contentType, setContentType] = useState('TEXT');
  const [teamId, setTeamId] = useState('default-team');
  const [tagsInput, setTagsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ skip: '0', take: '20' });
      if (search.trim()) qs.set('search', search.trim());
      if (status) qs.set('status', status);
      const res = await api.get<Paginated<Content>>(`/contents?${qs.toString()}`);
      setRows(res.items);
      setTotal(res.total);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Reload when filters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await api.post('/contents', { title, body, contentType, teamId, tags });
      setTitle('');
      setBody('');
      setTagsInput('');
      setShowForm(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  // ── Content templates (PRD §3.3 内容模板) ───────────────────────────
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [tplTitle, setTplTitle] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplType, setTplType] = useState('TEXT');
  const [tplTags, setTplTags] = useState('');
  const [tplSaving, setTplSaving] = useState(false);
  const [tplError, setTplError] = useState<string | null>(null);

  const loadTemplates = async () => {
    try {
      const qs = new URLSearchParams({ teamId, skip: '0', take: '50' });
      const res = await api.get<Paginated<ContentTemplate>>(`/templates?${qs.toString()}`);
      setTemplates(res.items);
    } catch {
      setTemplates([]);
    }
  };

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const saveTemplate = async (e: FormEvent) => {
    e.preventDefault();
    setTplSaving(true);
    setTplError(null);
    try {
      const tags = tplTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await api.post('/templates', { title: tplTitle, body: tplBody, contentType: tplType, teamId, tags });
      setTplTitle('');
      setTplBody('');
      setTplTags('');
      setShowTemplateForm(false);
      await loadTemplates();
    } catch (err: any) {
      setTplError(err?.message ?? 'Failed to save template.');
    } finally {
      setTplSaving(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      await api.del(`/templates/${id}`);
      await loadTemplates();
    } catch {
      // Ignore deletion errors best-effort; list refreshes next interaction.
    }
  };

  /** Apply a template to seed the new-content form, then reveal it. */
  const newFromTemplate = async (t: ContentTemplate) => {
    try {
      const seed = await api.post<TemplateDraftSeed>(`/templates/${t.id}/apply`, { teamId });
      setTitle(seed.title);
      setBody(seed.body ?? '');
      setContentType(seed.contentType);
      setTagsInput(seed.tags.join(', '));
      setShowForm(true);
    } catch (err: any) {
      setTplError(err?.message ?? 'Failed to apply template.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Content"
        subtitle={`${total} items`}
        actions={
          <Button onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ New content'}
          </Button>
        }
      />

      {/* Filters */}
      <Card className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Search">
            <Input
              placeholder="Search title or body…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as '' | ContentStatus)}>
              <option value="">All statuses</option>
              {CONTENT_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {/* Content templates — reusable starting points for new content. */}
      <Card className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Templates</h2>
          <Button variant="secondary" onClick={() => setShowTemplateForm((s) => !s)}>
            {showTemplateForm ? 'Cancel' : '+ New template'}
          </Button>
        </div>

        {tplError && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{tplError}</div>
        )}

        {showTemplateForm && (
          <form onSubmit={saveTemplate} className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
            <Input placeholder="Template title" value={tplTitle} onChange={(e) => setTplTitle(e.target.value)} required />
            <MarkdownEditor value={tplBody} onChange={setTplBody} placeholder="Template body (Markdown)…" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select value={tplType} onChange={(e) => setTplType(e.target.value)}>
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
              <Input value={teamId} onChange={(e) => setTeamId(e.target.value)} placeholder="Team ID" />
              <Input value={tplTags} onChange={(e) => setTplTags(e.target.value)} placeholder="Tags (comma-separated)" />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={tplSaving}>
                {tplSaving ? 'Saving…' : 'Save template'}
              </Button>
            </div>
          </form>
        )}

        {templates.length === 0 ? (
          <p className="text-sm text-slate-400">
            No templates yet. Save a template to reuse its structure when creating content.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-700">{t.title}</div>
                  <div className="text-xs text-slate-400">
                    {t.contentType}
                    {t.tags.length > 0 && <> · {t.tags.join(', ')}</>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="secondary" onClick={() => newFromTemplate(t)}>
                    New from template
                  </Button>
                  <Button variant="danger" onClick={() => deleteTemplate(t.id)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <MarkdownEditor
              value={body}
              onChange={setBody}
              placeholder="Write your content (Markdown supported)…"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select value={contentType} onChange={(e) => setContentType(e.target.value)}>
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
              <Input value={teamId} onChange={(e) => setTeamId(e.target.value)} placeholder="Team ID" />
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Tags (comma-separated)"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : 'Create'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <Table<Content>
          rows={rows}
          emptyMessage="No content yet. Create your first piece."
          columns={[
            {
              key: 'title',
              header: 'Title',
              render: (r) => (
                <Link href={`/contents/${r.id}`} className="font-medium text-primary hover:underline">
                  {r.title}
                </Link>
              ),
            },
            {
              key: 'tags',
              header: 'Tags',
              render: (r) => (
                <div className="flex flex-wrap gap-1">
                  {r.tags?.length ? r.tags.map((t) => <Badge key={t.id}>{t.name}</Badge>) : <span className="text-slate-400">—</span>}
                </div>
              ),
            },
            { key: 'type', header: 'Type', render: (r) => <span className="text-slate-500">{r.contentType}</span> },
            { key: 'status', header: 'Status', render: (r) => <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{STATUS_LABELS[r.status] ?? r.status}</span> },
            { key: 'updated', header: 'Updated', render: (r) => new Date(r.updatedAt).toLocaleString() },
          ]}
        />
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block flex-1 text-sm">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
