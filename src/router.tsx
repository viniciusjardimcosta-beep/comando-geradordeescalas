import { createRouter, useRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Modo debug temporário: força exibir diagnóstico mesmo em produção.
const DEBUG_MODE = true;

function extractFirstLocation(stack: string | undefined | null): string | null {
  if (!stack) return null;
  const lines = stack.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/\(?([^()\s]+\.(?:tsx?|jsx?|mjs|cjs)):(\d+):(\d+)\)?/);
    if (m) return `${m[1]}:${m[2]}:${m[3]}`;
  }
  return null;
}

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const showDebug = DEBUG_MODE || import.meta.env.DEV;
  const location = extractFirstLocation(error?.stack);

  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.group("%c[Router] Erro em rota", "color:#ef4444;font-weight:bold");
    // eslint-disable-next-line no-console
    console.error("Mensagem:", error?.message);
    // eslint-disable-next-line no-console
    console.error("Stack:", error?.stack);
    // eslint-disable-next-line no-console
    console.error("Erro bruto:", error);
    // eslint-disable-next-line no-console
    console.groupEnd();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-2xl text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Tivemos um problema</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ocorreu uma falha inesperada nesta página. Você pode tentar novamente ou voltar ao início — o sistema continua funcionando.
        </p>
        {showDebug && error && (
          <div className="mt-5 space-y-3 text-left">
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-destructive">
                Diagnóstico (modo debug)
              </div>
              <dl className="mt-2 space-y-1.5 text-xs">
                {location && (
                  <div className="flex gap-2">
                    <dt className="min-w-[90px] font-mono text-muted-foreground">origem</dt>
                    <dd className="font-mono text-foreground break-all">{location}</dd>
                  </div>
                )}
                <div className="flex gap-2">
                  <dt className="min-w-[90px] font-mono text-muted-foreground">name</dt>
                  <dd className="font-mono text-foreground break-all">{error.name}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="min-w-[90px] font-mono text-muted-foreground">message</dt>
                  <dd className="font-mono text-destructive break-all">{error.message}</dd>
                </div>
              </dl>
            </div>
            {error.stack && (
              <details className="rounded-md bg-muted p-3" open>
                <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                  Stack trace
                </summary>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-left font-mono text-[11px] leading-relaxed text-destructive">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
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

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};
