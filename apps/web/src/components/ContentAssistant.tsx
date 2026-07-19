'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, Badge } from '@/lib/ui';
import {
  AUDIT_GRADE_LABELS,
  AUDIT_GRADE_TONE,
  AuditSeverity,
  ContentAuditResult,
  CopyVariant,
  PlatformAudit,
  TagExtractResult,
  TitleOptimizeResult,
  VariantGenerateResult,
  VARIANT_STYLE_LABELS,
  VariantStyle,
} from '@/lib/types';
import { useT } from '@/lib/i18n';
import type { ZhCnKey } from '@/lib/locales/zhCn';

/**
 * AI Content Assistant panel (PRD §3.3 V1.1 AI 辅助写作). Offers four
 * deterministic helpers over the current draft: optimize titles, extract tags,
 * audit against platform rules, and generate copy variants. Designed to live
 * in the content editor, re-projecting as the draft changes (debounced).
 */
export default function ContentAssistant({
  body,
  contentType,
  imageCount,
  videoCount,
  videoDurationSec,
  platforms,
  onApplyTitle,
  onApplyTags,
  onApplyBody,
}: {
  body: string;
  contentType: string;
  imageCount?: number;
  videoCount?: number;
  videoDurationSec?: number;
  platforms?: string[];
  /** When provided, title/tag/variant results become clickable to apply. */
  onApplyTitle?: (title: string) => void;
  onApplyTags?: (tags: string[]) => void;
  onApplyBody?: (body: string) => void;
}) {
  const { t } = useT();
  const [tab, setTab] = useState<'titles' | 'tags' | 'audit' | 'variants'>('titles');

  const tabLabels: Record<'titles' | 'tags' | 'audit' | 'variants', ZhCnKey> = {
    titles: 'content.title_label',
    tags: 'content.tags',
    audit: 'nav.audit',
    variants: 'content.contentType',
  };

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">{t('assistant.title')}</h2>
        <div className="flex gap-1">
          {(['titles', 'tags', 'audit', 'variants'] as const).map((tabKey) => (
            <Button
              key={tabKey}
              variant={tab === tabKey ? 'primary' : 'secondary'}
              className="px-2 py-1 text-xs"
              onClick={() => setTab(tabKey)}
            >
              {t(tabLabels[tabKey])}
            </Button>
          ))}
        </div>
      </div>

      {tab === 'titles' && (
        <TitleTab
          body={body}
          contentType={contentType}
          platforms={platforms}
          onApply={onApplyTitle}
        />
      )}
      {tab === 'tags' && (
        <TagTab body={body} onApply={onApplyTags} />
      )}
      {tab === 'audit' && (
        <AuditTab
          body={body}
          contentType={contentType}
          imageCount={imageCount}
          videoCount={videoCount}
          videoDurationSec={videoDurationSec}
          platforms={platforms}
        />
      )}
      {tab === 'variants' && (
        <VariantTab
          body={body}
          contentType={contentType}
          onApply={onApplyBody}
        />
      )}
    </Card>
  );
}

// ── Shared fetch helper ───────────────────────────────────────────────────

function useAssistantPayload(body: string, contentType: string) {
  return useMemo(() => ({ body, contentType }), [body, contentType]);
}

// ── Titles ────────────────────────────────────────────────────────────────

function TitleTab({
  body,
  contentType,
  platforms,
  onApply,
}: {
  body: string;
  contentType: string;
  platforms?: string[];
  onApply?: (title: string) => void;
}) {
  const { t } = useT();
  const payload = useAssistantPayload(body, contentType);
  const [result, setResult] = useState<TitleOptimizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!body.trim()) {
      setResult(null);
      return;
    }
    let active = true;
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      api
        .post<TitleOptimizeResult>('/assistant/titles', { ...payload, count: 5, platforms })
        .then((r) => active && setResult(r))
        .catch((e: any) => active && setError(e?.message ?? 'Failed to optimize titles.'))
        .finally(() => active && setLoading(false));
    }, 300);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [payload, body, platforms]);

  return (
    <div className="flex flex-col gap-2">
      {loading && <p className="text-sm text-slate-400">{t('common.loading')}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && result && result.variants.length === 0 && (
        <p className="text-sm text-slate-400">{t('assistant.writeDraft')}</p>
      )}
      {!loading && result?.variants.map((v, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm text-slate-800">{v.title}</div>
            <div className="text-xs text-slate-400">{v.strategy}</div>
          </div>
          {onApply && (
            <Button variant="secondary" className="shrink-0 text-xs" onClick={() => onApply(v.title)}>
              {t('common.actions')}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Tags ──────────────────────────────────────────────────────────────────

function TagTab({
  body,
  onApply,
}: {
  body: string;
  onApply?: (tags: string[]) => void;
}) {
  const { t } = useT();
  const payload = useAssistantPayload(body, 'TEXT');
  const [result, setResult] = useState<TagExtractResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!body.trim()) {
      setResult(null);
      return;
    }
    let active = true;
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      api
        .post<TagExtractResult>('/assistant/tags', { ...payload, count: 8 })
        .then((r) => active && setResult(r))
        .catch((e: any) => active && setError(e?.message ?? 'Failed to extract tags.'))
        .finally(() => active && setLoading(false));
    }, 300);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [payload, body]);

  return (
    <div className="flex flex-col gap-2">
      {loading && <p className="text-sm text-slate-400">{t('common.loading')}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && result && result.tags.length === 0 && (
        <p className="text-sm text-slate-400">{t('common.empty')}</p>
      )}
      {!loading && result && result.tags.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {result.tags.map((tag) => (
              <Badge key={tag}>#{tag}</Badge>
            ))}
          </div>
          {onApply && (
            <div className="flex justify-end">
              <Button variant="secondary" className="text-xs" onClick={() => onApply(result.tags)}>
                {t('content.create')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Audit ─────────────────────────────────────────────────────────────────

function AuditTab({
  body,
  contentType,
  imageCount,
  videoCount,
  videoDurationSec,
  platforms,
}: {
  body: string;
  contentType: string;
  imageCount?: number;
  videoCount?: number;
  videoDurationSec?: number;
  platforms?: string[];
}) {
  const { t } = useT();
  const payload = useAssistantPayload(body, contentType);
  const [result, setResult] = useState<ContentAuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!body.trim()) {
      setResult(null);
      return;
    }
    let active = true;
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      api
        .post<ContentAuditResult>('/assistant/audit', {
          ...payload,
          imageCount,
          videoCount,
          videoDurationSec,
          platforms,
        })
        .then((r) => active && setResult(r))
        .catch((e: any) => active && setError(e?.message ?? 'Failed to audit.'))
        .finally(() => active && setLoading(false));
    }, 300);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [payload, body, contentType, imageCount, videoCount, videoDurationSec, platforms]);

  const platformBy = useMemo(() => {
    const map: Record<string, PlatformAudit> = {};
    for (const p of result?.platforms ?? []) map[p.platform] = p;
    return map;
  }, [result]);

  return (
    <div className="flex flex-col gap-3">
      {loading && <p className="text-sm text-slate-400">{t('common.loading')}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && result && (
        <>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">Score</span>
            <span className="text-lg font-semibold text-slate-900">{result.score}/100</span>
            <Badge tone={AUDIT_GRADE_TONE[result.grade]}>{AUDIT_GRADE_LABELS[result.grade]}</Badge>
          </div>

          {result.findings.length > 0 && (
            <ul className="flex flex-col gap-1">
              {result.findings.map((f, i) => (
                <li key={i} className="text-xs text-slate-600">
                  <ToneDot severity={f.severity} /> {f.message}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2">
            {(result.platforms ?? []).map((p) => (
              <div key={p.platform} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-slate-800">{p.label}</span>
                  <span className="ml-2 font-mono text-xs text-slate-400">{p.platform}</span>
                </div>
                <Badge tone={p.fits ? 'success' : 'warning'}>{p.fits ? 'Fits' : 'Attention'}</Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Variants ──────────────────────────────────────────────────────────────

function VariantTab({
  body,
  contentType,
  onApply,
}: {
  body: string;
  contentType: string;
  onApply?: (body: string) => void;
}) {
  const { t } = useT();
  const payload = useAssistantPayload(body, contentType);
  const [result, setResult] = useState<VariantGenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!body.trim()) {
      setResult(null);
      return;
    }
    let active = true;
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      api
        .post<VariantGenerateResult>('/assistant/variants', { ...payload, style: 'all' })
        .then((r) => active && setResult(r))
        .catch((e: any) => active && setError(e?.message ?? 'Failed to generate variants.'))
        .finally(() => active && setLoading(false));
    }, 300);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [payload, body, contentType]);

  return (
    <div className="flex flex-col gap-3">
      {loading && <p className="text-sm text-slate-400">{t('common.loading')}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && result?.variants.map((v) => (
        <VariantRow key={v.style} variant={v} onApply={onApply} />
      ))}
    </div>
  );
}

function VariantRow({ variant, onApply }: { variant: CopyVariant; onApply?: (body: string) => void }) {
  const { t } = useT();
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">
          {VARIANT_STYLE_LABELS[variant.style]}
        </span>
        {onApply && (
          <Button variant="secondary" className="shrink-0 text-xs" onClick={() => onApply(variant.body)}>
            {t('common.actions')}
          </Button>
        )}
      </div>
      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-slate-600">
        {variant.body}
      </pre>
    </div>
  );
}

function ToneDot({ severity }: { severity: AuditSeverity }) {
  const cls =
    severity === 'error'
      ? 'bg-red-500'
      : severity === 'warning'
        ? 'bg-amber-500'
        : 'bg-slate-400';
  return <span className={`mr-1 inline-block h-2 w-2 rounded-full ${cls}`} />;
}
