// Consulta de prazos compartilhada entre a tela /prazos e o resumo por e-mail —
// as duas precisam responder exatamente a mesma coisa sobre o que está pendente.

import { prisma } from './db';
import type { Prisma, StatusPrazo } from '@/generated/prisma/client';
import { DEFINICOES_PRAZO, diasRestantes, statusPorData } from './prazos';
import type { TipoPrazo } from './prazos';

export type FiltroStatus = 'pendente' | 'vencido' | 'cumprido' | 'todos';

/**
 * `vencido` não é gravado por um job diário: um prazo pendente vira vencido
 * sozinho quando a data passa. Guardar isso numa coluna exigiria varrer a tabela
 * todo dia só para ficar desatualizado entre as varreduras. `cumprido`, sim, é
 * estado real — decisão do usuário na tela — e por isso vence a data.
 */
export function statusEfetivo(
  prazo: { status: StatusPrazo; dataLimite: Date },
  hoje: Date = new Date(),
): StatusPrazo {
  if (prazo.status === 'cumprido') return 'cumprido';
  return statusPorData(prazo.dataLimite, hoje);
}

/** Mesmo critério do `statusEfetivo`, mas em SQL, para filtrar sem trazer tudo. */
export function filtroStatus(filtro: FiltroStatus, hoje: Date = new Date()): Prisma.PrazoWhereInput {
  const hojeUtc = new Date(
    Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()),
  );
  if (filtro === 'cumprido') return { status: 'cumprido' };
  if (filtro === 'vencido') {
    return { status: { not: 'cumprido' }, dataLimite: { lt: hojeUtc } };
  }
  if (filtro === 'pendente') {
    return { status: { not: 'cumprido' }, dataLimite: { gte: hojeUtc } };
  }
  return {};
}

export interface PrazoDetalhado {
  id: string;
  tipo: TipoPrazo;
  rotulo: string;
  fundamento: string;
  consequencia?: string;
  dataLimite: Date;
  dias: number;
  status: StatusPrazo;
  processo: string;
  nomeMarca: string | null;
  codigoDespacho: string;
  dataPublicacao: Date;
  edicaoRpi: number | null;
  marcaId: string | null;
  marcaNome: string | null;
  /** Colidência: o despacho é de marca de TERCEIRO parecida com a monitorada. */
  colidencia: boolean;
}

const INCLUDE = {
  despacho: {
    select: {
      processo: true,
      nomeMarca: true,
      codigo: true,
      dataPublicacao: true,
      edicaoRpi: { select: { numero: true } },
      marca: { select: { id: true, nome: true } },
    },
  },
} satisfies Prisma.PrazoInclude;

type PrazoComDespacho = Prisma.PrazoGetPayload<{ include: typeof INCLUDE }>;

function detalhar(p: PrazoComDespacho, hoje: Date): PrazoDetalhado {
  const tipo = p.tipo as TipoPrazo;
  // Tipo gravado que não existe mais na tabela de regras (regra removida depois
  // de gravar): degrada para o slug cru em vez de quebrar a tela.
  const def = DEFINICOES_PRAZO[tipo];
  return {
    id: p.id,
    tipo,
    rotulo: def?.rotulo ?? p.tipo,
    fundamento: def?.fundamento ?? '—',
    consequencia: def?.consequencia,
    dataLimite: p.dataLimite,
    dias: diasRestantes(p.dataLimite, hoje),
    status: statusEfetivo(p, hoje),
    processo: p.despacho.processo,
    nomeMarca: p.despacho.nomeMarca,
    codigoDespacho: p.despacho.codigo,
    dataPublicacao: p.despacho.dataPublicacao,
    edicaoRpi: p.despacho.edicaoRpi?.numero ?? null,
    marcaId: p.despacho.marca?.id ?? null,
    marcaNome: p.despacho.marca?.nome ?? null,
    colidencia: tipo === 'oposicao_a_marca_de_terceiro',
  };
}

export async function listarPrazos(opcoes: {
  status?: FiltroStatus;
  marcaId?: string;
  /** Só os que vencem nos próximos N dias — usado pelo resumo por e-mail. */
  dentroDeDias?: number;
  hoje?: Date;
}): Promise<PrazoDetalhado[]> {
  const hoje = opcoes.hoje ?? new Date();
  const where: Prisma.PrazoWhereInput = { ...filtroStatus(opcoes.status ?? 'todos', hoje) };
  if (opcoes.marcaId) where.despacho = { marcaId: opcoes.marcaId };
  if (opcoes.dentroDeDias !== undefined) {
    const teto = new Date(
      Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()) +
        opcoes.dentroDeDias * 86_400_000,
    );
    where.dataLimite = { ...(where.dataLimite as object), lte: teto };
  }

  const prazos = await prisma.prazo.findMany({
    where,
    include: INCLUDE,
    // Mais urgente primeiro — é a ordem em que o usuário precisa agir.
    orderBy: [{ dataLimite: 'asc' }, { tipo: 'asc' }],
  });
  return prazos.map((p) => detalhar(p, hoje));
}

export async function contarPorStatus(hoje: Date = new Date()) {
  const [pendentes, vencidos, cumpridos] = await Promise.all([
    prisma.prazo.count({ where: filtroStatus('pendente', hoje) }),
    prisma.prazo.count({ where: filtroStatus('vencido', hoje) }),
    prisma.prazo.count({ where: filtroStatus('cumprido', hoje) }),
  ]);
  return { pendentes, vencidos, cumpridos };
}
