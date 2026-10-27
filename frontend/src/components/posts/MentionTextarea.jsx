import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * MentionTextarea - Textarea with autocomplete popover for @username mentions
 * Suggests matching usernames from post author and existing commenters.
 * Supports ArrowUp, ArrowDown, Tab, and Enter navigation.
 */
export function MentionTextarea({
  value = '',
  onChange = () => {},
  usernames = [],
  placeholder = '',
  rows = 3,
  maxLength = 5000,
  required = false,
  className = '',
  id,
  style = {},
  disabled = false,
}) {
  const textareaRef = useRef(null);
  const containerRef = useRef(null);

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [atIndex, setAtIndex] = useState(-1);

  // Filter distinct, valid usernames
  const candidateUsernames = Array.from(
    new Set(
      usernames
        .filter((u) => typeof u === 'string' && u.trim().length > 0)
        .map((u) => u.trim())
    )
  );

  const checkForMention = useCallback(
    (text, cursorPosition) => {
      if (cursorPosition === undefined || cursorPosition === null) return;
      const textBeforeCursor = text.slice(0, cursorPosition);
      // Match @ followed by letters/numbers/underscores right before the cursor
      const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/);

      if (match) {
        const query = match[1] || '';
        const symbolIdx = textBeforeCursor.lastIndexOf('@');
        setAtIndex(symbolIdx);

        // Filter usernames matching query
        const filtered = candidateUsernames.filter((name) =>
          name.toLowerCase().startsWith(query.toLowerCase())
        );

        if (filtered.length > 0) {
          setSuggestions(filtered.slice(0, 5));
          setSelectedIndex(0);
          setShowSuggestions(true);
          return;
        }
      }

      setShowSuggestions(false);
      setSuggestions([]);
    },
    [candidateUsernames]
  );

  const handleSelectMention = (username) => {
    if (!textareaRef.current || atIndex === -1) return;

    const cursor = textareaRef.current.selectionStart;
    const textBeforeAt = value.slice(0, atIndex);
    const textAfterCursor = value.slice(cursor);

    const insertion = `@${username} `;
    const updatedValue = `${textBeforeAt}${insertion}${textAfterCursor}`;

    onChange(updatedValue);
    setShowSuggestions(false);

    // Put cursor right after the inserted mention and space
    const newCursor = textBeforeAt.length + insertion.length;
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursor, newCursor);
      }
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      handleSelectMention(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowSuggestions(false);
    }
  };

  const handleTextChange = (e) => {
    const val = e.target.value;
    onChange(val);
    checkForMention(val, e.target.selectionStart);
  };

  const handleClickOrKeyUp = () => {
    if (textareaRef.current) {
      checkForMention(textareaRef.current.value, textareaRef.current.selectionStart);
    }
  };

  // Close suggestions if user clicks outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      ref={containerRef}
      className="mention-textarea-container"
      style={{ position: 'relative', width: '100%' }}
    >
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        onClick={handleClickOrKeyUp}
        onKeyUp={handleClickOrKeyUp}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={className}
        style={style}
      />

      {showSuggestions && suggestions.length > 0 && (
        <div
          className="mention-suggestions-popover"
          role="listbox"
          aria-label="User mention suggestions"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '6px',
            background: 'var(--bg-surface, #FFFFFF)',
            border: '1px solid var(--border-subtle, #E4E4E7)',
            borderRadius: 'var(--radius-md, 8px)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
            zIndex: 100,
            minWidth: '220px',
            maxWidth: '320px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-muted)',
              background: 'var(--bg-card-inner)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>Mention Scout</span>
            <span style={{ fontSize: '10px', textTransform: 'none', color: 'var(--badge-gold-text)' }}>
              Tab / Enter ↵
            </span>
          </div>

          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {suggestions.map((name, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={name}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelectMention(name)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    background: isSelected ? 'var(--badge-gold-bg)' : 'transparent',
                    color: isSelected ? 'var(--badge-gold-text)' : 'var(--text-primary)',
                    transition: 'background 0.1s ease',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: isSelected ? 'var(--accent)' : 'var(--border-subtle)',
                      color: isSelected ? 'var(--text-on-accent, #FFFFFF)' : 'var(--text-secondary)',
                      fontSize: '11px',
                      fontWeight: 800,
                    }}
                  >
                    @
                  </span>
                  <span>{name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default MentionTextarea;
