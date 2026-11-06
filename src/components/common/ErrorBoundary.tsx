import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from '@/components/common/icons';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message?: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : 'Onbekende fout' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary ving een fout op:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-20 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10 text-rijksrood">
            <AlertTriangle size={28} />
          </span>
          <h1 className="text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Er ging iets mis</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">{this.state.message}</p>
          <button className="opl-btn-primary" onClick={() => window.location.reload()}>
            Pagina herladen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
