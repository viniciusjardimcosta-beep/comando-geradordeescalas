import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Loga mas não derruba a aplicação
    console.error("[ErrorBoundary] componente quebrou:", error, info);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="panel max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">Algo deu errado nesta tela</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Houve uma falha inesperada ao renderizar este componente. Você pode tentar novamente ou voltar ao início — o restante do sistema continua funcionando.
          </p>
          {import.meta.env.DEV && this.state.error?.message && (
            <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-destructive">
              {this.state.error.message}
            </pre>
          )}
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={this.reset}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Tentar novamente
            </button>
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Voltar ao início
            </a>
          </div>
        </div>
      </div>
    );
  }
}
