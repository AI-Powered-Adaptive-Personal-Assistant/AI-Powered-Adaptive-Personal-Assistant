import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      let errorMessage = "An unexpected error occurred.";
      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error) {
            errorMessage = `System Error: ${parsed.error}`;
          }
        }
      } catch (e) {
        // Not a JSON error
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-slate-900 border border-red-500/20 rounded-2xl p-8 shadow-2xl shadow-red-500/5 text-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            
            <h1 className="text-xl font-semibold text-white mb-2">System Sync Error Detected</h1>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              {errorMessage}
            </p>

            <button
              onClick={this.handleReset}
              className="w-full py-3 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
            >
              <RefreshCcw className="w-4 h-4" />
              Re-establish Uplink
            </button>
            
            <p className="mt-6 text-[10px] text-slate-600 uppercase tracking-widest font-mono">
              System Error Code: {this.state.error?.name || "CORE_FAILURE"}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
