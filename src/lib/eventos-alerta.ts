// Eventos de despacho que o usuário pode escolher como gatilho de alerta.
// A lista de 11 eventos e o mapeamento evento → códigos IPAS vêm da skill
// rpi-ingestion-despachos (references/despacho-codes.md), confirmados contra as
// edições reais RM2897/RM2898. `marcas_monitoradas.eventos_alerta` guarda os
// slugs (não códigos IPAS): se o mapeamento ganhar códigos novos, marcas já
// cadastradas passam a cobri-los sem migração de dados.

export interface EventoAlerta {
  slug: string;
  rotulo: string;
  // Códigos IPAS confirmados que caem neste evento. Vazio = evento de "estado"
  // do processo (não publicado como despacho na RPI) — não dispara via ingestão.
  codigos: string[];
}

export const EVENTOS_ALERTA: EventoAlerta[] = [
  { slug: 'deferimento', rotulo: 'Deferimento do pedido', codigos: ['IPAS029', 'IPAS768', 'IPAS781'] },
  { slug: 'concessao', rotulo: 'Concessão de registro', codigos: ['IPAS158', 'IPAS770'] },
  {
    slug: 'oposicao',
    rotulo: 'Oposição (Publicação/Notificação)',
    codigos: ['IPAS009', 'IPAS756', 'IPAS423'],
  },
  { slug: 'aguardando-exame', rotulo: 'Aguardando Exame (Mérito ou Técnico)', codigos: [] },
  { slug: 'exigencia-formal', rotulo: 'Exigência Formal', codigos: ['IPAS005'] },
  {
    slug: 'sobrestamento',
    rotulo: 'Sobrestamento',
    codigos: ['IPAS142', 'IPAS499', 'IPAS227', 'IPAS771'],
  },
  { slug: 'exigencia-merito', rotulo: 'Exigência de Mérito', codigos: ['IPAS136', 'IPAS267', 'IPAS772'] },
  {
    slug: 'indeferimento',
    rotulo: 'Indeferimento do pedido',
    codigos: ['IPAS024', 'IPAS774', 'IPAS658'],
  },
  {
    slug: 'aguardando-pagamento',
    rotulo: 'Aguardando pagamento da concessão',
    codigos: ['IPAS395', 'IPAS089'],
  },
  {
    slug: 'extincao-arquivamento',
    rotulo: 'Extinção ou Arquivamento',
    codigos: [
      'IPAS161',
      'IPAS304',
      'IPAS139',
      'IPAS106',
      'IPAS157',
      'IPAS185',
      'IPAS289',
      'IPAS291',
      'IPAS404',
      'IPAS409',
      'IPAS773',
      'IPAS1016',
    ],
  },
  { slug: 'registro-vigente', rotulo: 'Registro de Marca Vigente', codigos: [] },
];

const POR_SLUG = new Map(EVENTOS_ALERTA.map((e) => [e.slug, e]));

export function eventoPorSlug(slug: string): EventoAlerta | undefined {
  return POR_SLUG.get(slug);
}

// Decide se um despacho recém-ingerido deve gerar alerta para uma marca,
// dado o `eventos_alerta` dela. Lista vazia = todos os eventos (padrão).
export function despachoDisparaAlerta(eventosAlerta: string[], codigoDespacho: string): boolean {
  if (eventosAlerta.length === 0) return true;
  return eventosAlerta.some((slug) => POR_SLUG.get(slug)?.codigos.includes(codigoDespacho) ?? false);
}
