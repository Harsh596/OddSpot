import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';

export const SCOUT_TOUR_STEPS = [
  {
    step: 1,
    title: 'Welcome, Field Scout!',
    content:
      'Oddspot is a living map of real-world weirdness — strange statues, accidental art, bizarre signs, and local mysteries you can actually walk up to and visit.',
    icon: '🧭',
    badge: 'Briefing 1/5',
    tip: 'Look for the unusual in everyday corners.',
  },
  {
    step: 2,
    title: 'How the Oddometer Works',
    content:
      "Every find starts in its own city. When locals upvote, discuss, or physically visit a spot, its Oddometer rises. Cross your city's threshold and your find goes Country-Wide!",
    icon: '⚡',
    badge: 'Briefing 2/5',
    tip: 'Upvotes (+1), Comments (+3), Visits (+4).',
  },
  {
    step: 3,
    title: 'Verify Spots in the Wild',
    content:
      "Walk within 50 meters of any find and tap 'I Visited This' to log a verified check-in (+4 Oddometer points!), share a Then-and-Now photo, and report whether it's still there.",
    icon: '📍',
    badge: 'Briefing 3/5',
    tip: 'GPS locks within 50m unlock verified status.',
  },
  {
    step: 4,
    title: 'Protect Sensitive Places',
    content:
      "Posting near a quiet courtyard or fragile spot? Enable 'Hide Exact Location'. We fuzz the pin by 150–400m using cryptographic HMAC and only reveal the exact point to scouts who arrive within 300m.",
    icon: '🛡️',
    badge: 'Briefing 4/5',
    tip: 'Cryptographic obfuscation prevents trilateration.',
  },
  {
    step: 5,
    title: 'Mission #1: The 1 km Sweep',
    content:
      'Complete this briefing to claim your Scout Badge, then head to Explore or post one weird thing within 1 km of where you stand right now!',
    icon: '🎯',
    badge: 'Briefing 5/5',
    tip: 'Ready to claim your official Scout Badge?',
  },
];

export default function ScoutTourModal({ isOpen, onClose, onComplete }) {
  const { user, updateUser } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [error, setError] = useState(null);
  const modalRef = useRef(null);
  const firstFocusableRef = useRef(null);

  // Reset step when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setIsCompleted(false);
      setError(null);
    }
  }, [isOpen]);

  // Keyboard navigation & focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowRight' && !isCompleted) {
        e.preventDefault();
        if (currentStep < SCOUT_TOUR_STEPS.length - 1) {
          setCurrentStep((prev) => prev + 1);
        }
        return;
      }
      if (e.key === 'ArrowLeft' && !isCompleted) {
        e.preventDefault();
        if (currentStep > 0) {
          setCurrentStep((prev) => prev - 1);
        }
        return;
      }

      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Initial focus
    const timer = setTimeout(() => {
      if (firstFocusableRef.current) {
        firstFocusableRef.current.focus();
      }
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, currentStep, isCompleted, onClose]);

  if (!isOpen) return null;

  const step = SCOUT_TOUR_STEPS[currentStep];
  const isLastStep = currentStep === SCOUT_TOUR_STEPS.length - 1;

  const handleNext = () => {
    if (currentStep < SCOUT_TOUR_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleClaimBadgeAndFinish = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      if (user) {
        const res = await api.completeOnboarding();
        if (res && res.onboardingDone) {
          updateUser({
            onboardingDone: true,
            badges: res.badges || [...(user.badges || []), 'scout'],
          });
        }
      }
      setIsCompleted(true);
      if (onComplete) onComplete();
    } catch (err) {
      setError(err.message || 'Failed to complete onboarding. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartExplore = () => {
    onClose();
    window.location.hash = '#/explore';
  };

  const handleStartCreate = () => {
    onClose();
    window.location.hash = '#/create';
  };

  return (
    <div
      className="tour-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="tour-modal-container"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scout-tour-title"
        aria-describedby="scout-tour-desc"
      >
        {/* Header bar */}
        <div className="tour-modal-header">
          <div className="tour-header-meta">
            <span className="tour-badge-pill">{step.badge}</span>
            <span className="tour-badge-hint">{step.tip}</span>
          </div>
          <button
            ref={firstFocusableRef}
            type="button"
            className="tour-close-btn"
            onClick={onClose}
            aria-label="Close scout tour (Escape)"
          >
            ✕
          </button>
        </div>

        {/* Step Content */}
        {!isCompleted ? (
          <div className="tour-modal-body">
            <div className="tour-icon-halo">
              <span className="tour-step-icon" role="img" aria-hidden="true">
                {step.icon}
              </span>
            </div>

            <h2 id="scout-tour-title" className="tour-step-title">
              {step.title}
            </h2>

            <p id="scout-tour-desc" className="tour-step-content">
              {step.content}
            </p>

            {error && (
              <div className="tour-error-alert" role="alert">
                ⚠️ {error}
              </div>
            )}

            {/* Step navigation dots */}
            <div className="tour-dots-row" role="tablist" aria-label="Tour steps">
              {SCOUT_TOUR_STEPS.map((s, idx) => (
                <button
                  key={s.step}
                  type="button"
                  role="tab"
                  aria-selected={idx === currentStep}
                  aria-label={`Step ${s.step}: ${s.title}`}
                  className={`tour-dot ${idx === currentStep ? 'active' : ''} ${
                    idx < currentStep ? 'completed' : ''
                  }`}
                  onClick={() => setCurrentStep(idx)}
                />
              ))}
            </div>

            {/* Footer actions */}
            <div className="tour-modal-footer">
              <button
                type="button"
                className="btn-tour-secondary"
                onClick={handlePrev}
                disabled={currentStep === 0}
              >
                ← Back
              </button>

              <div className="tour-footer-right">
                <button
                  type="button"
                  className="btn-tour-skip"
                  onClick={onClose}
                >
                  Skip Tour
                </button>

                {isLastStep ? (
                  <button
                    type="button"
                    className="btn-tour-primary btn-claim-badge"
                    onClick={handleClaimBadgeAndFinish}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Claiming Badge...' : '🎖️ Claim Scout Badge & Start'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-tour-primary"
                    onClick={handleNext}
                  >
                    Next Step →
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Completion Mission Card */
          <div className="tour-modal-body tour-completion-body">
            <div className="tour-celebration-halo">
              <span className="tour-celebration-badge" role="img" aria-label="Celebration">
                🎖️
              </span>
            </div>

            <h2 id="scout-tour-title" className="tour-completion-title">
              Briefing Complete, Field Scout!
            </h2>

            <p className="tour-completion-subtitle">
              Your official <strong>Scout Badge</strong> has been awarded to your profile.
            </p>

            {/* First Mission Tracker Card */}
            <div className="first-mission-card">
              <div className="first-mission-badge-strip">
                <span className="first-mission-tag">ACTIVE OBJECTIVE</span>
                <span className="first-mission-target">Radius: ≤ 1.0 km</span>
              </div>
              <h3 className="first-mission-name">Mission #1: The 1 km Sweep</h3>
              <p className="first-mission-desc">
                Spot something weird within 1 km of where you stand right now — a peculiar sticker, an
                unusual door, a secret sculpture, or strange architecture. Post it to start its Oddometer,
                or discover an oddity nearby!
              </p>
              <div className="first-mission-stats">
                <div className="mission-stat-pill">
                  <span className="stat-label">Scout Rank</span>
                  <span className="stat-val">Novice Scout</span>
                </div>
                <div className="mission-stat-pill">
                  <span className="stat-label">Award</span>
                  <span className="stat-val">🎖️ 'scout' Badge</span>
                </div>
                <div className="mission-stat-pill">
                  <span className="stat-label">Next Reward</span>
                  <span className="stat-val">👟 'first_visit'</span>
                </div>
              </div>
            </div>

            <div className="tour-mission-actions">
              <button
                type="button"
                className="btn-tour-primary btn-radar-explore"
                onClick={handleStartExplore}
              >
                📡 Sweep Radar on Explore (1 km)
              </button>
              <button
                type="button"
                className="btn-tour-secondary btn-radar-create"
                onClick={handleStartCreate}
              >
                ➕ Post a Weird Find
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
