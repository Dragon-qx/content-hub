'use client';

import { useState } from 'react';
import { Button, Card, Input, Select } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import MarkdownEditor from '@/components/MarkdownEditor';
import ContentAssistant from '@/components/ContentAssistant';
import { CONTENT_TYPES } from '@/lib/types';

/**
 * Standalone AI Content Assistant workspace (PRD §3.3 V1.1 AI 辅助写作).
 * Draft freely — the four assistant helpers (titles / tags / audit / variants)
 * project over the draft without persisting anything. Use this to iterate on
 * copy before creating a formal content item.
 */
export default function AssistantPage() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [contentType, setContentType] = useState('TEXT');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI assistant"
        subtitle="Optimize titles, extract tags, audit quality, and generate copy variants over a draft."
      />

      <Card>
        <div className="flex flex-col gap-3">
          <Input
            placeholder="Draft title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <MarkdownEditor
            value={body}
            onChange={setBody}
            placeholder="Write or paste a draft to get AI suggestions…"
          />
          <div className="flex justify-end">
            <Select value={contentType} onChange={(e) => setContentType(e.target.value)} className="max-w-xs">
              {CONTENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <ContentAssistant
        body={body ? `${title}\n\n${body}` : title}
        contentType={contentType}
        onApplyTitle={setTitle}
        onApplyBody={setBody}
      />

      <div className="text-center text-xs text-slate-400">
        All suggestions are generated locally over your draft and never persisted automatically.
      </div>
    </div>
  );
}
