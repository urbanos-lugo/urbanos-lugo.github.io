import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { Dict } from '../i18n';

interface ErrorBoundaryProps {
  t: Dict;
  /** Changing this clears a caught error. A prop rather than a `key`: a key rebuilds everything inside, and the map paid for that on every visit. */
  resetKey?: string;
  children: ReactNode;
}

/**
 * Keeps one broken screen from taking the whole app down: without it React unmounts the
 * entire tree and the reader gets a white page at a bus stop. A class, because
 * `componentDidCatch` has no hook equivalent.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('A view failed to render:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { t } = this.props;
    return (
      <div className="page-column px-cap-3.5 py-8" role="alert">
        <h2 className="text-title font-semibold tracking-title">{t.error.title}</h2>
        <p className="mt-2 text-body leading-prose text-ink-2">{t.error.body}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => window.location.reload()} className="btn btn-primary">
            {t.error.reload}
          </button>
          <a href="https://buslugo.com" target="_blank" rel="noopener noreferrer" className="btn btn-outbound">
            {t.error.official}
          </a>
        </div>
      </div>
    );
  }
}
