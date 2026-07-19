'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Input, Select, Badge } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import MarkdownEditor from '@/components/MarkdownEditor';
import WysiwygEditor from '@/components/WysiwygEditor';
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
import { useT } from '@/lib/i18n';

export default function ContentPage() {
  const { t } = useT();
  const { activeTeamId } = useAuth();
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
  // Active team is owned by AuthProvider (resolved from GET /teams).
  const teamId = activeTeamId;
  const [tagsInput, setTagsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editorMode, setEditorMode] = useState<'wysiwyg' | 'markdown'>('wysiwyg');

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
  const [tplEditorMode, setTplEditorMode] = useState<'wysiwyg' | 'markdown'>('markdown');

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
        title={t('content.title')}
        subtitle={`${total} items`}
        actions={
          <Button onClick={() => setShowForm((s) => !s)}>
            {showForm ? t('common.cancel') : t('content.create')}
          </Button>
        }
      />

      {/* Filters */}
      <Card className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label={t('content.search')}>
            <Input
              placeholder={t('content.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label={t('content.status')}>
            <Select value={status} onChange={(e) => setStatus(e.target.value as '' | ContentStatus)}>
              <option value="">{t('common.all')}</option>
              {CONTENT_STATUSES.map((s) => (
                <option key={s} value={s}>{t(STATUS_LABELS[s])}</option>
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
            {showTemplateForm ? t('common.cancel') : '+ New template'}
          </Button>
        </div>

        {tplError && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{tplError}</div>
        )}

        {showTemplateForm && (
          <form onSubmit={saveTemplate} className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
            <Input placeholder="Template title" value={tplTitle} onChange={(e) => setTplTitle(e.target.value)} required />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">Editor mode</span>
              <button
                type="button"
                onClick={() => setTplEditorMode((m) => (m === 'markdown' ? 'wysiwyg' : 'markdown'))}
                className="rounded border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Switch to {tplEditorMode === 'markdown' ? t('content.wysiwyg') : t('content.markdown')}
              </button>
            </div>
            {tplEditorMode === 'markdown' ? (
              <MarkdownEditor value={tplBody} onChange={setTplBody} placeholder="Template body (Markdown)…" />
            ) : (
              <WysiwygEditor value={tplBody} onChange={setTplBody} placeholder="Template body…" />
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select value={tplType} onChange={(e) => setTplType(e.target.value)}>
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
              <Input value={teamId} placeholder="Team ID" readOnly />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={tplSaving}>
                {tplSaving ? t('common.saving') : 'Save template'}
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
            {templates.map((tpl) => (
              <li
                key={tpl.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-700">{tpl.title}</div>
                  <div className="text-xs text-slate-400">
                    {tpl.contentType}
                    {tpl.tags.length > 0 && <> · {tpl.tags.join(', ')}</>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="secondary" onClick={() => newFromTemplate(tpl)}>
                    New from template
                  </Button>
                  <Button variant="danger" onClick={() => deleteTemplate(tpl.id)}>
                    {t('common.delete')}
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
            <Input placeholder={t('content.title_label')} value={title} onChange={(e) => setTitle(e.target.value)} required />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">Editor mode</span>
              <button
                type="button"
                onClick={() => setEditorMode((m) => (m === 'markdown' ? 'wysiwyg' : 'markdown'))}
                className="rounded border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Switch to {editorMode === 'markdown' ? t('content.wysiwyg') : t('content.markdown')}
              </button>
            </div>
            {editorMode === 'markdown' ? (
              <MarkdownEditor
                value={body}
                onChange={setBody}
                placeholder="Write your content (Markdown supported)…"
              />
            ) : (
              <WysiwygEditor
                value={body}
                onChange={setBody}
                placeholder="Write your content…"
              />
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select value={contentType} onChange={(e) => setContentType(e.target.value)}>
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
              <Input value={teamId} placeholder="Team ID" readOnly />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? t('common.saving') : t('common.create')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="text-slate-400">{t('common.loading')}</div>
      ) : (
        <div className="overflow-x-auto">
          <Table<Content>
          rows={rows}
          emptyMessage={t('content.empty')}
          columns={[
            {
              key: 'title',
              header: t('content.column.title'),
              render: (r) => (
                <Link href={`/contents/${r.id}`} className="font-medium text-primary hover:underline">
                  {r.title}
                </Link>
              ),
            },
            {
              key: 'tags',
              header: t('content.tags'),
              render: (r) => (
                <div className="flex flex-wrap gap-1">
                  {r.tags?.length ? r.tags.map((t) => <Badge key={t.id}>{t.name}</Badge>) : <span className="text-slate-400">—</span>}
                </div>
              ),
            },
            { key: 'type', header: t('content.column.type'), render: (r) => <span className="text-slate-500">{r.contentType}</span> },
            { key: 'status', header: t('content.column.status'), render: (r) => <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{t(STATUS_LABELS[r.status]) ?? r.status}</span> },
            { key: 'updated', header: t('content.column.updated'), render: (r) => new Date(r.updatedAt).toLocaleString() },
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
