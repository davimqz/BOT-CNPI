// Roadmap de fases do processo de registro de marca, para a tela de detalhe de
// uma marca monitorada (/marcas/[id]).
//
// As 10 fases e seus rótulos vêm do Índice Geral que abre toda edição da RPI
// (página 3 do PDF da Seção de Marcas) — é o próprio INPI quem agrupa os
// despachos dessa forma, não uma classificação nossa. Fonte: RPI 2900
// (04/08/2026), conferida em .claude/skills/rpi-ingestion-despachos/references/despacho-codes.md.
//
// Cobertura deliberadamente parcial: só um código entra numa fase quando o
// NOME OFICIAL do despacho (despacho-codes.md) deixa a fase inequívoca. Um
// grupo de códigos é genérico por natureza — "Deferimento da petição"
// (IPAS270), "Indeferimento da petição" (IPAS271) e afins decidem QUALQUER
// tipo de petição (desistência, renúncia, retificação, prioridade...), e o
// Índice Geral só sabe distinguir o tipo porque agrupa fisicamente o despacho
// dentro da seção certa no PDF — informação que a ingestão não grava hoje
// (não existe coluna para "seção do índice" em `despachos`). Forçar esses
// códigos numa fase seria fase errada apresentada como certa; ficam de fora e
// aparecem no histórico da marca sem fase atribuída.
export type FaseSlug =
  | 'pedido_em_andamento'
  | 'pedido_inexistente'
  | 'pedido_arquivado'
  | 'desistencia'
  | 'concessao'
  | 'registro_extinto'
  | 'registro_cancelado'
  | 'renuncia'
  | 'nulidade_administrativa'
  | 'caducidade';

export interface FaseRoadmap {
  slug: FaseSlug;
  ordem: number;
  /** Título do Índice Geral, em title case (o PDF publica em caixa alta). */
  titulo: string;
  /** Códigos IPAS confirmados (despacho-codes.md) que a fase cobre. */
  codigos: string[];
}

export const FASES_ROADMAP: FaseRoadmap[] = [
  {
    slug: 'pedido_em_andamento',
    ordem: 1,
    titulo: 'Pedido de registro em andamento',
    codigos: [
      'IPAS395', // Exigência de pagamento
      'IPAS089', // Exigência de pagamento (em petição)
      'IPAS005', // Exigência formal
      'IPAS009', // Publicação de pedido para oposição
      'IPAS756', // idem, designação
      'IPAS421', // Republicação de pedido
      'IPAS135', // Republicação de pedido (por perda da prioridade)
      'IPAS423', // Notificação de oposição
      'IPAS136', // Exame de mérito: exigência
      'IPAS267', // idem, em petição
      'IPAS772', // idem, designação
      'IPAS142', // Exame de mérito: sobrestamento
      'IPAS499', // Sobrestamento da instrução técnica
      'IPAS227', // idem, em petição
      'IPAS771', // idem, designação
      'IPAS024', // Exame de mérito: indeferimento
      'IPAS774', // idem, designação
      'IPAS658', // idem, em retificação
      'IPAS029', // Exame de mérito: deferimento
      'IPAS768', // idem, designação
      'IPAS781', // idem, designação, parcial
    ],
  },
  {
    slug: 'pedido_inexistente',
    ordem: 2,
    titulo: 'Pedido de registro considerado inexistente',
    codigos: [
      'IPAS047', // Falta de pagamento da retribuição
      'IPAS091', // Exigência de pagamento não cumprida
      'IPAS112', // Exigência formal não respondida
      'IPAS113', // Exigência formal não cumprida
    ],
  },
  {
    slug: 'pedido_arquivado',
    ordem: 3,
    titulo: 'Pedido de registro definitivamente arquivado',
    codigos: [
      'IPAS106', // Falta de procuração
      'IPAS185', // idem, em petição
      'IPAS289', // Falta de documentos de marca de certificação
      'IPAS291', // Falta de documentos de marca coletiva
      'IPAS139', // Falta de resposta à exigência de mérito
      'IPAS773', // idem, designação
      'IPAS157', // Falta de pagamento das retribuições da concessão
      'IPAS404', // Arquivamento de ofício
    ],
  },
  {
    slug: 'concessao',
    ordem: 4,
    titulo: 'Concessão de registro de marca',
    codigos: [
      'IPAS158', // Registro de marca concedido
      'IPAS770', // idem, designação
      'IPAS579', // Emissão de segunda via de certificado
      'IPAS575', // Emissão de cópia oficial
    ],
  },
  {
    slug: 'registro_extinto',
    ordem: 5,
    titulo: 'Registro de marca extinto',
    codigos: [
      'IPAS161', // Pelo fim da vigência
      'IPAS304', // Pela caducidade
    ],
  },
  {
    slug: 'registro_cancelado',
    ordem: 6,
    titulo: 'Registro de marca cancelado de ofício',
    codigos: ['IPAS409'],
  },
  {
    slug: 'nulidade_administrativa',
    ordem: 7,
    titulo: 'Nulidade administrativa de registro de marca',
    codigos: [
      'IPAS400', // Notificação de nulidade, a requerimento
      'IPAS437', // idem, de ofício
      'IPAS530', // Requerimento provido (nulo o registro)
      'IPAS532', // Requerimento não provido (mantida a concessão)
    ],
  },
  {
    slug: 'caducidade',
    ordem: 8,
    titulo: 'Caducidade de registro de marca',
    codigos: [
      'IPAS338', // Notificação de caducidade
      'IPAS669', // Deferimento da petição de caducidade
    ],
  },
  // 'desistencia' e 'renuncia' (fases 4 e 8 do Índice Geral) ficam sem código
  // próprio: os despachos que as compõem são todos do grupo genérico de
  // "decisão de petição" (IPAS270/271/349/699/402/403 etc.), que o índice só
  // consegue separar por seção física do PDF — ver nota no topo do arquivo.
  {
    slug: 'desistencia',
    ordem: 9,
    titulo: 'Desistência de pedido de registro de marca',
    codigos: [],
  },
  {
    slug: 'renuncia',
    ordem: 10,
    titulo: 'Renúncia a registro de marca',
    codigos: [],
  },
];

const FASE_POR_CODIGO = new Map<string, FaseRoadmap>(
  FASES_ROADMAP.flatMap((fase) => fase.codigos.map((codigo) => [codigo, fase] as const)),
);

export function faseDoCodigo(codigo: string): FaseRoadmap | undefined {
  return FASE_POR_CODIGO.get(codigo);
}

export interface DespachoParaRoadmap {
  id: string;
  codigo: string;
  dataPublicacao: Date;
}

export interface FaseComProgresso extends FaseRoadmap {
  alcancada: boolean;
  atual: boolean;
  despachos: DespachoParaRoadmap[];
}

export interface RoadmapMarca {
  fases: FaseComProgresso[];
  /** Despachos cujo código não tem fase reconhecida (ver nota no topo do arquivo) — não somem, só ficam fora do roadmap visual. */
  semFase: DespachoParaRoadmap[];
}

/**
 * Monta o roadmap a partir dos despachos JÁ FILTRADOS de uma marca (mesma
 * fonte que alimenta o Histórico RPI dela). "Atual" é a fase do despacho mais
 * recente com fase reconhecida — não confundir com um status oficial: é só o
 * último marco batido pelas movimentações capturadas por este sistema.
 */
export function roadmapDaMarca(despachos: DespachoParaRoadmap[]): RoadmapMarca {
  const ordenados = [...despachos].sort(
    (a, b) => a.dataPublicacao.getTime() - b.dataPublicacao.getTime(),
  );

  const porFase = new Map<FaseSlug, DespachoParaRoadmap[]>();
  const semFase: DespachoParaRoadmap[] = [];
  let ultimaFaseSlug: FaseSlug | null = null;

  for (const despacho of ordenados) {
    const fase = faseDoCodigo(despacho.codigo);
    if (!fase) {
      semFase.push(despacho);
      continue;
    }
    const lista = porFase.get(fase.slug) ?? [];
    lista.push(despacho);
    porFase.set(fase.slug, lista);
    ultimaFaseSlug = fase.slug;
  }

  const fases: FaseComProgresso[] = FASES_ROADMAP.map((fase) => ({
    ...fase,
    despachos: porFase.get(fase.slug) ?? [],
    alcancada: porFase.has(fase.slug),
    atual: fase.slug === ultimaFaseSlug,
  }));

  return { fases, semFase };
}
