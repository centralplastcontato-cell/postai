// 🧹 LIMPEZA do Instagram AOS POUCOS: o dono confere a lista de repetidos e aperta Apagar; os IDs
// vão pra uma fila na marca (Marca.limpezaIg) e o PILOTO (a cada ~10 min) apaga alguns por passada.
// O Instagram trava ("User is performing too many actions") se apagar rápido — quando trava, a fila
// espera cada vez mais (30 min → 12 h) e tenta de novo sozinha. Ninguém precisa ficar com a tela aberta.
import { prisma } from "@/lib/prisma";
import { apagarMidiaIG } from "@/lib/instagram";
import { registrarAtividade } from "@/lib/atividade";
import { AGENTE } from "@/lib/config";

export type FilaLimpezaIG = { ids: string[]; feitos: number; falhas: number; travas: number; proxima: string; aviso: string; inicio: string; fim?: string };

const POR_PASSADA = 2;
const ESPERA_TRAVA_MIN = [30, 60, 120, 240, 480, 720];
const DESISTE_DIAS = 7;

export function lerFilaIG(s: string | null | undefined): FilaLimpezaIG | null {
  if (!s) return null;
  try {
    const f = JSON.parse(s) as FilaLimpezaIG;
    return Array.isArray(f.ids) ? f : null;
  } catch {
    return null;
  }
}

export const ehTravaIG = (erro: string) => /too many|rate limit|limit reached|try again later|#(4|17|32|613|368|80002)[)/]/i.test(erro);
const semPermissao = (erro: string) => /permission|#10[)/]|#200[)/]/i.test(erro);

/** Uma passada do piloto: apaga até POR_PASSADA posts da fila desta marca (se já for a hora). */
export async function processarLimpezaIG(m: { id: string; nome: string; igUserId: string | null; accessToken: string | null; limpezaIg: string }, agora: Date) {
  const f = lerFilaIG(m.limpezaIg);
  if (!f || !f.ids.length || !m.igUserId || !m.accessToken) return;
  if (f.proxima && new Date(f.proxima).getTime() > agora.getTime()) return;
  const conn = { igUserId: m.igUserId, accessToken: m.accessToken };
  let fimMsg = "";
  for (let i = 0; i < POR_PASSADA && f.ids.length; i++) {
    const id = f.ids[0];
    const r = await apagarMidiaIG(conn, id).catch((e) => ({ ok: false, erro: e instanceof Error ? e.message : "erro" }));
    const erro = r.erro || "";
    if (r.ok || /does not exist|cannot be loaded/i.test(erro)) {
      f.ids.shift(); f.feitos++; f.travas = 0; f.aviso = "";
    } else if (ehTravaIG(erro)) {
      const min = ESPERA_TRAVA_MIN[Math.min(f.travas, ESPERA_TRAVA_MIN.length - 1)];
      f.travas++;
      f.aviso = erro;
      f.proxima = new Date(agora.getTime() + min * 60_000).toISOString();
      break;
    } else if (semPermissao(erro)) {
      fimMsg = `Parei a limpeza do Instagram de ${m.nome}: a Meta não deu permissão pra apagar (${erro}). Falta a permissão instagram_manage_contents no token.`;
      f.ids = [];
      break;
    } else {
      f.ids.shift(); f.falhas++; f.aviso = erro; // erro desse post específico: pula pro próximo
    }
    if (i + 1 < POR_PASSADA && f.ids.length) await new Promise((ok) => setTimeout(ok, 3000));
  }
  if (!fimMsg && f.ids.length && agora.getTime() - new Date(f.inicio).getTime() > DESISTE_DIAS * 86400_000) {
    fimMsg = `Parei a limpeza do Instagram de ${m.nome}: depois de ${DESISTE_DIAS} dias o Instagram ainda travava. Apaguei ${f.feitos}; ${f.ids.length} ficaram.`;
    f.ids = [];
  }
  if (!f.ids.length && !fimMsg) fimMsg = `Terminei a limpeza do Instagram de ${m.nome}: apaguei ${f.feitos} post(s) repetido(s)${f.falhas ? ` (${f.falhas} não deu)` : ""}.`;
  // grava só se ninguém mexeu na fila enquanto isso (ex.: o dono cancelou). Acabou → fica o resumo
  // (ids vazio + fim) pra tela mostrar, até o dono fechar o aviso.
  if (fimMsg) f.fim = fimMsg;
  const novo = JSON.stringify(f);
  await prisma.marca.updateMany({ where: { id: m.id, limpezaIg: m.limpezaIg }, data: { limpezaIg: novo } }).catch(() => {});
  if (fimMsg) await registrarAtividade(AGENTE, fimMsg, m.id).catch(() => {});
}
