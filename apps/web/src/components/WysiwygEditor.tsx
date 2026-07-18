'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { useEffect, useCallback, useState, useRef } from 'react';
import { api } from '@/lib/api';
import { MediaAsset } from '@/lib/types';
import TurndownService from 'turndown';

interface WysiwygEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  contentId?: string;
  onInsertMedia?: () => void;
}

const turndown = new TurndownService({ headingStyle: 'atx' });
turndown.addRule('strikethrough', {
  filter: ['del', 's'],
  replacement: (content: string) => `~~${content}~~`,
});

function markdownToHtml(md: string): string {
  // Simple markdown to HTML conversion for TipTap
  // We leverage the existing markdown-it renderer from MarkdownEditor
  const raw = md || '';
  // For now, return raw text wrapped in paragraphs for TipTip editing
  // TipTap will handle rich text editing
  if (!raw.trim()) return '<p></p>';
  
  // Convert basic markdown to HTML for TipTap to edit
  return raw
    .split('\n\n')
    .map(p => {
      if (p.startsWith('### ')) return `<h3>${p.slice(4)}</h3>`;
      if (p.startsWith('## ')) return `<h2>${p.slice(3)}</h2>`;
      if (p.startsWith('# ')) return `<h1>${p.slice(2)}</h1>`;
      if (p.startsWith('- ')) return `<ul><li>${p.slice(2)}</li></ul>`;
      if (p.startsWith('> ')) return `<blockquote><p>${p.slice(2)}</p></blockquote>`;
      if (p.startsWith('```')) return `<pre><code>${p.replace(/```/g, '')}</code></pre>`;
      if (p.match(/^\d+\./)) return `<ol><li>${p.replace(/^\d+\.\s*/, '')}</li></ol>`;
      if (p.startsWith('![')) return p; // keep markdown images as-is
      return `<p>${p}</p>`;
    })
    .join('\n');
}

export default function WysiwygEditor({
  value,
  onChange,
  placeholder,
  contentId,
  onInsertMedia,
}: WysiwygEditorProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const lastMarkdown = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Image.configure({ allowBase64: true }),
      Link.configure({ openOnClick: false }),
    ],
    content: markdownToHtml(value),
    editorProps: {
      attributes: {
        class: 'prose max-w-none px-3 py-2 min-h-[300px] outline-none text-sm text-slate-700',
        placeholder: placeholder || 'Write content...',
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      // Convert HTML back to markdown
      let md = turndown.turndown(html);
      // Clean up
      md = md.replace(/\n{3,}/g, '\n\n').trim();
      if (md !== lastMarkdown.current) {
        lastMarkdown.current = md;
        onChange(md);
      }
    },
  });

  // Sync external value changes to editor
  useEffect(() => {
    if (!editor) return;
    if (value !== lastMarkdown.current) {
      lastMarkdown.current = value;
      editor.commands.setContent(markdownToHtml(value));
    }
  }, [value, editor]);

  const uploadImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('Only image files can be dropped.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const asset = await api.upload<MediaAsset>('/media/upload', file, {
        ...(contentId ? { contentId } : {}),
      });
      const img = `![${file.name}](${asset.url})`;
      const next = value ? `${value}\n\n${img}\n` : `${img}\n`;
      onChange(next);
    } catch (err: any) {
      setUploadError(err?.message ?? 'Image upload failed.');
    } finally {
      setUploading(false);
    }
  }, [value, onChange, contentId]);

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 rounded-t-lg border border-b-0 border-slate-200 bg-slate-50 px-2 py-1.5">
        <div className="flex flex-wrap gap-0.5">
          <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()}
            className={`rounded px-2 py-1 text-sm font-bold text-slate-600 hover:bg-slate-200 min-h-[44px] min-w-[44px] ${editor?.isActive('bold') ? 'bg-indigo-100 text-indigo-700' : ''}`}>
            B
          </button>
          <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={`rounded px-2 py-1 text-sm italic text-slate-600 hover:bg-slate-200 min-h-[44px] min-w-[44px] ${editor?.isActive('italic') ? 'bg-indigo-100 text-indigo-700' : ''}`}>
            I
          </button>
          <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`rounded px-2 py-1 text-sm font-bold text-slate-600 hover:bg-slate-200 min-h-[44px] min-w-[44px] ${editor?.isActive('heading', { level: 1 }) ? 'bg-indigo-100 text-indigo-700' : ''}`}>
            H1
          </button>
          <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`rounded px-2 py-1 text-sm font-bold text-slate-600 hover:bg-slate-200 min-h-[44px] min-w-[44px] ${editor?.isActive('heading', { level: 2 }) ? 'bg-indigo-100 text-indigo-700' : ''}`}>
            H2
          </button>
          <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`rounded px-2 py-1 text-sm font-bold text-slate-600 hover:bg-slate-200 min-h-[44px] min-w-[44px] ${editor?.isActive('heading', { level: 3 }) ? 'bg-indigo-100 text-indigo-700' : ''}`}>
            H3
          </button>
          <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()}
            className={`rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-200 min-h-[44px] min-w-[44px] ${editor?.isActive('bulletList') ? 'bg-indigo-100 text-indigo-700' : ''}`}>
            •
          </button>
          <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            className={`rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-200 min-h-[44px] min-w-[44px] ${editor?.isActive('orderedList') ? 'bg-indigo-100 text-indigo-700' : ''}`}>
            1.
          </button>
          <button type="button" onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            className={`rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-200 min-h-[44px] min-w-[44px] ${editor?.isActive('blockquote') ? 'bg-indigo-100 text-indigo-700' : ''}`}>
            &ldquo;
          </button>
          <button type="button" onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
            className={`rounded px-2 py-1 text-sm font-mono text-slate-600 hover:bg-slate-200 min-h-[44px] min-w-[44px] ${editor?.isActive('codeBlock') ? 'bg-indigo-100 text-indigo-700' : ''}`}>
            {'</>'}
          </button>
          <button type="button" onClick={() => {
            const url = prompt('Enter link URL:');
            if (url) editor?.chain().focus().setLink({ href: url }).run();
          }}
            className={`rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-200 min-h-[44px] min-w-[44px] ${editor?.isActive('link') ? 'bg-indigo-100 text-indigo-700' : ''}`}>
            🔗
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {onInsertMedia && (
            <button type="button" onClick={onInsertMedia}
              className="rounded px-2 text-xs font-medium text-slate-600 hover:bg-slate-200 min-h-[44px]">
              Media
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div
        className={`relative min-h-[300px] rounded-b-lg border ${dragging ? 'border-primary ring-2 ring-indigo-100' : 'border-slate-200'} overflow-hidden`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void uploadImage(file);
        }}
      >
        <EditorContent editor={editor} />
        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-b-lg bg-indigo-50/80">
            <span className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-primary shadow-sm">
              Drop image to upload
            </span>
          </div>
        )}
        {uploading && (
          <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-slate-700 px-2 py-1 text-xs text-white">
            Uploading…
          </div>
        )}
      </div>
      {uploadError && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{uploadError}</div>
      )}
    </div>
  );
}
