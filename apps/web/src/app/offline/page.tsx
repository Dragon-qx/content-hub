'use client';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">📡</div>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">No connection</h1>
        <p className="text-sm text-slate-500 mb-6">
          You&apos;re currently offline. Some features may be unavailable.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-primary min-h-[44px] px-6 py-2.5"
        >
          Try again
        </button>
        <p className="text-xs text-slate-400 mt-4">
          We&apos;ll automatically reconnect when your network returns.
        </p>
      </div>
    </div>
  );
}
