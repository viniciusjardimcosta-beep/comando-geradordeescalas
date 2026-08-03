import { listarMotores } from "@/lib/nbi/motores/registry";
const tpl: Record<string,string> = JSON.parse(require("fs").readFileSync("/tmp/nbi/tpl.json","utf8"));
const mil:any = { id:"1", nome:"SOLDADO SILVA", matricula:"1234567", posto_graduacao:"SD", quadro:"QPBM", genero_gramatical:"M", lotacao_nbi:"2ºPelBM/1ªCiaBM/12ºBBM PANAMBI", funcao_documental_nbi:"Cmt do 2ºPelBM/1ªCiaBM/12ºBBM PANAMBI" };
const tit:any = { ...mil, id:"2", nome:"SARGENTO SOUZA", matricula:"7654321", posto_graduacao:"1ºSGT" };
for (const m of listarMotores()) {
  const ex = m.exemplo();
  const base:any = { campos: { ...ex.contexto.campos, FUNCAO_ASSUMIDA:"1º Sgt do 1ºGBM", FUNCAO_DISPENSADA:"1º Sgt do 1ºGBM", MOTIVO_TITULAR:"férias regulamentares", MOTIVO_RETORNO:"férias regulamentares", ORIGEM:"Panambi/RS", DESTINO:"Santa Maria/RS", MISSAO: ex.contexto.campos.MISSAO ?? "Participar de reunião" }, militar: mil, titular: tit, camposTemplate: [] };
  const variantes:any[] = m.codigo === "dispensa_recompensa" ? [{...base, campos:{...base.campos, com_apresentacao:true}}, {...base, campos:{...base.campos, com_apresentacao:false}}] : [base];
  for (const ctx of variantes) {
    const code = (m as any).codigoTemplateEfetivo?.(ctx) ?? m.codigo;
    const texto = tpl[code]; if (!texto) { console.log("SEM TEMPLATE", code); continue; }
    const ph = m.montarPlaceholders(ctx);
    const out = texto.replace(/\{\{(\w+)\}\}/g, (_:any,k:string)=> ph[k] ?? `«${k}»`);
    console.log(`\n[${out.includes("«")?"FALHA":"OK"}] ${code}\n${out}`);
  }
}
