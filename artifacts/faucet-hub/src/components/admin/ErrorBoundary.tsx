import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
}

export class AdminTabErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 text-center p-8">
          <AlertTriangle className="w-10 h-10 text-red-400 opacity-80" />
          <div className="space-y-1">
            <p className="font-mono text-sm font-semibold text-red-400">
              {this.props.label ?? "Panel"} crashed
            </p>
            <p className="font-mono text-xs text-muted-foreground max-w-md break-all">
              {this.state.error.message}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="font-mono text-xs"
            onClick={() => this.setState({ error: null })}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
