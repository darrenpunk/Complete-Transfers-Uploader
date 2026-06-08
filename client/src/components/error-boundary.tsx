import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App error boundary caught an error:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center space-y-4 rounded-xl border border-border bg-card p-8 shadow-lg">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <RefreshCw className="h-6 w-6 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">
              Something went wrong
            </h1>
            <p className="text-sm text-muted-foreground">
              We hit a temporary problem loading the page. This is usually brief
              — please reload to continue.
            </p>
            <Button
              onClick={this.handleReload}
              className="w-full"
              data-testid="button-error-reload"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Reload page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
