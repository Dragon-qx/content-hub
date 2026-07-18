'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, Badge } from '@/lib/ui';
import {
  AdaptationResult,
  PlatformAdaptation,
  PlatformRule,
} from '@/lib/types';

/**
 * Live "how will this look on each platform" panel (PRD §3.4 适配预览). The
 * author edits the draft in the sibling editor; this re-projects the current
 * body + media against every platform's limits and flags truncation / dropped
 * media / duration issues before anything is scheduled or published.
 */
export default function AdaptationPreview({
  body,
  contentType,
  imageCount,
  videoCount,
  videoDurationSec,
}: {
  body: string;
  contentType: string;
  imageCount: number;
  videoCount: number;
  videoDurationSec: number;
}) {
  const [result, setResult] = useState<AdaptationResult | null>(null);
  const [rules, setRules] = useState<PlatformRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pull the static rule catalog once for labels and the raw limits.
  useEffect(() => {
    let active = true;
    api
      .get<PlatformRule[]>('/adaptation/rules')
      .then((r) => {
        if (active) setRules(r);
      })
      .catch(() => {
        /* non-fatal — the preview still works with server-returned labels */
      });
    return () => {
      active = false;
    };
  }, []);

  // Debounce the preview request so typing doesn't hammer the endpoint.
  useEffect(() => {
    let active = true;
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      api
        .post<AdaptationResult>('/adaptation/preview', {
          body,
          contentType,
          imageCount,
          videoCount,
          videoDurationSec,
        })
        .then((res) => {
          if (active) setResult(res);
        })
        .catch((err: any) => {
          if (active) setError(err?.message ?? 'Preview failed.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [body, contentType, imageCount, videoCount, videoDurationSec]);

  const labelByPlatform = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rules) map[r.platform] = r.label;
    return map;
  }, [rules]);

  const summary = useMemo(() => {
    if (!result) return null;
    const total = result.platforms.length;
    const fits = result.platforms.filter((p) => p.fits).length;
    return { total, fits };
  }, [result]);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          Platform adaptation preview
        </h2>
        {summary && (
          <Badge tone={summary.fits === summary.total ? 'success' : 'warning'}>
            {summary.fits}/{summary.total} platforms fit
          </Badge>
        )}
      </div>

      {loading && <p className="text-sm text-slate-400">Projecting…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && result && (
        <div className="flex flex-col gap-3">
          {result.platforms.map((p) => (
            <PlatformRow
              key={p.platform}
              adaptation={p}
              label={labelByPlatform[p.platform] ?? p.label}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function PlatformRow({
  adaptation,
  label,
}: {
  adaptation: PlatformAdaptation;
  label: string;
}) {
  const { platform, fits, truncated, bodyLength, maxLength, warnings, hints } =
    adaptation;

  const preview = adaptation.adaptedBody.trim()
    ? adaptation.adaptedBody.length > 90
      ? `${adaptation.adaptedBody.slice(0, 90)}…`
      : adaptation.adaptedBody
    : '（空正文）';

  return (
    <div className="rounded-lg border border-slate-200 p-2 sm:p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-800 sm:text-sm">{label}</span>
          <span className="font-mono text-[10px] text-slate-400 sm:text-xs">{platform}</span>
        </div>
        <Badge tone={fits ? 'success' : 'danger'}>
          <span className="hidden sm:inline">{fits ? 'Fits' : 'Needs attention'}</span>
          <span className="sm:hidden">{fits ? 'Fit' : 'No'}</span>
        </Badge>
      </div>

      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500 sm:text-xs">
        <span>
          Body: {bodyLength}/{maxLength}
          {truncated && <span className="ml-1 text-amber-600">(truncated)</span>}
        </span>
        {adaptation.imageMax > 0 && (
          <span>
            Images: {adaptation.imagesUsed}/{adaptation.imageMax}
            {adaptation.imagesDropped > 0 && (
              <span className="ml-1 text-amber-600">(-{adaptation.imagesDropped})</span>
            )}
          </span>
        )}
        {adaptation.videoMax > 0 && (
          <span>
            Videos: {adaptation.videosUsed}/{adaptation.videoMax}
            {adaptation.videosDropped > 0 && (
              <span className="ml-1 text-amber-600">(-{adaptation.videosDropped})</span>
            )}
          </span>
        )}
      </div>

      <p className="mb-2 rounded bg-slate-50 px-2 py-1 font-mono text-xs text-slate-600 sm:px-3 sm:py-2">
        {preview}
      </p>

      {warnings.length > 0 && (
        <ul className="mb-1 flex flex-col gap-1">
          {warnings.map((w, i) => (
            <li key={i} className="text-xs text-amber-700">
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}

      {hints.length > 0 && (
        <ul className="flex flex-col gap-1">
          {hints.map((h, i) => (
            <li key={i} className="text-xs text-slate-400">
              • {h}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
