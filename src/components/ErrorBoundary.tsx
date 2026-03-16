import React, { Component, ReactNode } from 'react';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  retryCount: number;
  countdown: number;
}

const MAX_AUTO_RETRIES = 3;
const RETRY_DELAY = 5;

export class ErrorBoundary extends Component<Props, State> {
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, retryCount: 0, countdown: RETRY_DELAY };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({ errorInfo });

    // Auto-retry
    if (this.state.retryCount < MAX_AUTO_RETRIES) {
      this.startCountdown();
    }
  }

  componentWillUnmount() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }

  startCountdown = () => {
    this.setState({ countdown: RETRY_DELAY });
    this.countdownTimer = setInterval(() => {
      this.setState(prev => {
        if (prev.countdown <= 1) {
          if (this.countdownTimer) clearInterval(this.countdownTimer);
          this.handleRetry();
          return prev;
        }
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);
  };

  handleRetry = () => {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.setState(prev => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prev.retryCount + 1,
      countdown: RETRY_DELAY,
    }));
  };

  handleReload = () => {
    window.location.reload();
  };

  handleQuit = () => {
    window.electronAPI.quitApp();
  };

  render() {
    if (this.state.hasError) {
      const canAutoRetry = this.state.retryCount < MAX_AUTO_RETRIES;

      return (
        <div className="error-boundary">
          <div className="error-content">
            <div className="error-icon">😵</div>
            <h2 className="error-title">龙虾宝宝遇到问题了</h2>
            <p className="error-message">
              {this.state.error?.message || '未知错误'}
            </p>

            {canAutoRetry && (
              <div className="error-auto-retry">
                {this.state.countdown}s 后自动恢复… (第 {this.state.retryCount + 1}/{MAX_AUTO_RETRIES} 次)
              </div>
            )}

            {this.state.errorInfo && (
              <details className="error-details">
                <summary>技术详情</summary>
                <pre className="error-stack">
                  {this.state.error?.stack}
                  {'\n\n'}
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            <div className="error-actions">
              <button className="error-btn primary" onClick={canAutoRetry ? this.handleRetry : this.handleReload}>
                {canAutoRetry ? '⚡ 立即恢复' : '🔄 重新加载'}
              </button>
              <button className="error-btn secondary" onClick={this.handleQuit}>
                ❌ 退出
              </button>
            </div>

            {!canAutoRetry && (
              <p className="error-hint">
                自动恢复失败，请重启应用或查看：
                <br />
                <code>~/lobster-baby-debug.log</code>
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
