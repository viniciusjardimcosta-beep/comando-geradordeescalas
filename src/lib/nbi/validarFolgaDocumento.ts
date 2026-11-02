import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { interpolarTexto, type MilitarNbi } from "@/utils/nbi";
import { validarFolgaCompensatoria, subtipoFolga, SUBTIPO_FOLGA_PADRAO } from "./folgaCompensatoria";
import { motorFolgaCompensatoria } from "./motores/folgaCompensatoria";
import type { CampoTemplate } from "./motores/tipos";

/** Read-only: validate persisted structured Folga before any numbering operation. */
export async function validarFolgaDocumento(client: SupabaseClient<Database>, userId: string, assuntos: unknown): Promise<string | null> {
  if (!Array.isArray(assuntos)) return null;
  for (const assunto of assuntos) {
    if (!assunto || assunto.tipo !== "folga_compensatoria") continue;
    const campos = assunto.campos && typeof assunto.campos === "object" && !Array.isArray(assunto.campos) ? assunto.campos : {};
    const erros = validarFolgaCompensatoria(campos);
    if (erros.length) return erros.join("; ");
    const sub = String(campos.SUBTIPO ?? "").trim() || SUBTIPO_FOLGA_PADRAO;
    const codigo = subtipoFolga(sub).template;
    const legado = campos.NATUREZA_SALDO === undefined;
    // Old realizada drafts stored the base pair; still verify REALIZADA text.
    const parAntigoRealizada = legado && sub === "realizada"
      && assunto.template_codigo === "folga_compensatoria" && assunto.subtipo === "previsao";
    const metadadosCoerentes = legado
      ? (assunto.template_codigo == null || assunto.template_codigo === codigo)
        && (assunto.subtipo == null || assunto.subtipo === sub)
      : assunto.template_codigo === codigo && assunto.subtipo === sub;
    if (!metadadosCoerentes && !parAntigoRealizada) {
      return "Metadados de folga compensatória incompatíveis com o subtipo selecionado.";
    }
    if (!assunto.militar_id) return "Selecione o militar cadastrado para a folga compensatória.";
    const { data: militar, error: eMilitar } = await client.from("militares").select("*")
      .eq("user_id", userId).eq("id", assunto.militar_id).maybeSingle();
    const { data: template, error: eTemplate } = await client.from("nbi_templates")
      .select("texto_modelo,campos").eq("codigo", codigo).maybeSingle();
    if (eMilitar || !militar || eTemplate || !template) return "Não foi possível conferir militar e template da folga compensatória.";
    const valores = motorFolgaCompensatoria.resolverCampos({ campos, militar: militar as MilitarNbi, titular: null,
      camposTemplate: template.campos as unknown as CampoTemplate[] });
    const esperado = interpolarTexto(template.texto_modelo, valores);
    if (esperado.ausentes.length || esperado.texto !== assunto.texto_final) {
      return "Texto de folga compensatória incompatível com os campos e o template. Reabra e salve o rascunho.";
    }
  }
  return null;
}