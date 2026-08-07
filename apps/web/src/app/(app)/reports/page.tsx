'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, Select } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { useT } from '@/lib/i18n';

/** Mirror of the backend ReportField (PRD §3.5). */
interface ReportField {
  id: string;
  label: string;
  category: 'account' | 'content' | 'engagement' | 'time' | 'dimension';
  type: 'number' | 'string' | 'date' | 'percent';
  description?: string;
}

interface CategoryGroup {
  category: string;
  fields: ReportField[];
}

interface ReportRow {
  [key: string]: string | number | null | Date;
}

interface GeneratedReport {
  fields: ReportField[];
  rows: ReportRow[];
  totalCount: number;
  generatedAt: string;
}

interface SavedReport {
  id: string;
  teamId: string;
  name: string;
  description?: string | null;
  fieldIds: string[];
  filtersJson: string;
  groupBy?: string | null;
  sortBy?: string | null;
  sortDir?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  account: 'Account',
  content: 'Content',
  engagement: 'Engagement',
  time: 'Time',
  dimension: 'Dimension',
};

const FILTER_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'] as const;
type FilterOperator = (typeof FILTER_OPERATORS)[number];

interface FilterConfig {
  field: string;
  operator: FilterOperator;
  value: string;
}

export default function ReportsPage() {
  const { t } = useT();
  const [fieldGroups, setFieldGroups] = useState<CategoryGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterConfig[]>([]);
  const [groupBy, setGroupBy] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [result, setResult] = useState<GeneratedReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [loadOpen, setLoadOpen] = useState(false);
  const [reportName, setReportName] = useState('');
  const [reportDesc, setReportDesc] = useState('');
  const [error, setError] = useState<string | null>(null);

  // --- Initial load: available fields + saved reports ---
  useEffect(() => {
    const load = async () => {
      try {
        const [fields, reports] = await Promise.all([
          api.get<{ categories: CategoryGroup[] }>('/analytics/report-fields'),
          api.get<SavedReport[]>('/analytics/reports'),
        ]);
        setFieldGroups(fields.categories ?? []);
        setSavedReports(reports ?? []);
      } catch {
        setError('Failed to load report metadata');
      }
    };
    load();
  }, []);

  // --- Drag & drop handlers (native HTML5 DnD) ---
  const [dragId, setDragId] = useState<string | null>(null);

  const onDragStart = useCallback((fieldId: string) => {
    setDragId(fieldId);
  }, []);

  const onDropSelected = useCallback(() => {
    if (dragId && !selectedIds.includes(dragId)) {
      setSelectedIds((prev) => [...prev, dragId]);
    }
    setDragId(null);
  }, [dragId, selectedIds]);

  const addField = useCallback((fieldId: string) => {
    setSelectedIds((prev) => (prev.includes(fieldId) ? prev : [...prev, fieldId]));
  }, []);

  const removeField = useCallback((fieldId: string) => {
    setSelectedIds((prev) => prev.filter((id) => id !== fieldId));
  }, []);

  const moveField = useCallback((index: number, direction: -1 | 1) => {
    setSelectedIds((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  // --- Filter management ---
  const addFilter = useCallback(() => {
    if (selectedIds.length === 0) return;
    setFilters((prev) => [...prev, { field: selectedIds[0], operator: 'eq', value: '' }]);
  }, [selectedIds]);

  const updateFilter = useCallback((i: number, patch: Partial<FilterConfig>) => {
    setFilters((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }, []);

  const removeFilter = useCallback((i: number) => {
    setFilters((prev) => prev.filter((_, idx) => idx !== i));
  }, []);

  // --- Labels for the currently selected fields ---
  const selectedFieldLabels = useMemo(() => {
    const map = new Map<string, ReportField>();
    for (const g of fieldGroups) for (const f of g.fields) map.set(f.id, f);
    return selectedIds.map((id) => map.get(id)).filter(Boolean) as ReportField[];
  }, [fieldGroups, selectedIds]);

  // --- Generate report ---
  const generate = useCallback(async () => {
    if (selectedIds.length === 0) {
      setError('Select at least one field');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<GeneratedReport>('/analytics/reports/generate', {
        fieldIds: selectedIds,
        filters: filters.filter((f) => f.value !== ''),
        groupBy: groupBy || undefined,
        sortBy: sortBy || undefined,
        sortDir,
        limit: 100,
      });
      setResult(res);
    } catch {
      setError('Failed to generate report');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [selectedIds, filters, groupBy, sortBy, sortDir]);

  // --- Save report ---
  const save = useCallback(async () => {
    if (!reportName.trim() || selectedIds.length === 0) {
      setError('Name and at least one field required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post('/analytics/reports', {
        name: reportName.trim(),
        description: reportDesc.trim() || undefined,
        fieldIds: selectedIds,
        filters: filters.filter((f) => f.value !== ''),
        groupBy: groupBy || undefined,
        sortBy: sortBy || undefined,
        sortDir,
      });
      // refresh list
      const reports = await api.get<SavedReport[]>('/analytics/reports');
      setSavedReports(reports ?? []);
      setReportName('');
      setReportDesc('');
    } catch {
      setError('Failed to save report');
    } finally {
      setSaving(false);
    }
  }, [reportName, reportDesc, selectedIds, filters, groupBy, sortBy, sortDir]);

  // --- Load & delete ---
  const load = useCallback(async (id: string) => {
    try {
      const r = await api.get<SavedReport>(`/analytics/reports/${id}`);
      setSelectedIds(r.fieldIds ?? []);
      setFilters(r.filtersJson ? JSON.parse(r.filtersJson) : []);
      setGroupBy(r.groupBy ?? '');
      setSortBy(r.sortBy ?? '');
      setSortDir((r.sortDir as 'asc' | 'desc') ?? 'desc');
      setReportName(r.name ?? '');
      setReportDesc(r.description ?? '');
      setResult(null);
      setLoadOpen(false);
    } catch {
      setError('Failed to load report');
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      await api.del(`/analytics/reports/${id}`);
      setSavedReports((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setError('Failed to delete report');
    }
  }, []);

  // --- Export CSV ---
  const exportCsv = useCallback(() => {
    if (!result?.rows.length) return;
    const cols = result.fields.map((f) => f.id);
    const header = cols.join(',');
    const rows = result.rows.map((row) =>
      cols
        .map((c) => {
          const v = row[c];
          if (v === null || v === undefined) return '';
          const s = String(v);
          // Escape commas/quotes per RFC 4180
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [result]);

  // --- For the preview table, only show selected columns in display order ---
  const previewColumns = useMemo(() => {
    if (!result) return [];
    const ids = new Set(selectedIds);
    return result.fields.filter((f) => ids.has(f.id));
  }, [result, selectedIds]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportCsv} disabled={!result?.rows.length}>
              {t('reports.exportCsv')}
            </Button>
            <Button variant="secondary" onClick={() => setLoadOpen((v) => !v)}>
              {loadOpen ? t('common.cancel') : t('reports.load')}
            </Button>
            <Button variant="primary" onClick={generate} disabled={loading}>
              {loading ? t('reports.generating') : t('reports.generate')}
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Load / Save panel */}
      {loadOpen && (
        <Card>
          <h3 className="mb-3 text-base font-semibold">{t('reports.savedReports')}</h3>
          {savedReports.length === 0 ? (
            <p className="text-sm text-slate-400">No saved reports yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {savedReports.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium text-slate-700">{r.name}</div>
                    <div className="text-xs text-slate-400">
                      {r.fieldIds.length} field(s) · {new Date(r.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => load(r.id)}>
                      {t('reports.load')}
                    </Button>
                    <Button variant="ghost" onClick={() => remove(r.id)}>
                      {t('common.delete')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <span className="mb-1 block text-xs font-medium text-slate-600">{t('reports.name')}</span>
              <input
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder={t('reports.name')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div className="flex-1">
              <span className="mb-1 block text-xs font-medium text-slate-600">{t('reports.description')}</span>
              <input
                value={reportDesc}
                onChange={(e) => setReportDesc(e.target.value)}
                placeholder={t('common.optional')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </Card>
      )}

      {/* Main 3‑column canvas */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Left: field picker */}
        <Card className="md:col-span-1">
          <h3 className="mb-3 text-base font-semibold">{t('reports.fields')}</h3>
          <p className="mb-3 text-xs text-slate-400">{t('reports.canvasHint')}</p>
          <div className="flex flex-col gap-4">
            {fieldGroups.map((group) => (
              <div key={group.category}>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {CATEGORY_LABELS[group.category] ?? group.category}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.fields.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      draggable
                      onDragStart={() => onDragStart(f.id)}
                      onClick={() => addField(f.id)}
                      className="cursor-grab rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 transition hover:bg-indigo-50 hover:border-indigo-300 active:cursor-grabbing"
                      title={f.description ?? f.label}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Middle: canvas */}
        <Card className="md:col-span-1">
          <h3 className="mb-3 text-base font-semibold">{t('reports.canvas')}</h3>

          {/* Drop zone / selected fields */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropSelected}
            className="mb-3 min-h-[4rem] rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-3 transition hover:border-indigo-300"
          >
            {selectedIds.length === 0 ? (
              <p className="text-center text-xs text-slate-400">
                {t('reports.canvasHint')}
              </p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {selectedIds.map((id, idx) => {
                  const field = selectedFieldLabels.find((f) => f.id === id);
                  return (
                    <li
                      key={id}
                      className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-white px-2 py-1.5 text-sm"
                    >
                      <span className="text-slate-700">
                        <span className="mr-1 text-xs text-slate-400">{idx + 1}.</span>
                        {field?.label ?? id}
                      </span>
                      <span className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => moveField(idx, -1)}
                          className="rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveField(idx, 1)}
                          className="rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeField(id)}
                          className="rounded px-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* Group-by + sort */}
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-600">{t('reports.groupBy')}</span>
              <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="text-sm">
                <option value="">{t('reports.none')}</option>
                {selectedFieldLabels.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-600">{t('reports.sortBy')}</span>
              <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="text-sm">
                <option value="">{t('reports.default')}</option>
                {selectedFieldLabels.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="mb-3">
            <span className="mb-1 block text-xs font-medium text-slate-600">{t('reports.sortDirection')}</span>
            <Select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
              className="text-sm"
            >
              <option value="desc">{t('reports.descending')}</option>
              <option value="asc">{t('reports.ascending')}</option>
            </Select>
          </div>

          {/* Filters */}
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">{t('reports.filters')}</span>
            <Button variant="ghost" onClick={addFilter} disabled={selectedIds.length === 0}>
              {t('reports.addFilter')}
            </Button>
          </div>
          {filters.length === 0 ? (
            <p className="text-xs text-slate-400">{t('reports.noFilters')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {filters.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Select
                    value={f.field}
                    onChange={(e) => updateFilter(i, { field: e.target.value })}
                    className="flex-1 text-sm"
                  >
                    {selectedFieldLabels.map((sf) => (
                      <option key={sf.id} value={sf.id}>
                        {sf.label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={f.operator}
                    onChange={(e) => updateFilter(i, { operator: e.target.value as FilterOperator })}
                    className="w-20 text-sm"
                  >
                    {FILTER_OPERATORS.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </Select>
                  <input
                    value={f.value}
                    onChange={(e) => updateFilter(i, { value: e.target.value })}
                    placeholder="value"
                    className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-indigo-100"
                  />
                  <button
                    type="button"
                    onClick={() => removeFilter(i)}
                    className="rounded px-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove filter"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Right: preview */}
        <Card className="md:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold">{t('reports.preview')}</h3>
            {result && (
              <span className="text-xs text-slate-400">
                {result.totalCount} row(s) · {new Date(result.generatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          {!result ? (
            <p className="text-sm text-slate-400">Generate a report to see a preview.</p>
          ) : result.rows.length === 0 ? (
            <p className="text-sm text-slate-400">No data matches the current configuration.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {previewColumns.map((f) => (
                      <th key={f.id} className="whitespace-nowrap px-2 py-1.5 font-medium text-slate-600">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                      {previewColumns.map((f) => {
                        const val = row[f.id];
                        const display =
                          val === null || val === undefined
                            ? '—'
                            : val instanceof Date
                              ? val.toLocaleDateString()
                              : typeof val === 'number'
                                ? val.toLocaleString()
                                : String(val);
                        return (
                          <td key={f.id} className="whitespace-nowrap px-2 py-1.5 text-slate-700">
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
