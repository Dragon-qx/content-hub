'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, downloadFile, Paginated } from '@/lib/api';
import { Button, Card, Input, Select } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { Table } from '@/components/Table';
import { AuditLog } from '@/lib/types';

interface AuditFilters {
  action: string;
  resourceType: string;
  operator: string;
  from: string;
  to: string;
}

const INITIAL_FILTERS: AuditFilters = {
  action: '',
  resourceType: '',
  operator: '',
  from: '',
  to: '',
};

const ACTIONS = ['', 'CREATE', 'UPDATE', 'DELETE', 'CREATE_VERSION', 'SUBMIT', 'APPROVE', 'REJECT', 'ARCHIVE', 'ADD_MEMBER', 'REMOVE_MEMBER', 'LOGIN'];
const RESOURCE_TYPES = ['', 'Content', 'Account', 'Team', 'User'];

function buildQuery(filters: AuditFilters, skip: number, take: number): string {
  const params = new URLSearchParams();
  params.set('skip', String(skip));
  params.set('take', String(take));
  if (filters.action) params.set('action', filters.action);
  if (filters.resourceType) params.set('resourceType', filters.resourceType);
  if (filters.operator) params.set('operator', filters.operator);
  if (filters.from) params.set('from', new Date(filters.from).toISOString());
  if (filters.to) params.set('to', new Date(filters.to).toISOString());
  return params.toString();
}

export default function AuditPage() {
  const [filters, setFilters] = useState<AuditFilters>(INITIAL_FILTERS);
  const [items, setItems] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState<AuditLog | null>(null);
  const take = 20;

  const load = async (start = 0) => {
    setLoading(true);
    try {
      const res = await api.get<Paginated<AuditLog>>(`/audit?${buildQuery(filters, start, take)}`);
      setItems(res.items);
      setTotal(res.total);
      setSkip(res.skip);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(0);
    // Reload whenever a filter changes, resetting to the first page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const page = Math.floor(skip / take) + 1;
  const pageCount = Math.max(1, Math.ceil(total / take));

  const onExport = async () => {
    setExporting(true);
    try {
      await downloadFile(`/audit/export?${buildQuery(filters, 0, take)}`, 'audit-log.csv');
    } finally {
      setExporting(false);
    }
  };

  const effectiveOperator = (row: AuditLog) =>
    row.user?.name || row.user?.email || row.userId;

  const reset = () => setFilters(INITIAL_FILTERS);

  const metadataPreview = useMemo(() => {
    if (!detail) return null;
    const md = detail.metadata;
    if (md === null || md === undefined) return '—';
    return typeof md === 'string' ? md : JSON.stringify(md, null, 2);
  }, [detail]);

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle={`${total} recorded operation${total === 1 ? '' : 's'}`}
        actions={
          <Button variant="secondary" onClick={onExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        }
      />

      <Card className="mb-6">
        <form
          onSubmit={(e) => e.preventDefault()}
          className="grid grid-cols-2 gap-3 lg:grid-cols-5"
        >
          <Select
            value={filters.action}
            onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a === '' ? 'All actions' : a}
              </option>
            ))}
          </Select>
          <Select
            value={filters.resourceType}
            onChange={(e) => setFilters((f) => ({ ...f, resourceType: e.target.value }))}
          >
            {RESOURCE_TYPES.map((r) => (
              <option key={r} value={r}>
                {r === '' ? 'All resources' : r}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Operator name or email"
            value={filters.operator}
            onChange={(e) => setFilters((f) => ({ ...f, operator: e.target.value }))}
          />
          <Input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          />
          <Input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          />
        </form>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={reset}>
            Reset
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <Table<AuditLog>
          rows={items}
          emptyMessage="No audit records match the current filters."
          columns={[
            {
              key: 'time',
              header: 'Timestamp',
              render: (r) => (
                <span className="text-slate-700">
                  {new Date(r.createdAt).toLocaleString()}
                </span>
              ),
            },
            {
              key: 'operator',
              header: 'Operator',
              render: (r) => (
                <span className="font-medium text-slate-700">{effectiveOperator(r)}</span>
              ),
            },
            {
              key: 'action',
              header: 'Action',
              render: (r) => (
                <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  {r.action}
                </span>
              ),
            },
            {
              key: 'resource',
              header: 'Resource',
              render: (r) => (
                <span className="text-slate-600">
                  {r.entityType}
                  {r.entityId ? ` · ${r.entityId}` : ''}
                </span>
              ),
            },
            {
              key: 'ip',
              header: 'IP',
              render: (r) => <span className="text-slate-500">{r.ipAddress ?? '—'}</span>,
            },
            {
              key: 'actions',
              header: '',
              render: (r) => (
                <Button variant="ghost" onClick={() => setDetail(r)}>
                  Details
                </Button>
              ),
            },
          ]}
        />
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <div>
          Page {page} of {pageCount}
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={skip === 0}
            onClick={() => load(Math.max(0, skip - take))}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={skip + take >= total}
            onClick={() => load(skip + take)}
          >
            Next
          </Button>
        </div>
      </div>

      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-semibold text-slate-900">
              Audit entry detail
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              {detail.action} · {new Date(detail.createdAt).toLocaleString()}
            </p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-slate-100 py-1">
                <dt className="text-slate-500">Operator</dt>
                <dd className="font-medium text-slate-700">{effectiveOperator(detail)}</dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <dt className="text-slate-500">Action</dt>
                <dd className="text-slate-700">{detail.action}</dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <dt className="text-slate-500">Resource</dt>
                <dd className="text-slate-700">
                  {detail.entityType}
                  {detail.entityId ? ` (${detail.entityId})` : ''}
                </dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <dt className="text-slate-500">IP address</dt>
                <dd className="text-slate-700">{detail.ipAddress ?? '—'}</dd>
              </div>
              <div className="pt-1">
                <dt className="mb-1 text-slate-500">Change details (metadata)</dt>
                <dd>
                  <pre className="max-h-60 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                    {metadataPreview}
                  </pre>
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex justify-end">
              <Button onClick={() => setDetail(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
