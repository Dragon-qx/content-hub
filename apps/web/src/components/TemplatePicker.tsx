'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, Input } from '@/lib/ui';
import { ContentTemplate, Paginated, TemplateDraftSeed, TemplateVariable } from '@/lib/types';

/**
 * Pick a team template and apply it to seed a draft. Fetches the team's
 * templates, lets the user search, and on select calls the backend
 * `apply` endpoint, invoking `onApply` with the resulting draft seed.
 */
export default function TemplatePicker({
  teamId,
  onApply,
  onCancel,
}: {
  teamId: string;
  onApply: (seed: TemplateDraftSeed) => void;
  onCancel: () => void;
}) {
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [applying, setApplying] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ContentTemplate | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [resolvedPreview, setResolvedPreview] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ teamId, skip: '0', take: '50' });
        if (search.trim()) qs.set('search', search.trim());
        const res = await api.get<Paginated<ContentTemplate>>(`/templates?${qs.toString()}`);
        if (active) setTemplates(res.items);
      } catch (err: any) {
        if (active) setError(err?.message ?? 'Failed to load templates.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [teamId, search]);

  const choose = async (t: ContentTemplate) => {
    setApplying(t.id);
    setError(null);
    try {
      const seed = await api.post<TemplateDraftSeed>(`/templates/${t.id}/apply`, {
        teamId,
        values: Object.keys(variableValues).length > 0 ? variableValues : undefined,
      });
      onApply(seed);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to apply template.');
    } finally {
      setApplying(null);
    }
  };

  const previewVariables = async (t: ContentTemplate) => {
    setSelectedTemplate(t);
    setVariableValues({});
    setResolvedPreview(null);
    if (t.variables && t.variables.length > 0) {
      try {
        const res = await api.post<{ title: string; body: string }>(`/templates/${t.id}/resolve`, {});
        setResolvedPreview(res);
      } catch {
        // ignore preview errors
      }
    }
  };

  const updateVariable = async (key: string, value: string) => {
    if (!selectedTemplate) return;
    const newValues = { ...variableValues, [key]: value };
    setVariableValues(newValues);
    try {
      const res = await api.post<{ title: string; body: string }>(`/templates/${selectedTemplate.id}/resolve`, {
        values: newValues,
      });
      setResolvedPreview(res);
    } catch {
      // ignore preview errors
    }
  };

  const applyWithVariables = async () => {
    if (!selectedTemplate) return;
    await choose(selectedTemplate);
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Load from template</h3>
        <Button variant="secondary" onClick={onCancel}>
          Close
        </Button>
      </div>
      <Input
        placeholder="Search templates…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {selectedTemplate ? (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-slate-700">{selectedTemplate.title}</h4>
            <Button variant="secondary" onClick={() => setSelectedTemplate(null)}>
              Back
            </Button>
          </div>
          {selectedTemplate.variables && selectedTemplate.variables.length > 0 ? (
            <>
              <div className="flex flex-col gap-2">
                {selectedTemplate.variables.map((v) => (
                  <label key={v.key} className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-slate-600">
                      {v.label}
                      {v.required && <span className="text-red-500"> *</span>}
                    </span>
                    <Input
                      type={v.type === 'number' ? 'number' : v.type === 'date' ? 'date' : 'text'}
                      placeholder={v.defaultValue ?? `Enter ${v.label.toLowerCase()}`}
                      value={variableValues[v.key] ?? ''}
                      onChange={(e) => updateVariable(v.key, e.target.value)}
                    />
                  </label>
                ))}
              </div>
              {resolvedPreview && (
                <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">Preview</p>
                  <p className="text-sm font-medium text-slate-700">{resolvedPreview.title}</p>
                  <p className="whitespace-pre-wrap text-xs text-slate-600">{resolvedPreview.body || '(empty body)'}</p>
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={applyWithVariables} disabled={applying === selectedTemplate.id}>
                  {applying === selectedTemplate.id ? 'Applying…' : 'Use this template'}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-slate-500">No variables defined for this template.</p>
              <div className="flex justify-end">
                <Button onClick={applyWithVariables} disabled={applying === selectedTemplate.id}>
                  {applying === selectedTemplate.id ? 'Applying…' : 'Use this template'}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : loading ? (
        <p className="text-sm text-slate-400">Loading templates…</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-slate-400">
          No templates for this team yet. Save any piece of content as a template to reuse it.
        </p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex flex-col gap-2 rounded-lg border border-slate-100 p-2 sm:flex-row sm:items-center sm:justify-between sm:px-3 sm:py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-slate-700 sm:text-sm">{t.title}</div>
                <div className="text-[10px] text-slate-400 sm:text-xs">
                  {t.contentType}
                  {t.tags.length > 0 && <> · {t.tags.join(', ')}</>}
                  {t.variables && t.variables.length > 0 && (
                    <span className="ml-1 rounded bg-blue-100 px-1 py-0.5 text-blue-700">
                      {t.variables.length} var{t.variables.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              <Button disabled={applying === t.id} onClick={() => previewVariables(t)}>
                {applying === t.id ? 'Loading…' : 'Use'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
