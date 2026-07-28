/**
 * Job de verificação da fonte `scraping` (Fase 3) — executado pelo workflow
 * .github/workflows/pepi-monitor.yml, nunca dentro do Vercel (CLAUDE.md 3.1 e 5).
 *
 * Para cada marca monitorada com `fonteDados = scraping`, refaz a consulta ao vivo
 * no pePI (mesmo worker da busca sob demanda) e compara o resultado com o último
 * retrato guardado em `marcas_monitoradas.ultimo_snapshot_pepi`. Diferença =
 * movimentação nova → grava uma linha em `despachos` por processo movimentado,
 * com `alertaPendente = true` para a Fase 6 notificar.
 *
 * Regras deliberadas (ver skill pepi-scraping-playbook):
 *  - marcas processadas EM SÉRIE, com pausa entre elas — nunca em paralelo;
 *  - teto de marcas por rodada (MARCAS_POR_RODADA), da mais desatualizada para a
 *    mais recente, para a rodada caber no tempo do runner mesmo com muitas marcas;
 *  - a primeira verificação de uma marca só grava o retrato inicial (sem alerta),
 *    senão todo o estado atual do INPI viraria "novidade" no primeiro dia;
 *  - falha numa marca não aborta as demais, mas faz o job terminar em erro para
 *    a rodada ficar vermelha no GitHub (um erro silencioso aqui é pior que ruído).
 */
import 'dotenv/config';
import { prisma } from '@/lib/db';
import {
  compararSnapshots,
  descreverDiff,
  despachosDeMudanca,
  houveMovimentacao,
  lerSnapshot,
  mesclarSnapshotTruncado,
  snapshotDeResultados,
  type ItemPepi,
} from '@/lib/monitor-pepi';
import { buscar, type TipoBuscaPepi } from './search';

const INTERVALO_ENTRE_MARCAS_MS = 5_000;
// Orçamento de tempo da rodada: uma consulta ao pePI pode levar minutos, então o
// teto de marcas não basta para garantir que a rodada termine. Ao estourar, o job
// FECHA normalmente (log gravado, marcas já verificadas salvas) em vez de ser
// morto pelo timeout do runner; as que sobraram são as mais desatualizadas e
// entram na frente na próxima rodada.
const TEMPO_MAXIMO_MS = Number(process.env.PEPI_MONITOR_MAX_MINUTOS) * 60_000 || 45 * 60_000;
// `||` e não `??`: numa rodada agendada o input do workflow chega como string
// vazia, que viraria 0 marcas por rodada — ou seja, monitoramento em silêncio.
const MARCAS_POR_RODADA = Number(process.env.PEPI_MONITOR_MAX_MARCAS) || 25;

interface MarcaParaVerificar {
  id: string;
  nome: string;
  processo: string | null;
  classeNcl: string | null;
  tipoBusca: string;
  ultimoSnapshotPepi: unknown;
}

/**
 * Marca cadastrada com nº de processo é consultada pelo número — é o critério
 * mais preciso e devolve exatamente uma linha. Sem número, cai na busca por nome
 * (radical/exata, como o usuário cadastrou), e aí a marca é monitorada como
 * "família de processos com esse nome".
 */
function consultaDaMarca(marca: MarcaParaVerificar): { termo: string; tipo: TipoBuscaPepi } | null {
  if (marca.processo) return { termo: marca.processo, tipo: 'processo' };
  if (marca.tipoBusca === 'titular') return null; // busca por titular não é monitorável marca a marca
  return { termo: marca.nome, tipo: marca.tipoBusca === 'exata' ? 'exata' : 'radical' };
}

async function verificarMarca(marca: MarcaParaVerificar): Promise<{ movimentacoes: number }> {
  const consulta = consultaDaMarca(marca);
  if (!consulta) {
    console.log(`[monitor] "${marca.nome}": tipo de busca não monitorável — ignorada.`);
    return { movimentacoes: 0 };
  }

  console.log(`[monitor] "${marca.nome}" (${consulta.tipo}: ${consulta.termo})`);
  const busca = await buscar(
    consulta.termo,
    consulta.tipo,
    consulta.tipo === 'processo' ? null : marca.classeNcl,
    async (etapa) => console.log(`[monitor]   ${etapa}`),
  );

  const itens: ItemPepi[] = busca.resultados.map((r) => ({
    processo: r.processo,
    marca: r.marca,
    situacao: r.situacao,
  }));
  const lido = snapshotDeResultados(itens);
  const anterior = lerSnapshot(marca.ultimoSnapshotPepi);
  if (busca.truncado) {
    console.log(
      `[monitor]   ATENÇÃO: resultado truncado no teto de páginas — retrato mesclado com o anterior.`,
    );
  }
  const atual = busca.truncado && anterior ? mesclarSnapshotTruncado(anterior, lido) : lido;

  if (!anterior) {
    await prisma.marcaMonitorada.update({
      where: { id: marca.id },
      data: { ultimoSnapshotPepi: atual, verificadoEm: new Date() },
    });
    console.log(
      `[monitor]   primeira verificação — retrato inicial com ${Object.keys(atual).length} processo(s), sem alerta.`,
    );
    return { movimentacoes: 0 };
  }

  // Resultado vazio onde antes havia processos é sintoma de consulta que falhou
  // sem erro explícito (sessão perdida, resposta parcial): não sobrescreve o
  // retrato bom com um vazio, senão a próxima rodada acusaria tudo como "novo".
  if (Object.keys(atual).length === 0 && Object.keys(anterior).length > 0) {
    throw new Error(
      `consulta devolveu 0 resultados, mas a verificação anterior tinha ${Object.keys(anterior).length} — ` +
        'resposta suspeita do pePI, retrato preservado.',
    );
  }

  const diff = compararSnapshots(anterior, atual);
  const linhas = houveMovimentacao(diff) ? despachosDeMudanca(diff, atual, itens) : [];
  console.log(`[monitor]   ${descreverDiff(diff)}`);

  await prisma.$transaction([
    ...(linhas.length
      ? [
          prisma.despacho.createMany({
            data: linhas.map((l) => ({
              marcaId: marca.id,
              processo: l.processo,
              nomeMarca: l.nomeMarca ?? marca.nome,
              classeNcl: marca.classeNcl,
              codigo: l.codigo,
              textoDespacho: l.textoDespacho,
              dataPublicacao: new Date(),
              // Sempre pendente: o código sintético do pePI não casa com nenhum
              // evento de despacho da RPI, então o filtro de eventos escolhido
              // pela marca não se aplica a esta fonte (é sempre "mudou algo").
              alertaPendente: true,
            })),
          }),
        ]
      : []),
    prisma.marcaMonitorada.update({
      where: { id: marca.id },
      data: { ultimoSnapshotPepi: atual, verificadoEm: new Date() },
    }),
  ]);

  return { movimentacoes: linhas.length };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL não definida. No GitHub Actions, confira o Repository secret DATABASE_URL.',
    );
  }

  const log = await prisma.logExecucao.create({
    data: { tipo: 'monitor_pepi', status: 'executando' },
  });

  const marcas = await prisma.marcaMonitorada.findMany({
    where: { ativa: true, fonteDados: 'scraping' },
    // Da mais desatualizada para a mais recente (nunca verificadas primeiro):
    // com mais marcas que o teto da rodada, a fila gira sozinha entre os dias.
    orderBy: [{ verificadoEm: { sort: 'asc', nulls: 'first' } }, { criadoEm: 'asc' }],
    take: MARCAS_POR_RODADA,
    select: {
      id: true,
      nome: true,
      processo: true,
      classeNcl: true,
      tipoBusca: true,
      ultimoSnapshotPepi: true,
    },
  });
  console.log(`[monitor] ${marcas.length} marca(s) de fonte scraping nesta rodada.`);

  let movimentacoes = 0;
  let verificadas = 0;
  const erros: { marca: string; erro: string }[] = [];
  const prazoFinal = Date.now() + TEMPO_MAXIMO_MS;

  for (const [i, marca] of marcas.entries()) {
    if (Date.now() > prazoFinal) {
      console.log(
        `[monitor] orçamento de tempo da rodada esgotado — ${marcas.length - i} marca(s) ficam para a próxima.`,
      );
      break;
    }
    if (i > 0) await new Promise((r) => setTimeout(r, INTERVALO_ENTRE_MARCAS_MS));
    try {
      const r = await verificarMarca(marca);
      movimentacoes += r.movimentacoes;
      verificadas++;
    } catch (e) {
      const erro = e as Error;
      console.error(`[monitor] ERRO em "${marca.nome}": ${erro.name}: ${erro.message}`);
      erros.push({ marca: marca.nome, erro: `${erro.name}: ${erro.message}` });
    }
  }

  const naoVerificadas = marcas.length - verificadas - erros.length;
  const resumo =
    `${verificadas}/${marcas.length} marca(s) verificada(s), ${movimentacoes} movimentação(ões) nova(s)` +
    (erros.length ? `, ${erros.length} com erro` : '') +
    (naoVerificadas > 0 ? `, ${naoVerificadas} adiada(s) por falta de tempo` : '');
  await prisma.logExecucao.update({
    where: { id: log.id },
    data: {
      status: erros.length ? 'erro' : 'sucesso',
      mensagem: resumo,
      detalhes: { marcas: marcas.length, verificadas, movimentacoes, naoVerificadas, erros },
      finalizadoEm: new Date(),
    },
  });
  await prisma.$disconnect();

  console.log(`[monitor] concluído: ${resumo}`);
  if (erros.length) process.exit(1);
}

main().catch(async (e) => {
  console.error('[monitor] ERRO:', e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
