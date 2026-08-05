// Registry central dos motores NBI (Bloco 8A — Onda 1).
// Wizard e gerador DOCX consultam apenas este registry. Proibido switch/case
// por assunto fora daqui. Textos oficiais permanecem em nbi_templates.

import type { MotorNbi } from "./tipos";
import { motorFerias } from "./ferias";
import { motorApresentacao } from "./apresentacao";
import { motorNupcias } from "./nupcias";
import { motorLuto } from "./luto";
import { motorViagem } from "./viagem";
import { motorAssuncaoFuncao } from "./assuncaoFuncao";
import { motorDispensaFuncao } from "./dispensaFuncao";
import { motorLicencaPaternidade } from "./licencaPaternidade";
import { motorServicoExtraordinario } from "./servicoExtraordinario";
import { motorDispensaRecompensa } from "./dispensaRecompensa";
import { motorNomeacaoComissao } from "./nomeacaoComissao";
import { motorServicoExtraordinarioConvocacao } from "./servicoExtraordinarioConvocacao";
import { motorFolgaCompensatoria } from "./folgaCompensatoria";

export * from "./tipos";

const MOTORES: MotorNbi[] = [
  motorFerias,
  motorApresentacao,
  motorNupcias,
  motorLuto,
  motorViagem,
  motorAssuncaoFuncao,
  motorDispensaFuncao,
  motorLicencaPaternidade,
  motorServicoExtraordinario,
  motorDispensaRecompensa,
  motorNomeacaoComissao,
  motorServicoExtraordinarioConvocacao,
  motorFolgaCompensatoria,
];


const POR_CODIGO = new Map<string, MotorNbi>(MOTORES.map((m) => [m.codigo, m]));

export function obterMotor(codigo: string | null | undefined): MotorNbi | null {
  if (!codigo) return null;
  return POR_CODIGO.get(codigo) ?? null;
}

export function listarMotores(): MotorNbi[] {
  return [...MOTORES];
}

export function codigosComMotor(): string[] {
  return MOTORES.map((m) => m.codigo);
}

/** Título oficial do documento conhecido pelo registry (fallback do banco). */
export function tituloDocumentoDoRegistry(codigo: string): string | null {
  return POR_CODIGO.get(codigo)?.tituloDocumento ?? null;
}
