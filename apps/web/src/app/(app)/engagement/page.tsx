'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, Paginated } from '@/lib/api';
import { Badge, Button, Card, Field, Input, Select, Textarea } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import {
  PLATFORMS,
  Platform,
  Sentiment,
  SENTIMENT_TONE,
  SENTIMENT_LABELS,
  EngagementComment,
  EngagementStats,
  EngagementMessage,
  CommentTemplate,
  SentimentKeyword,
} from '@/lib/types';

interface Filters {
  platform: Platform | '';
  sentiment: Sentiment | '';
  unreplied: boolean;
}

const INITIAL: Filters = { platform: '', sentiment: '', unreplied: false };

const TAKE = 20;

function Stats({ stats }: { stats: EngagementStats | null }) {
  if (!stats) return null;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
      {[
        { label: 'Total', value: stats.total },
        { label: 'Unreplied', value: stats.unreplied },
        { label: 'Positive', value: stats.positive },
        { label: 'Neutral', value: stats.neutral },
        { label: 'Negative', value: stats.negative },
      ].map((s) => (
        <Card key={s.label}>
          <div className="text-sm text-slate-500">{s.label}</div>
          <div className="mt-1 text-2xl font-semibold">{s.value.toLocaleString()}</div>
        </Card>
      ))}
    </div>
  );
}

export default function EngagementPage() {
  const [stats, setStats] = useState<EngagementStats | null>(null);
  const [items, setItems] = useState<EngagementComment[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(INITIAL);

  // Reply draft keyed by comment id.
  const [replying, setReplying] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  // Quick templates.
  const [templates, setTemplates] = useState<CommentTemplate[]>([]);
  const [showTplForm, setShowTplForm] = useState(false);
  const [tplTitle, setTplTitle] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplSaving, setTplSaving] = useState(false);

  // Sentiment alert keywords.
  const [keywords, setKeywords] = useState<SentimentKeyword[]>([]);
  const [kwInput, setKwInput] = useState('');
  const [kwSaving, setKwSaving] = useState(false);

  // Comment sync.
  const [syncing, setSyncing] = useState(false);
  const [syncInfo, setSyncInfo] = useState<string | null>(null);

  // Messages inbox.
  const [messages, setMessages] = useState<EngagementMessage[]>([]);
  const [msgTotal, setMsgTotal] = useState(0);
  const [msgSkip, setMsgSkip] = useState(0);
  const [msgLoading, setMsgLoading] = useState(false);
  const [tab, setTab] = useState<'comments' | 'messages'>('comments');

  const loadMessages = useCallback(async (start = 0) => {
    setMsgLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(start));
      params.set('take', String(TAKE));
      const res = await api.get<Paginated<EngagementMessage>>(
        `/engagement/messages?${params.toString()}`,
      );
      setMessages(res.items);
      setMsgTotal(res.total);
      setMsgSkip(res.skip);
    } catch {
      setMessages([]);
      setMsgTotal(0);
    } finally {
      setMsgLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      setStats(await api.get<EngagementStats>('/engagement/stats'));
    } catch {
      setStats(null);
    }
  }, []);

  const loadComments = useCallback(async (start = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('skip', String(start));
      params.set('take', String(TAKE));
      if (filters.platform) params.set('platform', filters.platform);
      if (filters.sentiment) params.set('sentiment', filters.sentiment);
      if (filters.unreplied) params.set('unreplied', 'true');

      const res = await api.get<Paginated<EngagementComment>>(
        `/engagement/comments?${params.toString()}`,
      );
      setItems(res.items);
      setTotal(res.total);
      setSkip(res.skip);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadTemplates = useCallback(async () => {
    try {
      setTemplates(await api.get<CommentTemplate[]>('/engagement/templates'));
    } catch {
      setTemplates([]);
    }
  }, []);

  const loadKeywords = useCallback(async () => {
    try {
      setKeywords(await api.get<SentimentKeyword[]>('/engagement/keywords'));
    } catch {
      setKeywords([]);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadTemplates();
    loadKeywords();
    loadMessages(0);
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadComments(0);
    // Reload the inbox when filters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const page = Math.floor(skip / TAKE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / TAKE));

  const applyTemplate = (body: string) => {
    setDraft(body);
  };

  const sendReply = async (comment: EngagementComment) => {
    if (!draft.trim()) return;
    setSaving(comment.id);
    try {
      await api.patch(`/engagement/comments/${comment.id}/reply`, { content: draft.trim() });
      setDraft('');
      setReplying(null);
      await Promise.all([loadComments(skip), loadStats()]);
    } catch (err: any) {
      // Surface the adapter reason (e.g. "XHS does not support comment replies").
      window.alert(err?.message ?? 'Reply failed.');
    } finally {
      setSaving(null);
    }
  };

  const saveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplTitle.trim() || !tplBody.trim()) return;
    setTplSaving(true);
    try {
      await api.post('/engagement/templates', { title: tplTitle.trim(), body: tplBody.trim() });
      setTplTitle('');
      setTplBody('');
      setShowTplForm(false);
      await loadTemplates();
    } finally {
      setTplSaving(false);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    setSyncInfo(null);
    try {
      const res = await api.post<{
        accounts: number;
        comments: number;
        messages: number;
      }>('/engagement/sync', {});
      setSyncInfo(
        `Synced ${res.accounts} account(s): ${res.comments} comment(s), ` +
          `${res.messages} message(s).`,
      );
      await Promise.all([
        loadComments(skip),
        loadMessages(msgSkip),
        loadStats(),
      ]);
    } catch (err: any) {
      setSyncInfo(err?.message ?? 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const addKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = kwInput.trim();
    if (!value) return;
    setKwSaving(true);
    try {
      await api.post('/engagement/keywords', { keyword: value });
      setKwInput('');
      await loadKeywords();
    } catch (err: any) {
      window.alert(err?.message ?? 'Could not add keyword.');
    } finally {
      setKwSaving(false);
    }
  };

  const removeKeyword = async (id: string) => {
    try {
      await api.del(`/engagement/keywords/${id}`);
      await loadKeywords();
    } catch (err: any) {
      window.alert(err?.message ?? 'Could not remove keyword.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Engagement" subtitle="Unified inbox for comments across platforms" />

      <Stats stats={stats} />

      {/* Inbox tabs */}
      <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setTab('comments')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            tab === 'comments'
              ? 'bg-primary text-white'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Comments
        </button>
        <button
          type="button"
          onClick={() => setTab('messages')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            tab === 'messages'
              ? 'bg-primary text-white'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Messages
        </button>
      </div>

      {/* Filters — comments tab only */}
      {tab === 'comments' && (
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={filters.platform}
            onChange={(e) => setFilters((f) => ({ ...f, platform: e.target.value as Platform }))}
            className="w-full sm:max-w-[180px]"
          >
            <option value="">All platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>
          <Select
            value={filters.sentiment}
            onChange={(e) =>
              setFilters((f) => ({ ...f, sentiment: e.target.value as Sentiment }))
            }
            className="w-full sm:max-w-[160px]"
          >
            <option value="">All sentiment</option>
            {(['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as Sentiment[]).map((s) => (
              <option key={s} value={s}>{SENTIMENT_LABELS[s]}</option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={filters.unreplied}
              onChange={(e) => setFilters((f) => ({ ...f, unreplied: e.target.checked }))}
            />
            Unreplied only
          </label>
          {syncInfo && (
            <span className="text-xs text-emerald-600">{syncInfo}</span>
          )}
          <div className="flex-1" />
          <Button
            variant="secondary"
            onClick={() => { loadStats(); loadComments(skip); }}
          >
            Refresh
          </Button>
          <Button variant="primary" disabled={syncing} onClick={runSync}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>
      </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Inbox */}
        <div className="lg:col-span-2">
          <Card className="flex min-h-[400px] flex-col">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                <span className="text-slate-700">
                  {tab === 'comments' ? 'Inbox' : 'Messages'}
                </span>
                <span className="ml-2 text-xs text-slate-400">
                  {tab === 'comments' ? `${total} comments` : `${msgTotal} messages`}
                </span>
              </h2>
            </div>

            {tab === 'comments' ? (
              <>
                {loading ? (
                  <div className="text-sm text-slate-400">Loading…</div>
                ) : items.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
                    No comments yet. Connect an account and publish to start gathering comments.
                  </div>
                ) : (
                  <ul className="flex flex-col divide-y divide-slate-100">
                    {items.map((c) => (
                      <li key={c.id} className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone="neutral">{c.account?.platform ?? c.platform}</Badge>
                              <Badge tone={SENTIMENT_TONE[c.sentiment]}>{SENTIMENT_LABELS[c.sentiment]}</Badge>
                              <span className="text-xs text-slate-400">
                                by {c.authorName || 'anonymous'}
                                {c.likeCount > 0 && ` · ${c.likeCount} likes`}
                              </span>
                            </div>
                            <p className="mt-1 break-words text-sm text-slate-700">{c.content}</p>
                            {c.replied && (
                              <p className="mt-1 text-xs text-emerald-700">
                                Replied: {c.replyContent}
                              </p>
                            )}
                          </div>
                          {!c.replied && (
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setReplying(c.id);
                                setDraft('');
                              }}
                            >
                              Reply
                            </Button>
                          )}
                        </div>

                        {/* Reply composer */}
                        {replying === c.id && (
                          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <Textarea
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              placeholder="Write a reply…"
                              className="min-h-[80px]"
                            />
                            {templates.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                <span className="text-xs text-slate-500">Templates:</span>
                                {templates.map((t) => (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => applyTemplate(t.body)}
                                    className="rounded bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                                  >
                                    {t.title}
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="mt-2 flex justify-end gap-2">
                              <Button variant="secondary" onClick={() => setReplying(null)}>
                                Cancel
                              </Button>
                              <Button
                                onClick={() => sendReply(c)}
                                disabled={saving === c.id || !draft.trim()}
                              >
                                {saving === c.id ? 'Sending…' : 'Send reply'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Comments pagination */}
                {total > TAKE && (
                  <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                    <span>
                      Page {page} of {pageCount}
                    </span>
                    <div className="flex gap-2">
                      <Button variant="secondary" disabled={page <= 1} onClick={() => loadComments(skip - TAKE)}>
                        Prev
                      </Button>
                      <Button variant="secondary" disabled={page >= pageCount} onClick={() => loadComments(skip + TAKE)}>
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {msgLoading ? (
                  <div className="text-sm text-slate-400">Loading…</div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
                    No messages yet. Sync to start gathering private messages.
                  </div>
                ) : (
                  <ul className="flex flex-col divide-y divide-slate-100">
                    {messages.map((m) => (
                      <li key={m.id} className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone="neutral">{m.account?.platform ?? m.platform}</Badge>
                              <Badge tone={m.sentByMe ? 'success' : 'neutral'}>
                                {m.sentByMe ? 'Sent by you' : 'Received'}
                              </Badge>
                              <span className="text-xs text-slate-400">
                                {m.sentByMe ? 'to' : 'from'} {m.authorName || 'anonymous'}
                              </span>
                            </div>
                            <p className="mt-1 break-words text-sm text-slate-700">{m.content}</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Messages pagination */}
                {msgTotal > TAKE && (
                  <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                    <span>
                      Page {Math.floor(msgSkip / TAKE) + 1} of {Math.max(1, Math.ceil(msgTotal / TAKE))}
                    </span>
                    <div className="flex gap-2">
                      <Button variant="secondary" disabled={msgSkip <= 0} onClick={() => loadMessages(msgSkip - TAKE)}>
                        Prev
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={msgSkip + TAKE >= msgTotal}
                        onClick={() => loadMessages(msgSkip + TAKE)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        {/* Quick-reply templates */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Quick reply templates</h2>
            <Button variant="secondary" onClick={() => setShowTplForm((s) => !s)}>
              {showTplForm ? 'Close' : 'New template'}
            </Button>
          </div>

          {showTplForm && (
            <form onSubmit={saveTemplate} className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <Field label="Title">
                <Input value={tplTitle} onChange={(e) => setTplTitle(e.target.value)} placeholder="e.g. Thanks" />
              </Field>
              <Field label="Body">
                <Textarea
                  value={tplBody}
                  onChange={(e) => setTplBody(e.target.value)}
                  placeholder="Reply text…"
                  className="min-h-[80px]"
                />
              </Field>
              <div className="flex justify-end">
                <Button type="submit" disabled={tplSaving || !tplTitle.trim() || !tplBody.trim()}>
                  {tplSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </form>
          )}

          {templates.length === 0 ? (
            <p className="text-sm text-slate-400">
              No templates yet. Create one to speed up replies.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100">
              {templates.map((t) => (
                <li key={t.id} className="py-2">
                  <button
                    type="button"
                    onClick={() => applyTemplate(t.body)}
                    className="text-left text-sm font-medium text-slate-700 hover:text-primary"
                  >
                    {t.title}
                  </button>
                  <p className="line-clamp-2 text-xs text-slate-500">{t.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Sentiment alerts */}
        <Card>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-base font-semibold">Sentiment alerts</h2>
            <Badge tone={keywords.length > 0 ? 'warning' : 'neutral'}>
              {keywords.length} keyword{keywords.length === 1 ? '' : 's'}
            </Badge>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Get notified when a new comment contains one of these keywords or is
            strongly negative. Comments are also auto-ingested periodically.
          </p>

          <form onSubmit={addKeyword} className="mb-3 flex gap-2">
            <Input
              value={kwInput}
              onChange={(e) => setKwInput(e.target.value)}
              placeholder="e.g. refund, 垃圾"
            />
            <Button type="submit" disabled={kwSaving || !kwInput.trim()}>
              {kwSaving ? 'Adding…' : 'Add'}
            </Button>
          </form>

          {keywords.length === 0 ? (
            <p className="text-sm text-slate-400">
              No watch keywords yet. Add one to start monitoring sentiment.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {keywords.map((k) => (
                <li
                  key={k.id}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200"
                >
                  <span>{k.keyword}</span>
                  <button
                    type="button"
                    onClick={() => removeKeyword(k.id)}
                    className="text-amber-600 hover:text-amber-900"
                    aria-label={`Remove ${k.keyword}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
