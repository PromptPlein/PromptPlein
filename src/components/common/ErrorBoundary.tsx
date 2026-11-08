import { Component, type ErrorInfo, type ReactNode } from 'react';
import '@nldd/design-system/button';
import '@nldd/design-system/container';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/simple-section';

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
        <nldd-simple-section>
          <nldd-container padding-block="80" sm-padding-block="40">
            <nldd-inline-dialog
              variant="alert"
              heading-level={1}
              text="Er ging iets mis"
              supporting-text={this.state.message}
            >
              <nldd-button
                slot="actions"
                appearance="primary"
                start-icon="refresh"
                text="Herlaad de pagina"
                onClick={() => window.location.reload()}
              ></nldd-button>
            </nldd-inline-dialog>
          </nldd-container>
        </nldd-simple-section>
      );
    }
    return this.props.children;
  }
}
