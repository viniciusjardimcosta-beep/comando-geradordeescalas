import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

// Diagnóstico detalhado apenas em desenvolvimento; em produção mostramos mensagem genérica.
const DEBUG_MODE = import.meta.env.DEV;

function extractFirstComponent(componentStack: string | null): string | null {
  if (!componentStack) return null;
  const lines = componentStack.split("\n").map((l) => l.trim()).filter(Boolean);
  // formato típico: "at ComponentName (file.tsx:12:34)"
  for (const line of lines) {
    const m = line.match(/at\s+([A-Za-z0-9_$.]+)/);
    if (m && m[1] && !/^[a-z]/.test(m[1])) return m[1];
  }
  return lines[0] ?? null;
}

function extractFirstLocation(stack: string | undefined | null): string | null {
  if (!stack) return null;
  const lines = stack.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // Tenta capturar algo tipo (path/file.tsx:123:45) ou path/file.tsx:123:45
    const m = line.match(/\(?([^()\s]+\.(?:tsx?|jsx?|mjs|cjs)):(\d+):(\d+)\)?/);
    if (m) return `${m[1]}:${m[2]}:${m[3]}`;
  }
  return null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    // Console detalhado para diagnóstico
    // eslint-disable-next-line no-console
    console.group("%c[ErrorBoundary] Componente quebrou", "color:#ef4444;font-weight:bold");
    // eslint-disable-next-line no-console
    console.error("Mensagem:", error?.message);
    // eslint-disable-next-line no-console
    console.error("Nome:", error?.name);
    // eslint-disable-next-line no-console
    console.error("Stack:", error?.stack);
    // eslint-disable-next-line no-console
    console.error("Component stack:", info.componentStack);
    // eslint-disable-next-line no-console
    console.error("Erro bruto:", error);
    // eslint-disable-next-line no-console
    console.groupEnd();
  }

  reset = () => this.setState({ hasError: false, error: null, componentStack: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const { error, componentStack } = this.state;
    const showDebug = DEBUG_MODE || import.meta.env.DEV;
    const componentName = extractFirstComponent(componentStack);
    const location = extractFirstLocation(error?.stack);

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <div className="panel w-full max-w-2xl p-8">
          <h1 className="text-xl font-semibold text-foreground">Algo deu errado nesta tela</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Houve uma falha inesperada ao renderizar este componente. Você pode tentar novamente ou voltar ao início — o restante do sistema continua funcionando.
          </p>

          {showDebug && error && (
            <div className="mt-5 space-y-3 text-left">
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-destructive">
                  Diagnóstico (modo debug)
                </div>
                <dl className="mt-2 space-y-1.5 text-xs">
                  {componentName && (
                    <div className="flex gap-2">
                      <dt className="min-w-[110px] font-mono text-muted-foreground">component</dt>
                      <dd className="font-mono text-foreground break-all">{componentName}</dd>
                    </div>
                  )}
                  {location && (
                    <div className="flex gap-2">
                      <dt className="min-w-[110px] font-mono text-muted-foreground">origem</dt>
                      <dd className="font-mono text-foreground break-all">{location}</dd>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <dt className="min-w-[110px] font-mono text-muted-foreground">name</dt>
                    <dd className="font-mono text-foreground break-all">{error.name}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="min-w-[110px] font-mono text-muted-foreground">message</dt>
                    <dd className="font-mono text-destructive break-all">{error.message}</dd>
                  </div>
                </dl>
              </div>

              {error.stack && (
                <details className="rounded-md bg-muted p-3" open>
                  <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                    Stack trace
                  </summary>
                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-destructive">
                    {error.stack}
                  </pre>
                </details>
              )}

              {componentStack && (
                <details className="rounded-md bg-muted p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                    Component stack
                  </summary>
                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground">
                    {componentStack}
                  </pre>
                </details>
              )}
            </div>
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
