'use client';

import { useEffect, useState } from 'react';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'content', label: 'Content', icon: '📝' },
  { key: 'media', label: 'Media', icon: '🖼️' },
  { key: 'scheduler', label: 'Scheduler', icon: '📅' },
  { key: 'analytics', label: 'Analytics', icon: '📈' },
  { key: 'workflow', label: 'Workflow', icon: '🔄' },
  { key: 'teams', label: 'Teams', icon: '👥' },
  { key: 'accounts', label: 'Accounts', icon: '🔗' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function Dashboard() {
  const [active, setActive] = useState('dashboard');
  const [health, setHealth] = useState<any>(null);
  const [contents, setContents] = useState({ items: [] as any[], total: 0 });
  const [audit, setAudit] = useState({ items: [] as any[], total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [h, c, a] = await Promise.all([
          fetch('/api/v1/health').then(r => r.json()).catch(() => null),
          fetch('/api/v1/contents?skip=0&take=10').then(r => r.json()).catch(() => ({ items: [], total: 0 })),
          fetch('/api/v1/audit?skip=0&take=10').then(r => r.json()).catch(() => ({ items: [], total: 0 })),
        ]);
        setHealth(h?.data || h || null);
        setContents(c);
        setAudit(a);
      } catch {}
      setLoading(false);
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const apiOk = !!health;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: '#f1f5f9', color: '#1e293b' }}>
      <Sidebar active={active} setActive={setActive} />
      <div style={{ flex: 1, padding: 32, overflow: 'auto' }}>
        <Header active={active} loading={loading} apiOk={apiOk} />
        {active !== 'dashboard' ? (
          <Placeholder active={active} />
        ) : (
          <>
            <Stats apiOk={apiOk} contents={contents} audit={audit} />
            <Activity audit={audit} />
          </>
        )}
      </div>
    </div>
  );
}

function Sidebar({ active, setActive }: { active: string; setActive: (k: string) => void }) {
  return (
    <div style={{ width: 240, background: 'linear-gradient(180deg, #1e1b4b 0%, #312e81 100%)', color: 'white', padding: 0, flexShrink: 0 }}>
      <h1 style={{ fontSize: 20, padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'rgba(255,255,255,0.15)', borderRadius: 8, marginRight: 10, fontSize: 16, verticalAlign: 'middle' }}>C</span>
        ContentHub
      </h1>
      <nav style={{ padding: 12 }}>
        {NAV.map(item => (
          <div key={item.key} onClick={() => setActive(item.key)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, color: active === item.key ? 'white' : '#c7d2fe', background: active === item.key ? 'rgba(99,102,241,0.4)' : 'transparent', cursor: 'pointer', marginBottom: 2, fontSize: 14 }}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </nav>
    </div>
  );
}

function Header({ active, loading, apiOk }: { active: string; loading: boolean; apiOk: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
      <div>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>{NAV.find(n => n.key === active)?.label}</h2>
        <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>{loading ? 'Loading...' : apiOk ? 'All systems operational' : 'Connection issues detected'}</p>
      </div>
      <div style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: apiOk ? '#dcfce7' : '#fee2e2', color: apiOk ? '#166534' : '#991b1b' }}>
        {apiOk ? '● API Connected' : '● API Offline'}
      </div>
    </div>
  );
}

function Placeholder({ active }: { active: string }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, padding: 48, textAlign: 'center', border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{NAV.find(n => n.key === active)?.icon}</div>
      <h3 style={{ fontSize: 18, marginBottom: 8 }}>{NAV.find(n => n.key === active)?.label}</h3>
      <p style={{ color: '#94a3b8', fontSize: 14 }}>This module is under development.</p>
    </div>
  );
}

function Stats({ apiOk, contents, audit }: { apiOk: boolean; contents: any; audit: any }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
      <div style={{ background: 'white', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total Content</div>
        <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{contents.total || 0}</div>
      </div>
      <div style={{ background: 'white', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Recent Activities</div>
        <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{audit.total || 0}</div>
      </div>
      <div style={{ background: 'white', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Platforms</div>
        <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>8</div>
      </div>
      <div style={{ background: 'white', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>API Status</div>
        <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: apiOk ? '#16a34a' : '#dc2626' }}>{apiOk ? 'OK' : 'Down'}</div>
      </div>
    </div>
  );
}

function Activity({ audit }: { audit: any }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, padding: 24, border: '1px solid #e2e8f0' }}>
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>Recent Activity</h3>
      {audit.items && audit.items.length > 0 ? (
        audit.items.map((item: any) => (
          <div key={item.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ width: 32, height: 32, background: '#eef2ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>⚡</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: '#475569' }}>
                <strong>{item.user || item.userName || item.userId}</strong> {String(item.action || '').toLowerCase().replace(/_/g, ' ')} <span style={{ color: '#64748b' }}>{item.entityType}</span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
              </div>
            </div>
          </div>
        ))
      ) : (
        <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>No recent activity</div>
      )}
    </div>
  );
}
