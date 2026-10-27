
/**
 * LoadingSkeleton - Accessible animated pulse placeholder for async content
 */
export function LoadingSkeleton({ count = 3, type = 'card' }) {
  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading content"
      className={`skeleton-group skeleton-type-${type}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4, 16px)',
        width: '100%',
      }}
    >
      <span className="sr-only" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', border: 0 }}>
        Loading data...
      </span>

      {items.map((key) => {
        if (type === 'text') {
          return (
            <div
              key={key}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2, 8px)',
                width: '100%',
              }}
            >
              <div
                style={{
                  height: '16px',
                  width: '90%',
                  background: 'var(--bg-elevated, #FFF3E0)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  animation: 'skeleton-pulse 1.5s ease-in-out infinite',
                }}
              />
              <div
                style={{
                  height: '14px',
                  width: '75%',
                  background: 'var(--bg-elevated, #FFF3E0)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  animation: 'skeleton-pulse 1.5s ease-in-out infinite 0.2s',
                }}
              />
            </div>
          );
        }

        if (type === 'feed' || type === 'card') {
          return (
            <div
              key={key}
              style={{
                display: 'flex',
                gap: 'var(--space-4, 16px)',
                padding: 'var(--space-4, 16px)',
                background: 'var(--bg-surface, #FFFFFF)',
                border: '1px solid var(--border-subtle, #E6DFD5)',
                borderRadius: 'var(--radius-md, 10px)',
                boxShadow: 'var(--shadow-card, 0 4px 12px rgba(0,0,0,0.3))',
              }}
            >
              <div
                style={{
                  width: '90px',
                  height: '90px',
                  flexShrink: 0,
                  background: 'var(--bg-elevated, #FFF3E0)',
                  borderRadius: 'var(--radius-md, 8px)',
                  animation: 'skeleton-pulse 1.5s ease-in-out infinite',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2, 8px)',
                  flexGrow: 1,
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    height: '20px',
                    width: '65%',
                    background: 'var(--bg-elevated, #FFF3E0)',
                    borderRadius: 'var(--radius-sm, 4px)',
                    animation: 'skeleton-pulse 1.5s ease-in-out infinite 0.1s',
                  }}
                />
                <div
                  style={{
                    height: '14px',
                    width: '45%',
                    background: 'var(--bg-elevated, #FFF3E0)',
                    borderRadius: 'var(--radius-sm, 4px)',
                    animation: 'skeleton-pulse 1.5s ease-in-out infinite 0.2s',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--space-2, 8px)',
                    marginTop: '4px',
                  }}
                >
                  <div
                    style={{
                      height: '18px',
                      width: '50px',
                      background: 'var(--bg-elevated, #FFF3E0)',
                      borderRadius: 'var(--radius-full, 9999px)',
                      animation: 'skeleton-pulse 1.5s ease-in-out infinite 0.3s',
                    }}
                  />
                  <div
                    style={{
                      height: '18px',
                      width: '60px',
                      background: 'var(--bg-elevated, #FFF3E0)',
                      borderRadius: 'var(--radius-full, 9999px)',
                      animation: 'skeleton-pulse 1.5s ease-in-out infinite 0.35s',
                    }}
                  />
                </div>
              </div>
            </div>
          );
        }

        // Generic block
        return (
          <div
            key={key}
            style={{
              height: '120px',
              width: '100%',
              background: 'var(--bg-elevated, #FFF3E0)',
              borderRadius: 'var(--radius-md, 10px)',
              animation: 'skeleton-pulse 1.5s ease-in-out infinite',
            }}
          />
        );
      })}

      <style>{`
        @keyframes skeleton-pulse {
          0% { opacity: 0.6; }
          50% { opacity: 0.25; }
          100% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

/**
 * EmptyState - Engaging placeholder when no data exists or queries return zero results
 */
export function EmptyState({
  title = 'No Spots Found Here Yet',
  message = 'Be the first scout to discover and document a curiosity in this sector!',
  icon = '🧭',
  actionText,
  onAction,
  secondaryActionText,
  onSecondaryAction,
}) {
  return (
    <div
      className="empty-state-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 'var(--space-10, 40px) var(--space-6, 24px)',
        background: 'var(--bg-surface, #FFFFFF)',
        border: '1px dashed var(--border-strong, #D1C7BA)',
        borderRadius: 'var(--radius-lg, 14px)',
        margin: 'var(--space-6, 24px) 0',
        color: 'var(--text-primary, #1A1814)',
      }}
    >
      <div
        style={{
          fontSize: '3.5rem',
          lineHeight: 1,
          marginBottom: 'var(--space-4, 16px)',
          filter: 'drop-shadow(var(--accent-glow, 0 0 10px rgba(255, 111, 0, 0.28)))',
        }}
      >
        {icon}
      </div>

      <h3
        style={{
          margin: 0,
          fontSize: 'var(--text-xl, 1.25rem)',
          fontFamily: 'var(--font-heading, sans-serif)',
          color: 'var(--text-primary, #1A1814)',
        }}
      >
        {title}
      </h3>

      <p
        style={{
          margin: 'var(--space-2, 8px) 0 var(--space-6, 24px)',
          fontSize: 'var(--text-sm, 0.875rem)',
          color: 'var(--text-secondary, #6E675F)',
          maxWidth: '460px',
          lineHeight: 'var(--leading-relaxed, 1.6)',
        }}
      >
        {message}
      </p>

      {(actionText || secondaryActionText) && (
        <div style={{ display: 'flex', gap: 'var(--space-3, 12px)', flexWrap: 'wrap' }}>
          {actionText && (
            <button
              type="button"
              className="btn-primary"
              onClick={onAction}
              style={{
                cursor: 'pointer',
                padding: 'var(--space-2, 8px) var(--space-5, 20px)',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'var(--accent-cta, #C2410C)',
                color: 'var(--text-inverse, #FFFFFF)',
                border: 'none',
                fontWeight: 600,
                fontSize: 'var(--text-sm, 0.875rem)',
                boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(24, 24, 27, 0.04))',
              }}
            >
              {actionText}
            </button>
          )}

          {secondaryActionText && (
            <button
              type="button"
              className="btn-secondary"
              onClick={onSecondaryAction}
              style={{
                cursor: 'pointer',
                padding: 'var(--space-2, 8px) var(--space-4, 16px)',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'var(--bg-elevated, #FFF7ED)',
                color: 'var(--text-primary, #18181B)',
                border: '1px solid var(--border-subtle, #ECE7DF)',
                fontWeight: 500,
                fontSize: 'var(--text-sm, 0.875rem)',
              }}
            >
              {secondaryActionText}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * ErrorBanner - Accessible dismissible notification banner for transient or API errors
 */
export function ErrorBanner({
  error,
  message,
  code,
  retry,
  onDismiss,
  variant = 'danger',
}) {
  const displayMsg =
    message || error?.message || (typeof error === 'string' ? error : 'An error occurred.');
  const errorCode = code || error?.code;

  const isWarning = variant === 'warning';
  const borderColor = isWarning
    ? 'var(--badge-gold-border, var(--color-warning, #B45309))'
    : 'var(--badge-red-border, var(--color-danger, #B91C1C))';
  const bgColor = isWarning
    ? 'var(--badge-gold-bg, var(--color-warning-bg, #FFFBEB))'
    : 'var(--badge-red-bg, var(--color-danger-bg, #FEF2F2))';
  const textColor = isWarning
    ? 'var(--badge-gold-text, #92400E)'
    : 'var(--badge-red-text, #991B1B)';

  return (
    <div
      role="alert"
      aria-live="polite"
      className="error-banner"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3, 12px)',
        padding: 'var(--space-3, 12px) var(--space-4, 16px)',
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-md, 8px)',
        margin: 'var(--space-3, 12px) 0',
        color: textColor,
        fontSize: 'var(--text-sm, 0.875rem)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2, 8px)', flexGrow: 1 }}>
        <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{isWarning ? '⚠️' : '🚨'}</span>
        <div>
          <span style={{ fontWeight: 600 }}>{displayMsg}</span>
          {errorCode && (
            <span
              style={{
                marginLeft: 'var(--space-2, 8px)',
                fontSize: 'var(--text-2xs, 11px)',
                padding: '2px 6px',
                borderRadius: 'var(--radius-sm, 4px)',
                background: 'var(--badge-neutral-bg, var(--bg-elevated, #FFF3E0))',
                color: 'var(--badge-neutral-text, var(--text-muted, #6E675F))',
                fontFamily: 'var(--font-mono, monospace)',
                border: '1px solid var(--badge-neutral-border, var(--border-subtle, #E6DFD5))',
              }}
            >
              [{errorCode}]
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2, 8px)', flexShrink: 0 }}>
        {retry && (
          <button
            type="button"
            onClick={retry}
            style={{
              cursor: 'pointer',
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm, 4px)',
              background: 'var(--bg-surface, #FFFFFF)',
              color: 'var(--text-primary, #1A1814)',
              border: `1px solid ${borderColor}`,
              fontSize: 'var(--text-xs, 0.75rem)',
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        )}

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss message"
            style={{
              cursor: 'pointer',
              background: 'transparent',
              border: 'none',
              color: textColor,
              fontSize: '1.1rem',
              padding: '2px 6px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
