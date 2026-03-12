import React, { Component, ReactNode } from 'react';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleQuit = () => {
    window.electronAPI.quitApp();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-content">
            <div className="error-icon">😵</div>
            <h2 className="error-title">龙虾宝宝遇到问题了</h2>
            <p className="error-message">
              {this.state.error?.message || '未知错误'}
            </p>
            
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
              <button className="error-btn primary" onClick={this.handleReload}>
                🔄 重新加载
              </button>
              <button className="error-btn secondary" onClick={this.handleQuit}>
                ❌ 退出应用
              </button>
            </div>

            <p className="error-hint">
              如果问题持续，请尝试重启应用或查看日志文件：
              <br />
              <code>~/lobster-baby-debug.log</code>
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
