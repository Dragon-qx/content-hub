'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button, Card, Input, Select, Textarea, Badge, StatusBadge } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import MarkdownEditor, { renderMarkdown } from '@/components/MarkdownEditor';
import MediaLibrary from '@/components/MediaLibrary';
import AdaptationPreview from '@/components/AdaptationPreview';
import TemplatePicker from '@/components/TemplatePicker';
import {
  Content,
  ContentVersion,
  ContentStatus,
  CONTENT_STATUSES,
  STATUS_LABELS,
  STATUS_ACTIONS,
  StatusAction,
  CONTENT_TYPES,
  MediaAsset,
  TemplateDraftSeed,
} from '@/lib/types';

/** Rendered, XSS-sanitized markdown preview. */
function Preview({ body }: { body: string | undefined }) {
  if (!body) return <p className="text-sm text-slate-400">No content yet.</p>;
  return (
    <div
      className="prose max-w-none text-sm text-slate-700"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
    />
  );
}

/**
 * Count Markdown image references `![alt](url)` in the body — the closest live
 * proxy for attached images without a separate media-asset query, since the
 * MarkdownEditor inserts picked media as these refs.
 */
function countMarkdownImages(body: string): number {
  const matches = body.match(/!\[[^\]]*\]\([^)]+\)/g);
  return matches ? matches.length : 0;
}

function ContentDetail({ id }: { id: string }) {
  const router = useRouter();
  const [content, setContent] = useState<Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [contentType, setContentType] = useState('TEXT');
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  // New version
  const [changeNote, setChangeNote] = useState('');
  const [showVersionForm, setShowVersionForm] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);

  // Workflow action note (approve/reject comment)
  const [actionNote, setActionNote] = useState('');
  const [pendingAction, setPendingAction] = useState<StatusAction | null>(null);
  const [acting, setActing] = useState(false);

  // Media library picker
  const [showMedia, setShowMedia] = useState(false);

  // Template picker
  const [showTemplates, setShowTemplates] = useState(false);

  // Version rollback
  const [rollingBackVersion, setRollingBackVersion] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Content>(`/contents/${id}`);
      setContent(res);
      setTitle(res.title);
      setBody(res.body ?? '');
      setContentType(res.contentType);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load content.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const saveEdits = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/contents/${id}`, { title, body, contentType });
      setEditing(false);
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const saveVersion = async () => {
    setSavingVersion(true);
    setError(null);
    try {
      await api.post(`/contents/${id}/versions`, { title, body, contentType, changeNote });
      setChangeNote('');
      setShowVersionForm(false);
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save version.');
    } finally {
      setSavingVersion(false);
    }
  };

  const rollbackToVersion = async (version: number) => {
    if (!window.confirm(`Roll back to v${version}? The current edits will be preserved as a new version.`)) {
      return;
    }
    setRollingBackVersion(version);
    setError(null);
    try {
      await api.post(`/contents/${id}/rollback`, { version });
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to roll back.');
    } finally {
      setRollingBackVersion(null);
    }
  };

  const runWorkflow = async (action: StatusAction) => {
    if (action.needsNote) {
      setPendingAction(action);
      setActionNote('');
      return;
    }
    await execute(action, '');
  };

  const execute = async (action: StatusAction, note: string) => {
    setActing(true);
    setError(null);
    try {
      switch (action.action) {
        case 'submit':
          await api.post(`/contents/${id}/submit`, {});
          break;
        case 'approve':
          await api.post(`/contents/${id}/approve`, { comment: note });
          break;
        case 'reject':
          await api.post(`/contents/${id}/reject`, { reason: note });
          break;
        case 'archive':
          await api.post(`/contents/${id}/archive`, {});
          break;
        case 'retry':
          // FAILED → SCHEDULED is a valid transition; re-open for publishing.
          await api.put(`/contents/${id}`, { status: 'SCHEDULED' as ContentStatus });
          break;
      }
      setPendingAction(null);
      setActionNote('');
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Action failed.');
    } finally {
      setActing(false);
    }
  };

  /** Insert a picked media asset as a markdown image reference at caret / end. */
  const insertMedia = useCallback(
    (asset: MediaAsset) => {
      const ref = `![${asset.url.replace(/.*\//, '')}](${asset.url})`;
      setBody((prev) => prev + (prev.endsWith('\n') || prev === '' ? '' : '\n') + ref + '\n');
      setShowMedia(false);
    },
    [],
  );

  /** Seed the editor from an applied template. */
  const applyTemplate = useCallback((seed: TemplateDraftSeed) => {
    setTitle(seed.title);
    setBody(seed.body ?? '');
    setContentType(seed.contentType);
    setShowTemplates(false);
  }, []);

  if (loading) return <div className="text-slate-400">Loading…</div>;
  if (error && !content) return <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  if (!content) return null;

  const actions = STATUS_ACTIONS[content.status] ?? [];
  const versions: ContentVersion[] = [...(content.versions ?? [])].sort(
    (a, b) => b.version - a.version,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title=""
        subtitle={
          <div className="flex items-center gap-3">
            <StatusBadge status={content.status} />
            <span className="text-sm text-slate-400">v{content.version ?? 1}</span>
            {content.tags?.map((t) => (
              <Badge key={t.id}>{t.name}</Badge>
            ))}
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!editing ? (
              <Button onClick={() => setEditing(true)}>Edit</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={() => { setEditing(false); setTitle(content.title); setBody(content.body ?? ''); setContentType(content.contentType); }}>Cancel</Button>
                <Button onClick={saveEdits} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              </>
            )}
          </div>
        }
      />

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Workflow actions */}
      {actions.length > 0 && !editing && (
        <Card className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-slate-600">Workflow:</span>
          {actions.map((a) => (
            <Button
              key={a.action}
              variant={a.variant}
              disabled={acting}
              onClick={() => runWorkflow(a)}
            >
              {a.label}
            </Button>
          ))}
        </Card>
      )}

      {/* Inline note prompt for approve/reject */}
      {pendingAction && (
        <Card className="flex flex-col gap-3">
          <div className="text-sm font-medium text-slate-700">
            {pendingAction.action === 'approve' ? 'Add a comment (optional)' : 'Reason for rejection'}
          </div>
          <Textarea
            rows={3}
            value={actionNote}
            onChange={(e) => setActionNote(e.target.value)}
            placeholder={pendingAction.action === 'approve' ? 'Optional comment…' : 'Explain why this is rejected…'}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPendingAction(null)}>Cancel</Button>
            <Button
              variant={pendingAction.variant}
              disabled={acting}
              onClick={() => execute(pendingAction, actionNote)}
            >
              {acting ? 'Working…' : pendingAction.label}
            </Button>
          </div>
        </Card>
      )}

      {/* Title */}
      <Card>
        {editing ? (
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-xl font-semibold" />
        ) : (
          <h1 className="text-2xl font-semibold text-slate-900">{content.title}</h1>
        )}
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
          <span>Type: {content.contentType}</span>
          <span>Updated: {new Date(content.updatedAt).toLocaleString()}</span>
          <span>Created: {new Date(content.createdAt).toLocaleString()}</span>
        </div>
      </Card>

      {/* Body editor / preview */}
      <Card>
        {editing ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={contentType} onChange={(e) => setContentType(e.target.value)} className="max-w-xs">
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
              <Button variant="ghost" onClick={() => setShowTemplates((s) => !s)}>
                {showTemplates ? 'Hide templates' : 'Load template'}
              </Button>
            </div>
            {showTemplates && (
              <TemplatePicker
                teamId={content.teamId}
                onApply={applyTemplate}
                onCancel={() => setShowTemplates(false)}
              />
            )}
            <MarkdownEditor
              value={body}
              onChange={setBody}
              placeholder="Write content in Markdown…"
              contentId={id}
              onInsertMedia={() => setShowMedia(true)}
            />
          </div>
        ) : (
          <Preview body={content.body} />
        )}
      </Card>

      {/* Platform adaptation preview (PRD §3.4 适配预览) */}
      <AdaptationPreview
        body={editing ? body : content.body ?? ''}
        contentType={contentType}
        imageCount={countMarkdownImages(editing ? body : content.body ?? '')}
        videoCount={0}
        videoDurationSec={0}
      />

      {/* Media library modal */}
      {showMedia && (
        <MediaLibrary contentId={id} onSelect={insertMedia} onClose={() => setShowMedia(false)} />
      )}

      {/* Versions */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Version history</h2>
          {!showVersionForm && (
            <Button variant="secondary" onClick={() => setShowVersionForm(true)}>
              + Save new version
            </Button>
          )}
        </div>

        {showVersionForm && (
          <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
            <Textarea
              rows={2}
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="What changed in this version?"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowVersionForm(false)}>Cancel</Button>
              <Button onClick={saveVersion} disabled={savingVersion}>
                {savingVersion ? 'Saving…' : 'Save version'}
              </Button>
            </div>
          </div>
        )}

        {versions.length === 0 ? (
          <p className="text-sm text-slate-400">No version history yet.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-slate-700">
                    v{v.version} <span className="text-slate-400">— {v.title}</span>
                  </div>
                  {v.changeNote && <div className="text-sm text-slate-500">{v.changeNote}</div>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{new Date(v.createdAt).toLocaleString()}</span>
                  <Button
                    variant="secondary"
                    disabled={editing || rollingBackVersion !== null}
                    onClick={() => rollbackToVersion(v.version)}
                  >
                    {rollingBackVersion === v.version ? 'Rolling back…' : 'Roll back'}
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

export default function ContentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  return (
    <Suspense fallback={<div className="text-slate-400">Loading…</div>}>
      <ContentDetail id={id} />
    </Suspense>
  );
}
