import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Catches anything thrown while drawing, so a bug can never leave a blank
 * page. An online game keeps running on the server, so Reload picks the game
 * up where it was.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Only the browser's own console: nothing leaves the device.
    console.error('Colonizers hit a problem', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h1>Something went wrong</h1>
        <p>
          Sorry, the game screen stopped. Reloading usually fixes it, and an online game is still
          there: you will come back to the same seat.
        </p>
        <p className="crash-buttons">
          <button type="button" className="primary big" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button type="button" className="ghost" onClick={() => window.location.assign('/')}>
            Home page
          </button>
        </p>
        <details>
          <summary>What went wrong</summary>
          <pre>{`${error.name}: ${error.message}`}</pre>
        </details>
      </div>
    );
  }
}
