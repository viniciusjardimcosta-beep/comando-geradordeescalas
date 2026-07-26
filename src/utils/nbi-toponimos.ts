// Fonte de validação de topônimos (municípios) usada pelo corretor NBI.
// Não substitui automaticamente: sugere a grafia canônica ou avisa que
// a grafia não foi reconhecida. Nunca inventa cidade silenciosamente.
//
// Base: municípios do Rio Grande do Sul (lista curada e ampliável).
// Sempre adicionar novas cidades preservando a acentuação oficial.

export const MUNICIPIOS_RS: readonly string[] = [
  "Porto Alegre", "Canoas", "Caxias do Sul", "Pelotas", "Santa Maria",
  "Gravataí", "Viamão", "Novo Hamburgo", "São Leopoldo", "Rio Grande",
  "Alvorada", "Passo Fundo", "Sapucaia do Sul", "Uruguaiana", "Santa Cruz do Sul",
  "Cachoeirinha", "Bagé", "Bento Gonçalves", "Erechim", "Guaíba",
  "Cachoeira do Sul", "Santana do Livramento", "Esteio", "Ijuí", "Sapiranga",
  "Alegrete", "Lajeado", "Farroupilha", "Venâncio Aires", "Santo Ângelo",
  "Camaquã", "Vacaria", "Cruz Alta", "Montenegro", "Santa Rosa",
  "Carazinho", "Torres", "Taquara", "Parobé", "Charqueadas",
  "Panambi", "São Sebastião do Caí", "São Vendelino", "São Marcos", "São Borja",
  "São Gabriel", "São Francisco de Paula", "São Jerônimo", "São Lourenço do Sul",
  "São Luiz Gonzaga", "São Pedro do Sul", "Nova Petrópolis", "Nova Prata",
  "Gramado", "Canela", "Igrejinha", "Três Coroas", "Rolante", "Riozinho",
  "Osório", "Tramandaí", "Capão da Canoa", "Xangri-lá", "Imbé", "Cidreira",
  "Palmares do Sul", "Mostardas", "Tapes", "Barra do Ribeiro", "Sertão Santana",
  "Butiá", "Arroio dos Ratos", "Eldorado do Sul", "Nova Santa Rita",
  "Portão", "Estância Velha", "Ivoti", "Dois Irmãos", "Lindolfo Collor",
  "Presidente Lucena", "Nova Hartz", "Araricá", "Campo Bom", "Sapiranga",
  "Rolante", "Riozinho", "Morro Reuter", "Santa Maria do Herval",
  "Feliz", "Bom Princípio", "Alto Feliz", "Vale Real", "Tupandi",
  "São José do Hortêncio", "Salvador do Sul", "Barão", "Brochier",
  "Maratá", "Poço das Antas", "Coronel Pilar", "Boa Vista do Sul",
  "Garibaldi", "Carlos Barbosa", "Flores da Cunha", "Antônio Prado",
  "Veranópolis", "Cotiporã", "Fagundes Varela", "Vista Alegre do Prata",
  "Nova Roma do Sul", "Nova Pádua", "Monte Belo do Sul", "Santa Tereza",
  "Pinto Bandeira", "Boa Vista do Buricá", "Horizontina", "Três de Maio",
  "Tuparendi", "Cândido Godói", "Campina das Missões", "Independência",
  "Giruá", "Roque Gonzales", "Porto Xavier", "Porto Lucena", "Pirapó",
  "Dezesseis de Novembro", "Sete de Setembro", "Cerro Largo", "Guarani das Missões",
  "Ubiretama", "São Paulo das Missões", "Salvador das Missões", "Rolador",
  "Bossoroca", "São Nicolau", "Garruchos", "Itaqui", "Maçambará",
  "Manoel Viana", "São Vicente do Sul", "Cacequi", "Rosário do Sul",
  "Quaraí", "Barra do Quaraí", "Dom Pedrito", "Lavras do Sul", "Santiago",
  "Jaguari", "Nova Esperança do Sul", "Unistalda", "Mata", "Toropi",
  "Formigueiro", "Restinga Sêca", "Faxinal do Soturno", "Nova Palma",
  "Pinhal Grande", "Júlio de Castilhos", "Tupanciretã", "Quevedos",
  "Ivorá", "Silveira Martins", "São João do Polêsine", "Dona Francisca",
  "Agudo", "Paraíso do Sul", "Vera Cruz", "Vale do Sol", "Sinimbu",
  "Herveiras", "Segredo", "Passa Sete", "Estrela Velha", "Arroio do Tigre",
  "Sobradinho", "Ibarama", "Lagoa Bonita do Sul", "Cerro Branco",
  "Novo Cabrais", "Cerro Grande do Sul", "Chuvisca", "Cristal", "Amaral Ferrador",
  "Encruzilhada do Sul", "Piratini", "Pedro Osório", "Cerrito", "Herval",
  "Pinheiro Machado", "Hulha Negra", "Aceguá", "Candiota", "Pedras Altas",
  "Santa Vitória do Palmar", "Chuí", "Arroio Grande", "Jaguarão", "Rio Pardo",
  "General Câmara", "Vale Verde", "Passo do Sobrado", "Sério", "Boqueirão do Leão",
  "Santa Clara do Sul", "Cruzeiro do Sul", "Marques de Souza", "Progresso",
  "Poço das Antas", "Teutônia", "Westfália", "Colinas", "Imigrante",
  "Roca Sales", "Encantado", "Doutor Ricardo", "Nova Bréscia", "Muçum",
  "Vespasiano Corrêa", "Coqueiro Baixo", "Anta Gorda", "Ilópolis",
  "Putinga", "Arvorezinha", "Fontoura Xavier", "São José do Herval",
  "Ilópolis", "Guaporé", "Serafina Corrêa", "Nova Bassano", "Paraí",
  "Casca", "Ciríaco", "Vanini", "Camargo", "Nova Alvorada",
];

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizarChave(s: string): string {
  return stripDiacritics(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

// Distância de Levenshtein iterativa (limite curto). Usada só para tolerar
// erros pequenos (1–2 caracteres) em municípios já conhecidos.
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a.charCodeAt(i - 1) === b.charCodeAt(j - 1)
        ? prev
        : 1 + Math.min(prev, dp[j - 1], dp[j]);
      prev = tmp;
    }
  }
  return dp[n];
}

// Mapa: chave normalizada → grafia canônica.
const MAPA_TOPONIMOS = (() => {
  const m = new Map<string, string>();
  for (const nome of MUNICIPIOS_RS) {
    m.set(normalizarChave(nome), nome);
  }
  return m;
})();

// Palavras funcionais mantidas em minúsculo no meio do nome.
const CONECTIVOS = new Set(["de", "da", "do", "das", "dos", "e"]);

function capitalizarNomeProprio(s: string): string {
  return s
    .split(/\s+/)
    .map((t, i) => {
      if (!t) return t;
      const low = t.toLowerCase();
      // Preserva variações com hífen: são-vendelino → São-Vendelino
      if (t.includes("-")) {
        return t
          .split("-")
          .map((p) => (CONECTIVOS.has(p.toLowerCase()) ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
          .join("-");
      }
      if (i > 0 && CONECTIVOS.has(low)) return low;
      return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    })
    .join(" ");
}

export interface SugestaoToponimo {
  original: string;
  correcao: string;
  reconhecido: boolean;   // true = município conhecido; false = só capitalização
  fonte: "toponimo" | "capitalizacao";
}

/**
 * Analisa a EXPRESSÃO COMPLETA de um campo (ORIGEM/DESTINO/CIDADE) e devolve
 * a melhor sugestão. Nunca aplica automaticamente.
 *
 * - Se a expressão bate com um município conhecido (com ou sem acento),
 *   sugere a grafia oficial (reconhecido=true).
 * - Se está a distância ≤2 caracteres de um município conhecido, sugere
 *   a grafia mais próxima (reconhecido=true).
 * - Caso contrário, sugere apenas capitalização de nome próprio
 *   (reconhecido=false) para o operador confirmar.
 */
export function sugerirToponimo(texto: string): SugestaoToponimo | null {
  const bruto = texto.trim();
  if (!bruto) return null;
  const chave = normalizarChave(bruto);
  if (!chave) return null;

  // 1) match exato normalizado
  const exato = MAPA_TOPONIMOS.get(chave);
  if (exato) {
    if (exato === bruto) return null;
    return { original: bruto, correcao: exato, reconhecido: true, fonte: "toponimo" };
  }

  // 2) match fuzzy: procura chaves com distância pequena, priorizando
  // aquelas de comprimento semelhante.
  let melhor: { canon: string; dist: number } | null = null;
  const maxDist = chave.length <= 8 ? 1 : 2;
  for (const [k, canon] of MAPA_TOPONIMOS) {
    if (Math.abs(k.length - chave.length) > maxDist) continue;
    const d = levenshtein(chave, k);
    if (d <= maxDist && (!melhor || d < melhor.dist)) {
      melhor = { canon, dist: d };
      if (d === 0) break;
    }
  }
  if (melhor) {
    if (melhor.canon === bruto) return null;
    return { original: bruto, correcao: melhor.canon, reconhecido: true, fonte: "toponimo" };
  }

  // 3) desconhecido — sugere apenas capitalização palavra a palavra.
  const cap = capitalizarNomeProprio(bruto);
  if (cap === bruto) return null;
  return { original: bruto, correcao: cap, reconhecido: false, fonte: "capitalizacao" };
}
