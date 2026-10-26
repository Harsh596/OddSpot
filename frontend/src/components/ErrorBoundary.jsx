import React from 'react';

/**
 * Standard React Error Boundary component with theme-aware fallback UI,
 * error isolation, accessible alert role, and retry action.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an unhandled rendering error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.hash = '#/feed';
    this.handleReset();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback({
              error: this.state.error,
              reset: this.handleReset,
            })
          : this.props.fallback;
      }

      const errorMessage =
        this.state.error?.message || 'An unexpected rendering error occurred.';

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="error-boundary-container"
          style={{
            padding: 'var(--space-8, 2rem)',
            maxWidth: '680px',
            margin: 'var(--space-8, 2rem) auto',
            background: 'var(--bg-surface, #121722)',
            border: '1px solid var(--color-danger, #ef4444)',
            borderRadius: 'var(--radius-lg, 12px)',
            boxShadow: 'var(--shadow-card, 0 4px 16px rgba(0, 0, 0, 0.5))',
            color: 'var(--text-primary, #f0f4fc)',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3, 12px)', marginBottom: 'var(--space-4, 16px)' }}>
            <span style={{ fontSize: '2rem' }}>⚠️</span>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 'var(--text-xl, 1.25rem)',
                  color: 'var(--color-danger, #ef4444)',
                  fontFamily: 'var(--font-heading, sans-serif)',
                }}
              >
                Anomaly Detected in Render Pipeline
              </h2>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 'var(--text-sm, 0.875rem)',
                  color: 'var(--text-secondary, #94a3b8)',
                }}
              >
                The view encountered an unexpected glitch while displaying this spot.
              </p>
            </div>
          </div>

          <div
            style={{
              padding: 'var(--space-3, 12px)',
              background: 'var(--bg-elevated, #1a2030)',
              borderRadius: 'var(--radius-md, 8px)',
              border: '1px solid var(--border-subtle, #202738)',
              marginBottom: 'var(--space-6, 24px)',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 'var(--text-xs, 0.75rem)',
              color: 'var(--text-primary, #f0f4fc)',
              wordBreak: 'break-word',
            }}
          >
            {errorMessage}
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3, 12px)', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={this.handleReset}
              style={{
                cursor: 'pointer',
                padding: 'var(--space-2, 8px) var(--space-4, 16px)',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'var(--accent, #00f0ff)',
                color: 'var(--text-inverse, #0b0e14)',
                border: 'none',
                fontWeight: 600,
                fontSize: 'var(--text-sm, 0.875rem)',
              }}
            >
              🔄 Try Again
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={this.handleGoHome}
              style={{
                cursor: 'pointer',
                padding: 'var(--space-2, 8px) var(--space-4, 16px)',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'var(--bg-elevated, #1a2030)',
                color: 'var(--text-primary, #f0f4fc)',
                border: '1px solid var(--border-strong, #2f3b54)',
                fontWeight: 500,
                fontSize: 'var(--text-sm, 0.875rem)',
              }}
            >
              🏠 Return to Feed
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={this.handleReload}
              style={{
                cursor: 'pointer',
                padding: 'var(--space-2, 8px) var(--space-4, 16px)',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'transparent',
                color: 'var(--text-secondary, #94a3b8)',
                border: '1px solid var(--border-subtle, #202738)',
                fontWeight: 500,
                fontSize: 'var(--text-sm, 0.875rem)',
              }}
            >
              Reload Page
            </button>
          </div>

          {this.state.errorInfo && (
            <div style={{ marginTop: 'var(--space-4, 16px)' }}>
              <button
                type="button"
                onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted, #64748b)',
                  fontSize: 'var(--text-xs, 0.75rem)',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                {this.state.showDetails ? 'Hide technical details' : 'Show technical details'}
              </button>
              {this.state.showDetails && (
                <pre
                  style={{
                    marginTop: 'var(--space-2, 8px)',
                    padding: 'var(--space-3, 12px)',
                    background: 'var(--bg-elevated, #1a2030)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    fontSize: '11px',
                    color: 'var(--text-muted, #64748b)',
                    overflowX: 'auto',
                    maxHeight: '200px',
                  }}
                >
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
