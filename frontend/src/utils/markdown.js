// frontend/src/utils/markdown.js
// Markdown parsing with custom spoiler grammar, collapsible details, and strict DOMPurify sanitization.

import { marked } from 'marked';
import DOMPurifyModule from 'dompurify';

// Resolve DOMPurify instance in both browser and headless/test environments
function getPurifier() {
  if (typeof window !== 'undefined') {
    if (typeof DOMPurifyModule.sanitize === 'function') {
      return DOMPurifyModule;
    }
    if (typeof DOMPurifyModule === 'function') {
      return DOMPurifyModule(window);
    }
    if (DOMPurifyModule.default) {
      if (typeof DOMPurifyModule.default.sanitize === 'function') {
        return DOMPurifyModule.default;
      }
      if (typeof DOMPurifyModule.default === 'function') {
        return DOMPurifyModule.default(window);
      }
    }
  } else if (typeof globalThis !== 'undefined' && globalThis.window) {
    if (typeof DOMPurifyModule === 'function') {
      return DOMPurifyModule(globalThis.window);
    }
    if (DOMPurifyModule.default && typeof DOMPurifyModule.default === 'function') {
      return DOMPurifyModule.default(globalThis.window);
    }
  }
  return DOMPurifyModule;
}

const DOMPurify = getPurifier();

// Register link security and sanitizer hook
if (DOMPurify && typeof DOMPurify.addHook === 'function') {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href');
      if (href) {
        const trimmed = href.trim().toLowerCase();
        if (
          !trimmed.startsWith('https://') &&
          !trimmed.startsWith('http://') &&
          !trimmed.startsWith('#')
        ) {
          node.removeAttribute('href');
        } else {
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer nofollow');
        }
      }
    }
  });
}

export const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'em',
    'del',
    'code',
    'pre',
    'blockquote',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'a',
    'span',
    'details',
    'summary',
    'div',
    'hr',
  ],
  ALLOWED_ATTR: [
    'href',
    'title',
    'target',
    'rel',
    'class',
    'role',
    'tabindex',
    'aria-expanded',
    'data-spoiler',
  ],
  FORBID_TAGS: [
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'form',
    'input',
    'svg',
    'math',
    'img',
  ],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'style'],
};

/**
 * Preprocesses markdown text replacing custom spoiler and collapsible grammars:
 * - Collapsible details: :::details Summary text\nContent\n:::
 * - Spoiler text: >!spoiler text!<
 */
export function preprocessCustomGrammar(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';

  // 1. Collapsible sections: :::details Summary\nContent\n:::
  let processed = rawText.replace(
    /:::details[ \t]*([^\r\n]+)[\r\n]+([\s\S]*?)[\r\n]+:::/g,
    (match, summary, content) => {
      return `<details class="odd-collapsible"><summary>${summary.trim()}</summary><div class="odd-collapsible-body">\n\n${content}\n\n</div></details>`;
    }
  );

  // 2. Spoiler grammar: >!hidden text!<
  processed = processed.replace(
    />!([^\r\n]+?)!</g,
    (match, hidden) => {
      return `<span class="odd-spoiler" role="button" tabindex="0" aria-expanded="false" data-spoiler="true">${hidden}</span>`;
    }
  );

  return processed;
}

/**
 * Renders raw markdown into strict safe HTML.
 * @param {string} rawText - Unsanitized user markdown
 * @returns {string} Safe HTML string
 */
export function renderSafeMarkdown(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';

  const preprocessed = preprocessCustomGrammar(rawText);
  const parsedHtml = marked.parse(preprocessed, {
    breaks: true,
    gfm: true,
  });

  const purifier = getPurifier();
  if (purifier && typeof purifier.sanitize === 'function') {
    return purifier.sanitize(parsedHtml, PURIFY_CONFIG);
  }

  return parsedHtml;
}
