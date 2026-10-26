// frontend/src/components/markdown/RichText.jsx
// Renders sanitized markdown HTML with interactive spoiler reveals and collapsible blocks.

import React, { useMemo, useCallback } from 'react';
import { renderSafeMarkdown } from '../../utils/markdown';

export function RichText({ content = '', className = '' }) {
  const safeHtml = useMemo(() => {
    return renderSafeMarkdown(content);
  }, [content]);

  const toggleSpoiler = useCallback((target) => {
    const spoiler = target?.closest('[data-spoiler="true"]');
    if (!spoiler) return;

    const isRevealed = spoiler.classList.contains('is-revealed');
    if (isRevealed) {
      spoiler.classList.remove('is-revealed');
      spoiler.setAttribute('aria-expanded', 'false');
    } else {
      spoiler.classList.add('is-revealed');
      spoiler.setAttribute('aria-expanded', 'true');
    }
  }, []);

  const handleClick = useCallback(
    (e) => {
      toggleSpoiler(e.target);
    },
    [toggleSpoiler]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const spoiler = e.target?.closest('[data-spoiler="true"]');
        if (spoiler) {
          e.preventDefault();
          toggleSpoiler(spoiler);
        }
      }
    },
    [toggleSpoiler]
  );

  if (!content) return null;

  return (
    <div
      className={`odd-rich-text ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    />
  );
}
