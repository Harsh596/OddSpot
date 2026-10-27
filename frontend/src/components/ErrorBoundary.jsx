import { Component } from 'react';

/**
 * Standard React Error Boundary component with theme-aware fallback UI,
 * error isolation, accessible alert role, and retry action.
 */
export class ErrorBoundary extends Component {
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
    window.location.hash = '#/home';
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
            background: 'var(--bg-surface, #FFFFFF)',
            border: '1px solid var(--color-danger, #B91C1C)',
            borderRadius: 'var(--radius-lg, 14px)',
            boxShadow: 'var(--shadow-card, 0 1px 3px rgba(24, 24, 27, 0.05))',
            color: 'var(--text-primary, #18181B)',
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
                  color: 'var(--color-danger, #B91C1C)',
                  fontFamily: 'var(--font-heading, sans-serif)',
                }}
              >
                Interface Glitch Detected
              </h2>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 'var(--text-sm, 0.875rem)',
                  color: 'var(--text-secondary, #524C46)',
                }}
              >
                The view encountered an unexpected glitch while displaying this spot.
              </p>
            </div>
          </div>

          <div
            style={{
              padding: 'var(--space-3, 12px)',
              background: 'var(--bg-elevated, #FFF7ED)',
              borderRadius: 'var(--radius-md, 8px)',
              border: '1px solid var(--border-subtle, #ECE7DF)',
              marginBottom: 'var(--space-6, 24px)',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 'var(--text-xs, 0.75rem)',
              color: 'var(--text-primary, #18181B)',
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
                background: 'var(--accent-cta, #C2410C)',
                color: 'var(--text-inverse, #FFFFFF)',
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
                background: 'var(--bg-elevated, #FFF7ED)',
                color: 'var(--text-primary, #18181B)',
                border: '1px solid var(--border-strong, #D6CEC2)',
                fontWeight: 500,
                fontSize: 'var(--text-sm, 0.875rem)',
              }}
            >
              🏠 Return to Dispatch
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
                color: 'var(--text-secondary, #524C46)',
                border: '1px solid var(--border-subtle, #ECE7DF)',
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
                  color: 'var(--text-muted, #655E56)',
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
                    background: 'var(--bg-elevated, #FFF7ED)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    fontSize: '11px',
                    color: 'var(--text-muted, #655E56)',
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
