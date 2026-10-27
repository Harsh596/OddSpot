import { useState, useEffect, useRef } from 'react';

const PAGE_TIPS = {
  home: {
    title: 'Home Feed Guide',
    icon: '🏠',
    tips: [
      'Joined Communities: Posts from communities you follow appear here automatically.',
      'Feed Rules: Switch between Default and Custom Filter Rules to customize your discovery stream.',
      'Trending Digest: Highlights oddities that crossed their city threshold into country-wide attention.',
    ],
  },
  explore: {
    title: 'Explore & Radar Guide',
    icon: '🗺️',
    tips: [
      'Radar Sweep: Filter by distance radius (1 km to 25 km) from your live GPS location.',
      'Map Clustering: Nearby pins group together into cluster bubbles. Click or zoom in to expand.',
      'Fuzzed Spots: A 400m dashed ring means the author hid the exact pin. Arrive within 300m to reveal!',
    ],
  },
  random: {
    title: 'Surprise Discovery Guide',
    icon: '🎲',
    tips: [
      'Random Oddity: Roll the dice to teleport to a curiosity anywhere in the world.',
      'Keyboard Shortcut: Press Shift + R anytime on desktop to roll a fresh random spot.',
      'Country Teleport: Filter random picks to specific countries or explore everywhere.',
    ],
  },
  create: {
    title: 'Posting Guide & Spoilers',
    icon: '📝',
    tips: [
      'Markdown & Spoilers: Wrap text in >!spoiler!< to conceal puzzle answers or sensitive clues.',
      'Collapsible Notes: Use :::details Title\\nContent\\n::: for long field guide transcripts.',
      'Location Privacy: Enable "Hide Exact Location" for fragile spots or quiet private neighborhoods.',
    ],
  },
  postDetail: {
    title: 'Oddometer & Verification Guide',
    icon: '⚡',
    tips: [
      'Oddometer: +1 per like, +3 per discussion comment, +4 per verified physical visit.',
      'Reveal on Arrival: If within 300m of a hidden spot, unlock exact coordinates for this session.',
      'Physical Check-In: Walk within 50m to log a verified visit and submit a Then-and-Now comparison photo.',
    ],
  },
  profile: {
    title: 'Scout Dossier Guide',
    icon: '🎖️',
    tips: [
      'Scout Badges: Earn scout (onboarding), first_visit (GPS check-in), and 10_visits badges.',
      'Visit Map: All your verified field visits are pinned on your personal interactive exploration map.',
      'Finds & Communities: Review spots you have introduced and view your community roles.',
    ],
  },
  guide: {
    title: 'Field Manual',
    icon: '📖',
    tips: [
      'Master Briefing: Complete documentation for algorithms, verification, and privacy mechanics.',
      'Scout Tour: Retake the 5-step interactive onboarding briefing anytime.',
      'First Mission: Track your active 1 km reconnaissance sweep objective.',
    ],
  },
  default: {
    title: 'Oddspot Scout Guide',
    icon: '💡',
    tips: [
      'Real-World Oddities: Discover unusual public art, strange architecture, and bizarre local lore.',
      'Oddometer Scoring: Upvote and discuss spots to elevate them from city to country-wide fame.',
      'Field Verification: Visit spots in person to log condition reports and earn scout badges.',
    ],
  },
};

export default function HelpPopover({ pageKey = 'default', onOpenTour }) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);
  const buttonRef = useRef(null);

  const config = PAGE_TIPS[pageKey] || PAGE_TIPS.default;

  // Click outside and keyboard focus trap
  useEffect(() => {
    if (!isOpen) return;

    // Focus the first interactive element inside the popover on open
    const focusable = popoverRef.current?.querySelectorAll('button:not([disabled]), [tabindex="0"], a[href]');
    if (focusable && focusable.length > 0) {
      focusable[0].focus();
    }

    const handleClickOutside = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      } else if (e.key === 'Tab' && popoverRef.current) {
        const items = Array.from(popoverRef.current.querySelectorAll('button:not([disabled]), [tabindex="0"], a[href]'));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !popoverRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !popoverRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleOpenManual = () => {
    setIsOpen(false);
    window.location.hash = '#/guide';
  };

  const handleRetakeTour = () => {
    setIsOpen(false);
    if (onOpenTour) {
      onOpenTour();
    }
  };

  return (
    <div className="help-popover-wrapper">
      <button
        ref={buttonRef}
        type="button"
        className={`help-trigger-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Toggle Scout Field Guide and Contextual Help"
        title="Field Guide & Tips"
      >
        <span className="help-icon" aria-hidden="true" style={{ color: 'var(--accent-primary, #FF6F00)', fontWeight: 800 }}>?</span>
        <span className="help-label">Field Guide</span>
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="help-popover-card"
          role="dialog"
          aria-label={config.title}
        >
          <div className="help-popover-header">
            <span className="help-header-icon" aria-hidden="true">{config.icon}</span>
            <h4 className="help-header-title">{config.title}</h4>
            <button
              type="button"
              className="help-popover-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close help popover"
            >
              ✕
            </button>
          </div>

          <div className="help-popover-body">
            <ul className="help-tips-list">
              {config.tips.map((tip, idx) => (
                <li key={idx} className="help-tip-item">
                  <span className="help-bullet">▪</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="help-popover-footer">
            <button
              type="button"
              className="help-action-btn primary"
              onClick={handleOpenManual}
            >
              📖 Field Manual
            </button>
            <button
              type="button"
              className="help-action-btn secondary"
              onClick={handleRetakeTour}
            >
              🧭 Briefing Tour
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
