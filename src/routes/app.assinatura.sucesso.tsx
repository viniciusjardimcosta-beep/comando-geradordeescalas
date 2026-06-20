import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app/assinatura/sucesso")({
  component: SucessoPage,
});

function SucessoPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6 py-12 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <h1 className="text-2xl font-bold">Pagamento confirmado!</h1>
      <p className="text-sm text-muted-foreground">
        Sua assinatura foi processada com sucesso. Em instantes seu acesso será liberado
        automaticamente. Se demorar mais que alguns minutos, atualize a página.
      </p>
      <div className="flex justify-center gap-3">
        <Button asChild>
          <Link to="/app/importar">Ir para o sistema</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/app/assinatura">Ver assinatura</Link>
        </Button>
      </div>
    </div>
  );
}
