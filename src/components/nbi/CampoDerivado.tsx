// Bloco 9B — Campo derivado (somente leitura + alteração manual com confirmação).
// Exibe origem do dado, permite substituição explícita e sinaliza o estado.
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, PencilLine, RotateCcw } from "lucide-react";
import type { OrigemDado } from "@/lib/nbi/derivados";

export function CampoDerivado({
  label, valor, origem, detalhe, tipo = "text", manual, obrigatorio, testId,
  onAlterarManual, onVoltarDerivado, onChange,
}: {
  label: string;
  valor: string;
  origem: OrigemDado;
  detalhe?: string;
  tipo?: "text" | "date" | "number";
  manual: boolean;
  obrigatorio?: boolean;
  /** Identificador estável aplicado diretamente no input. */
  testId?: string;
  onAlterarManual: () => void;
  onVoltarDerivado: () => void;
  onChange: (v: string) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label>{label}{obrigatorio && <span className="text-destructive"> *</span>}</Label>
        <Badge variant={manual ? "destructive" : "secondary"} className="text-[10px]">
          {manual ? "Alterado manualmente" : origem}
        </Badge>
      </div>

      {!manual ? (
        <div className="mt-1 flex items-center gap-2">
          <Input data-testid={testId} type={tipo} value={valor} readOnly disabled className="bg-muted" />
          {!confirmando ? (
            <Button type="button" size="sm" variant="outline" data-testid={testId ? `${testId}-alterar` : undefined} onClick={() => setConfirmando(true)}>
              <PencilLine className="mr-1 h-3 w-3" /> Alterar manualmente
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button type="button" size="sm" data-testid={testId ? `${testId}-confirmar` : undefined} onClick={() => { setConfirmando(false); onAlterarManual(); }}>
                Confirmar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmando(false)}>
                Cancelar
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-1 flex items-center gap-2">
          <Input data-testid={testId} type={tipo} value={valor} onChange={(e) => onChange(e.target.value)} />
          <Button type="button" size="sm" variant="outline" onClick={onVoltarDerivado}>
            <RotateCcw className="mr-1 h-3 w-3" /> Voltar ao automático
          </Button>
        </div>
      )}

      <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3" />
        {manual
          ? "Substituição manual registrada no snapshot."
          : `Origem: ${origem}${detalhe ? ` · ${detalhe}` : ""}`}
      </p>
    </div>
  );
}
