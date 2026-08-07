'use client';

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  DragEvent,
} from 'react';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import { api } from '@/lib/api';
import { MediaAsset } from '@/lib/types';
import { useT } from '@/lib/i18n';

/**
 * Lightweight, dependency-light Markdown editor.
 *
 * Features:
 *  - Write / Preview tabs
 *  - Formatting toolbar that wraps the textarea selection in markdown syntax
 *  - Live, XSS-sanitized preview (markdown-it → DOMPurify)
 *  - Drag-and-drop image upload that inserts an inline `![alt](url)` reference
 *  - Optional media-library seam: pass `onInsertMedia` to wire a picker
 *
 * The component is fully controlled via `value` / `onChange`, so it drops into
 * any form exactly like a plain `<textarea>`.
 */

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

/** Render markdown to sanitized HTML suitable for `dangerouslySetInnerHTML`. */
export function renderMarkdown(src: string): string {
  const raw = md.render(src ?? '');
  // Sanitize on the client: strip script/style/any vector we did not author.
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}

interface MarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Optional content id so uploaded images are bound to the right content. */
  contentId?: string;
  /** When provided, an "Insert media" affordance is shown. */
  onInsertMedia?: () => void;
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder,
  contentId,
  onInsertMedia,
}: MarkdownEditorProps) {
  const { t } = useT();
  const [preview, setPreview] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const html = useMemo(() => renderMarkdown(value), [value]);

  // ===== Toolbar: wrap the current textarea selection in markdown syntax =====

  /** Apply an edit to the textarea text around the current selection. */
  const applyEdit = useCallback(
    (wrapStart: string, wrapEnd = '') => {
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      const selected = value.slice(start, end);
      const insert = `${wrapStart}${selected || 'text'}${wrapEnd}`;
      const next = value.slice(0, start) + insert + value.slice(end);
      onChange(next);
      // Restore focus and re-place the caret after the inserted text.
      requestAnimationFrame(() => {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + insert.length;
      });
    },
    [value, onChange],
  );

  const toolbar: { label: string; title: string; run: () => void }[] = [
    { label: 'B', title: 'Bold', run: () => applyEdit('**', '**') },
    { label: 'I', title: 'Italic', run: () => applyEdit('*', '*') },
    { label: 'H', title: 'Heading', run: () => applyEdit('## ') },
    { label: '~', title: 'Strikethrough', run: () => applyEdit('~~', '~~') },
    { label: '“', title: 'Quote', run: () => applyEdit('> ') },
    { label: '</>', title: 'Code', run: () => applyEdit('`', '`') },
    { label: '•', title: 'Bulleted list', run: () => applyEdit('- ') },
    { label: '1.', title: 'Numbered list', run: () => applyEdit('1. ') },
    { label: '🔗', title: 'Link', run: () => applyEdit('[', '](https://)') },
    { label: '🖼', title: 'Image', run: () => applyEdit('![', '](https://)') },
  ];

  // ===== Drag-and-drop image upload =====

  const uploadImage = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setUploadError('Only image files can be dropped here.');
        return;
      }
      setUploading(true);
      setUploadError(null);
      try {
        const asset = await api.upload<MediaAsset>('/media/upload', file, {
          ...(contentId ? { contentId } : {}),
        });
        // Insert a markdown image reference at the caret (or end).
        const ta = taRef.current;
        const at = ta ? ta.selectionStart : value.length;
        const ref = `![${file.name}](${asset.url})`;
        const next = value.slice(0, at) + ref + value.slice(at);
        onChange(next);
      } catch (err: any) {
        setUploadError(err?.message ?? 'Image upload failed.');
      } finally {
        setUploading(false);
      }
    },
    [value, onChange, contentId],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void uploadImage(file);
    },
    [uploadImage],
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 rounded-t-lg border border-b-0 border-slate-200 bg-slate-50 px-2 py-1.5">
        <div className="flex flex-wrap gap-1">
          {toolbar.map((t) => (
            <button
              key={t.title}
              type="button"
              title={t.title}
              onClick={t.run}
              className="rounded text-sm font-medium text-slate-600 hover:bg-slate-200 min-h-[44px] min-w-[44px]"
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {onInsertMedia && (
            <button
              type="button"
              onClick={onInsertMedia}
              className="rounded px-2 text-xs font-medium text-slate-600 hover:bg-slate-200 min-h-[44px]"
            >
              {t('media.title')}
            </button>
          )}
          {/* Write / Preview tabs */}
          <div className="flex overflow-hidden rounded border border-slate-200">
            <button
              type="button"
              onClick={() => setPreview(false)}
              className={`min-h-[44px] px-2.5 text-xs font-medium ${!preview ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              {t('common.edit')}
            </button>
            <button
              type="button"
              onClick={() => setPreview(true)}
              className={`min-h-[44px] px-2.5 text-xs font-medium ${preview ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              {t('reports.preview')}
            </button>
          </div>
        </div>
      </div>

      {/* Editor / Preview pane */}
      <div
        className={`relative min-h-[300px] rounded-b-lg border ${dragging ? 'border-primary ring-2 ring-indigo-100' : 'border-slate-200'}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
      >
        {preview ? (
          <div
            className="prose max-h-[600px] max-w-none overflow-auto px-3 py-2 text-sm text-slate-700"
            // Rendered from sanitized markdown — see renderMarkdown().
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <textarea
            ref={taRef}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onDrop={onDrop}
            className="block h-full min-h-[300px] w-full resize-y rounded-b-lg bg-white px-3 py-2 font-mono text-sm text-slate-700 outline-none"
          />
        )}

        {/* Drag overlay hint */}
        {dragging && !preview && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-b-lg bg-indigo-50/80">
            <span className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-primary shadow-sm">
              {t('media.upload')}
            </span>
          </div>
        )}

        {uploading && (
          <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-slate-700 px-2 py-1 text-xs text-white">
            {t('common.uploading')}
          </div>
        )}
      </div>

      {uploadError && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{uploadError}</div>
      )}
      {!preview && (
        <p className="text-xs text-slate-400">
          Tip: drag an image onto the editor to upload and insert it as a markdown image.
        </p>
      )}
    </div>
  );
}
