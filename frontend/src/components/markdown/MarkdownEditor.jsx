// frontend/src/components/markdown/MarkdownEditor.jsx
// Tabbed markdown editor with formatting toolbar, spoiler shortcuts, and live preview.

import { useState, useRef } from 'react';
import { RichText } from './RichText';

export const FIELD_GUIDE_TEMPLATE = `### What is it?
Brief description of the unusual spot, object, or mystery.

### Where to look
Specific visual cues, landmarks, or architectural details to identify it.

### Best way to reach
Access notes, walking path, transit tips, or safety precautions.`;

export function MarkdownEditor({
  value = '',
  onChange,
  placeholder = 'Write in Markdown... use >!spoiler!< for hidden text or :::details Title for collapsible sections.',
  rows = 8,
  maxLength = 10000,
  label = '',
  error = '',
  showTemplateButton = false,
  id = 'markdown-editor',
}) {
  const [activeTab, setActiveTab] = useState('write'); // 'write' | 'preview'
  const textareaRef = useRef(null);

  const insertFormatting = (prefix, suffix = '', defaultText = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end) || defaultText;
    const replacement = `${prefix}${selectedText}${suffix}`;

    const newValue =
      value.substring(0, start) + replacement + value.substring(end);
    onChange(newValue);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selectedText.length
      );
    }, 0);
  };

  const handleInsertTemplate = () => {
    if (value.trim()) {
      if (!window.confirm('Replace current text with Field Guide template?')) {
        return;
      }
    }
    onChange(FIELD_GUIDE_TEMPLATE);
  };

  return (
    <div className="odd-markdown-editor">
      {label && <label htmlFor={id} className="editor-label">{label}</label>}

      <div className="editor-header">
        <div className="editor-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'write'}
            className={`tab-btn ${activeTab === 'write' ? 'active' : ''}`}
            onClick={() => setActiveTab('write')}
          >
            Write
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'preview'}
            className={`tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            Preview
          </button>
        </div>

        {activeTab === 'write' && (
          <div className="editor-toolbar">
            <button
              type="button"
              className="toolbar-btn"
              title="Bold (**text**)"
              onClick={() => insertFormatting('**', '**', 'bold text')}
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              className="toolbar-btn"
              title="Italic (*text*)"
              onClick={() => insertFormatting('*', '*', 'italic text')}
            >
              <em>I</em>
            </button>
            <button
              type="button"
              className="toolbar-btn"
              title="Heading (### Heading)"
              onClick={() => insertFormatting('### ', '\n', 'Heading')}
            >
              H3
            </button>
            <button
              type="button"
              className="toolbar-btn"
              title="Spoiler (>!hidden text!<)"
              onClick={() => insertFormatting('>!', '!<', 'hidden secret')}
            >
              Spoiler
            </button>
            <button
              type="button"
              className="toolbar-btn"
              title="Collapsible Details (:::details Title\nContent\n:::)"
              onClick={() =>
                insertFormatting(
                  ':::details Summary Title\n',
                  '\n:::\n',
                  'Collapsible details content here'
                )
              }
            >
              Details
            </button>
            {showTemplateButton && (
              <button
                type="button"
                className="toolbar-btn template-btn"
                title="Insert standard field guide structure"
                onClick={handleInsertTemplate}
              >
                + Field Guide Template
              </button>
            )}
          </div>
        )}
      </div>

      <div className="editor-body">
        {activeTab === 'write' ? (
          <textarea
            id={id}
            ref={textareaRef}
            className="editor-textarea"
            rows={rows}
            maxLength={maxLength}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <div className="editor-preview-container">
            {value.trim() ? (
              <RichText content={value} className="editor-preview" />
            ) : (
              <p className="editor-preview-empty">
                <em>Nothing to preview. Switch to Write tab to compose content.</em>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="editor-footer">
        {error && <span className="editor-error">{error}</span>}
        <span className="char-count">
          {value.length} / {maxLength}
        </span>
      </div>
    </div>
  );
}
