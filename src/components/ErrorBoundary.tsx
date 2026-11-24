import { Component, type ReactNode } from "react";
import ErrorView from "./ErrorView";
import { AlertTriangle } from "lucide-react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  render() {
    if (this.state.error) {
      return (
        <ErrorView
          icon={AlertTriangle}
          code="500 / RENDER_ERROR"
          title="Component render failed"
          body={this.state.error.message}
          actions={
            <button
              onClick={() => this.setState({ error: null })}
              className="btn btn-primary"
            >
              Retry
            </button>
          }
        />
      );
    }
    return this.props.children;
  }
}
