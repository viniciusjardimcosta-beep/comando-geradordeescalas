// Bloco 9B — Missão estruturada do Serviço Extraordinário.
// O operador escolhe entre missões cadastradas; "Outro" permite cadastrar
// uma nova opção reutilizável. Nenhum trecho da frase oficial é digitado.
import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { missoesCadastradas, cadastrarMissao } from "@/lib/nbi/derivados";

export function MissaoField({
  label, valor, obrigatorio, onChange,
}: {
  label: string;
  valor: string;
  obrigatorio?: boolean;
  onChange: (v: string) => void;
}) {
  const [versao, setVersao] = useState(0);
  const opcoes = useMemo(() => missoesCadastradas(), [versao]);
  const conhecido = opcoes.includes(valor);
  const [modo, setModo] = useState<"lista" | "outro">(valor && !conhecido ? "outro" : "lista");
  const [novo, setNovo] = useState("");

  return (
    <div className="rounded-md border p-3">
      <Label>{label}{obrigatorio && <span className="text-destructive"> *</span>}</Label>
      <div className="mt-2 grid gap-2">
        <Select
          value={modo === "outro" ? "__outro__" : (conhecido ? valor : "")}
          onValueChange={(v) => {
            if (v === "__outro__") { setModo("outro"); return; }
            setModo("lista");
            onChange(v);
          }}
        >
          <SelectTrigger><SelectValue placeholder="Selecionar missão executada" /></SelectTrigger>
          <SelectContent>
            {opcoes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            <SelectItem value="__outro__">— Outra missão —</SelectItem>
          </SelectContent>
        </Select>

        {modo === "outro" && (
          <div className="flex gap-2">
            <Input
              value={novo || (conhecido ? "" : valor)}
              onChange={(e) => { setNovo(e.target.value); onChange(e.target.value); }}
              placeholder="Ex.: Cmt de GU, COV"
            />
            <Button
              type="button" size="sm" variant="outline"
              onClick={() => {
                const v = (novo || valor).trim();
                if (!v) return;
                cadastrarMissao(v);
                onChange(v);
                setVersao((n) => n + 1);
                setModo("lista");
              }}
            >
              Salvar como opção
            </Button>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Somente a expressão da missão — o restante da frase pertence ao modelo oficial.
        </p>
      </div>
    </div>
  );
}
