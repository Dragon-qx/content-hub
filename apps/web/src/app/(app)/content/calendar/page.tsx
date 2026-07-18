'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button, Card } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { Table } from '@/components/Table';
import {
  CalendarDay,
  CalendarEvent,
  CalendarResponse,
  PLATFORMS,
  STATUS_LABELS,
  CALENDAR_EVENT_TONE,
} from '@/lib/types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function platformLabel(value: string): string {
  return PLATFORMS.find((p) => p.value === value)?.label ?? value;
}

/** Format a YYYY-MM-DD date as a human month-year heading (locale). */
function monthHeading(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function startOfMonthGrid(year: number, month: number): Date {
  // First day of the month, then back up to the previous Sunday.
  const first = new Date(Date.UTC(year, month - 1, 1));
  return new Date(Date.UTC(year, month - 1, 1 - first.getUTCDay()));
}

export default function ContentCalendarPage() {
  const [year, setYear] = useState(() => new Date().getUTCFullYear());
  const [month, setMonth] = useState(() => new Date().getUTCMonth() + 1);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<CalendarResponse>(
        `/contents/calendar?year=${year}&month=${month}`,
      );
      setData(res);
      // Keep selection valid: keep current day if present, else first day with events.
      setSelected((cur) => {
        if (cur && res.days.some((d) => d.date === cur)) return cur;
        return res.days.find((d) => d.events.length > 0)?.date ?? res.days[0]?.date ?? null;
      });
    } catch {
      setError('Failed to load calendar.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const goTo = (dir: -1 | 1) => {
    let m = month + dir;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  };

  const goToday = () => {
    const now = new Date();
    setYear(now.getUTCFullYear());
    setMonth(now.getUTCMonth() + 1);
  };

  // Build the 7-column grid: 6 rows x 7 days = 42 cells, leading/trailing
  // days from adjacent months rendered dimmed.
  const grid = useMemo(() => {
    const cursor = startOfMonthGrid(year, month);
    const byDate = new Map(data?.days.map((d) => [d.date, d.events]) ?? []);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(cursor.getTime() + i * 86_400_000);
      const m = d.getUTCMonth() + 1;
      const iso = `${d.getUTCFullYear()}-${String(m).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      return {
        date: d,
        iso,
        inMonth: m === month && d.getUTCFullYear() === year,
        events: byDate.get(iso) ?? [],
      };
    });
  }, [data, year, month]);

  const today = new Date();
  const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;

  const selectedDay = data?.days.find((d) => d.date === selected) ?? null;
  const totalScheduled = data?.days.reduce((sum, d) => sum + d.events.length, 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="Content Calendar"
        subtitle={`${monthHeading(year, month)} · ${totalScheduled} scheduled`}
        actions={
          <Button variant="secondary" onClick={goToday}>
            Today
          </Button>
        }
      />

      <Card className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <Button variant="ghost" onClick={() => goTo(-1)} aria-label="Previous month">
            ←
          </Button>
          <div className="text-center">
            <div className="text-lg font-semibold text-slate-900">
              {monthHeading(year, month)}
            </div>
          </div>
          <Button variant="ghost" onClick={() => goTo(1)} aria-label="Next month">
            →
          </Button>
        </div>

        {/* Weekday header */}
        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>

        {/* Day grid */}
        {loading ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 42 }).map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-slate-50" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell) => {
              const { iso } = cell;
              const isToday = iso === todayStr;
              const isSelected = iso === selected;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelected(iso)}
                  className={[
                    'h-20 rounded-lg border p-1 text-left text-xs transition',
                    cell.inMonth ? 'bg-white' : 'bg-slate-50 text-slate-400',
                    isSelected
                      ? 'border-primary ring-2 ring-indigo-100'
                      : 'border-slate-100 hover:border-slate-300',
                    isToday && !isSelected ? 'border-primary' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={[
                        'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium',
                        isToday ? 'bg-primary text-white' : 'text-slate-700',
                      ].join(' ')}
                    >
                      {cell.date.getUTCDate()}
                    </span>
                    {cell.events.length > 0 && (
                      <span className="rounded-full bg-indigo-100 px-1.5 text-[10px] font-medium text-indigo-700">
                        {cell.events.length}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5 overflow-hidden">
                    {cell.events.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className={[
                          'truncate rounded px-1 py-0.5 text-[10px] font-medium',
                          ev.type === 'job'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-indigo-100 text-indigo-700',
                        ].join(' ')}
                      >
                        {ev.platform ? `${platformLabel(ev.platform)} · ` : ''}
                        {ev.title}
                      </div>
                    ))}
                    {cell.events.length > 2 && (
                      <div className="px-1 text-[10px] text-slate-500">
                        +{cell.events.length - 2} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Selected-day detail */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {selected ? new Date(`${selected}T00:00:00Z`).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'UTC',
            }) : 'Select a day'}
          </h2>
        </div>

        {error ? (
          <div className="rounded-lg border border-dashed border-slate-200 px-6 py-12 text-center text-sm text-slate-400">
            {error}
          </div>
        ) : (
          <Table<CalendarEvent>
            rows={selectedDay?.events ?? []}
            emptyMessage={
              selected
                ? 'Nothing scheduled for this day.'
                : 'Select a day to see scheduled content and jobs.'
            }
            columns={[
              {
                key: 'title',
                header: 'Title',
                render: (r) =>
                  r.type === 'content' ? (
                    <Link href={`/contents/${r.id}`} className="font-medium text-primary hover:underline">
                      {r.title}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-700">{r.title}</span>
                  ),
              },
              {
                key: 'type',
                header: 'Type',
                render: (r) => (
                  <span
                    className={[
                      'rounded-full px-2.5 py-0.5 text-xs font-medium',
                      r.type === 'job'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-indigo-100 text-indigo-700',
                    ].join(' ')}
                  >
                    {r.type === 'job' ? 'Publish job' : 'Content'}
                  </span>
                ),
              },
              {
                key: 'platform',
                header: 'Platform',
                render: (r) => (
                  <span className="text-slate-500">{r.platform ? platformLabel(r.platform) : '—'}</span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) => (
                  <span
                    className={[
                      'rounded-full px-2.5 py-0.5 text-xs font-medium',
                      CALENDAR_EVENT_TONE[r.status] === 'warning'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600',
                    ].join(' ')}
                  >
                    {STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status}
                  </span>
                ),
              },
              {
                key: 'time',
                header: 'Time',
                render: (r) => (
                  <span className="text-slate-500">
                    {new Date(r.scheduledAt).toLocaleString(undefined, { timeZone: 'UTC' })}
                  </span>
                ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
