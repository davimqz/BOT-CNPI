/**
 * Pop-up de novidades na interface (Fase 6) — o canal mais simples de todos, e o
 * único que funciona sem nenhuma credencial configurada. É o fallback para
 * quando e-mail e WhatsApp ainda não estão de pé.
 *
 * POR QUE ELE NÃO LÊ `despachos.alerta_pendente`: aquela fila pertence ao
 * e-mail e é zerada assim que o envio dá certo (ver src/workers/alertas/enviar.ts).
 * Um pop-up montado sobre ela ficaria vazio exatamente quando o e-mail volta a
 * funcionar — ou seja, só mostraria novidade enquanto o outro canal estivesse
 * quebrado. Isso é pior do que não existir: o usuário aprende a confiar num
 * aviso que some sozinho.
 *
 * O estado deste canal é outro: `configuracoes_alerta.alertas_vistos_em`, um
 * "li até aqui" que só o usuário grava, ao dispensar o aviso. Novidade =
 * despacho vinculado a uma marca monitorada e criado depois desse marco.
 *
 * Deliberadamente NÃO é uma janela de tempo fixa ("novidades das últimas 24h"):
 * quem passou o fim de semana fora voltaria sem ver nada, e o prazo corre em
 * dias corridos, inclusive no fim de semana (LPI art. 221).
 *
 * Os dois canais continuam concordando sobre o que conta como UM alerta porque
 * passam pelo mesmo filtro de eventos (`despachoDisparaAlerta`) e pelo mesmo
 * agrupamento (`agruparAlertas`): um aviso por marca, e colidência nunca junto
 * com movimentação própria.
 */

import { prisma } from './db';
import { agruparAlertas, ehColidencia, type DespachoVinculado, type MarcaDoAlerta } from './alertas';
import { despachoDisparaAlerta } from './eventos-alerta';
import { statusDoDespacho } from './relatorio/alerta-despacho';

export interface MarcaComEventos extends MarcaDoAlerta {
  eventosAlerta: string[];
}

export interface DespachoNovo extends DespachoVinculado {
  marca: MarcaComEventos;
  textoDespacho: string | null;
  dataPublicacao: Date;
  edicaoRpi: number | null;
}

export interface NovidadeMarca {
  marcaId: string;
  marcaNome: string;
  colidencia: boolean;
  quantidade: number;
  /** Do despacho mais recente do grupo — é o que motivou o aviso. */
  status: string;
  processo: string;
  dataPublicacao: Date;
  edicaoRpi: number | null;
}

/**
 * Quantos grupos o aviso detalha. O resto vira "e mais N marcas" — uma lista
 * longa dentro de um pop-up não é lida, e a tela de histórico é o lugar certo
 * para ver tudo. O total exibido continua sendo o verdadeiro.
 */
export const TETO_NOVIDADES = 8;

/**
 * Teto da consulta, não do aviso: uma primeira ingestão (ou um `--recruzar`)
 * pode vincular milhares de despachos de uma vez, e ninguém precisa carregar
 * isso para dizer "há novidades". Quando bate no teto, `truncado` avisa que o
 * total é um piso, em vez de mentir um número exato.
 */
export const LIMITE_CONSULTA = 500;

export function resumirNovidades(despachos: DespachoNovo[]): NovidadeMarca[] {
  // Mesmo filtro do e-mail: o pop-up nunca mostra evento que a marca desligou.
  const relevantes = despachos.filter((d) =>
    despachoDisparaAlerta(d.marca.eventosAlerta, d.codigo),
  );

  return agruparAlertas(relevantes).map((g) => {
    const recente = [...g.despachos].sort(
      (a, b) => b.dataPublicacao.getTime() - a.dataPublicacao.getTime(),
    )[0];
    return {
      marcaId: g.marca.id,
      marcaNome: g.marca.nome,
      colidencia: g.colidencia,
      quantidade: g.despachos.length,
      status: statusDoDespacho(recente),
      processo: recente.processo,
      dataPublicacao: recente.dataPublicacao,
      edicaoRpi: recente.edicaoRpi,
    };
  });
}

export interface Novidades {
  /** `popup_habilitado` do usuário — desligado devolve zero novidades. */
  habilitado: boolean;
  /** Marco do "li até aqui"; nulo = o usuário nunca dispensou um aviso. */
  desde: Date | null;
  total: number;
  truncado: boolean;
  marcas: NovidadeMarca[];
  /** Grupos que não couberam no teto de exibição. */
  outrasMarcas: number;
}

const VAZIO: Omit<Novidades, 'habilitado' | 'desde'> = {
  total: 0,
  truncado: false,
  marcas: [],
  outrasMarcas: 0,
};

export async function carregarNovidades(usuarioId: string): Promise<Novidades> {
  const config = await prisma.configuracaoAlerta.findUnique({ where: { usuarioId } });
  const desde = config?.alertasVistosEm ?? null;
  if (config && !config.popupHabilitado) {
    return { habilitado: false, desde, ...VAZIO };
  }

  const linhas = await prisma.despacho.findMany({
    where: {
      marcaId: { not: null },
      ...(desde ? { criadoEm: { gt: desde } } : {}),
    },
    select: {
      id: true,
      processo: true,
      nomeMarca: true,
      classeNcl: true,
      codigo: true,
      textoDespacho: true,
      dataPublicacao: true,
      edicaoRpi: { select: { numero: true } },
      marca: {
        select: { id: true, nome: true, processo: true, classeNcl: true, eventosAlerta: true },
      },
    },
    // Mais recente primeiro: se o teto cortar, corta o mais antigo.
    orderBy: { criadoEm: 'desc' },
    take: LIMITE_CONSULTA,
  });

  const novos: DespachoNovo[] = linhas.map((d) => ({
    id: d.id,
    processo: d.processo,
    nomeMarca: d.nomeMarca,
    classeNcl: d.classeNcl,
    codigo: d.codigo,
    textoDespacho: d.textoDespacho,
    dataPublicacao: d.dataPublicacao,
    edicaoRpi: d.edicaoRpi?.numero ?? null,
    marca: {
      id: d.marca!.id,
      nome: d.marca!.nome,
      processo: d.marca!.processo,
      classeNcl: d.marca!.classeNcl,
      eventosAlerta: d.marca!.eventosAlerta,
      // O pop-up é visto por quem está logado; destinatário é assunto do e-mail.
      destinatario: null,
    },
  }));

  const grupos = resumirNovidades(novos);
  return {
    habilitado: true,
    desde,
    // Conta os despachos que sobraram do filtro de eventos, não as linhas cruas —
    // senão o número do aviso não bateria com a soma das marcas listadas.
    total: grupos.reduce((s, g) => s + g.quantidade, 0),
    truncado: linhas.length === LIMITE_CONSULTA,
    marcas: grupos.slice(0, TETO_NOVIDADES),
    outrasMarcas: Math.max(0, grupos.length - TETO_NOVIDADES),
  };
}

/**
 * Forma enviada à tela. Existe para que os dois caminhos até o componente — o
 * render no servidor (layout) e o polling via JSON (API) — entreguem
 * exatamente o mesmo formato: `Date` sobrevive à serialização de um, mas vira
 * string no outro, e um componente que precise adivinhar qual dos dois recebeu
 * quebra num dos caminhos.
 */
export interface NovidadesUI extends Omit<Novidades, 'desde' | 'marcas'> {
  marcas: (Omit<NovidadeMarca, 'dataPublicacao'> & { dataPublicacao: string })[];
}

export function paraUI(n: Novidades): NovidadesUI {
  // Campo a campo, e não por spread: `desde` fica de fora de propósito (é
  // estado interno do canal, a tela não tem o que fazer com ele), e listar os
  // campos obriga a decidir isso conscientemente quando algum novo aparecer.
  return {
    habilitado: n.habilitado,
    total: n.total,
    truncado: n.truncado,
    outrasMarcas: n.outrasMarcas,
    marcas: n.marcas.map((m) => ({ ...m, dataPublicacao: m.dataPublicacao.toISOString() })),
  };
}

/**
 * "Já vi" — move o marco para agora. Usa upsert porque a linha de configuração
 * só passa a existir quando o usuário mexe em alguma coisa (no uso pessoal,
 * pode nunca ter existido antes deste clique).
 */
export async function marcarNovidadesVistas(
  usuarioId: string,
  agora: Date = new Date(),
): Promise<Date> {
  await prisma.configuracaoAlerta.upsert({
    where: { usuarioId },
    create: { usuarioId, alertasVistosEm: agora },
    update: { alertasVistosEm: agora },
  });
  return agora;
}

/**
 * Caixa de Mensagem — inbox persistente das notificações dos processos
 * acompanhados (pedido do usuário, 16/08/2026), construída sobre a MESMA
 * fonte de verdade deste arquivo: `despachos` vinculados a marca + o marco
 * `alertas_vistos_em`. Não existe tabela de notificação própria — guardar
 * "que uma notificação existiu" separado do despacho que a originou seria
 * duplicar um fato que já está no banco (CLAUDE.md Seção 5: não adicionar
 * estrutura de dados por "pode ser útil depois").
 *
 * A diferença para `carregarNovidades` é o agrupamento: o pop-up junta TODOS
 * os despachos de uma marca desde o último "já vi" num card só (ele só
 * precisa dizer "há novidade"). A caixa de mensagem precisa listar cada
 * notificação que de fato chegaria como alerta, então agrupa por
 * marca+colidência+edição da RPI (ou dia, na fonte pePI) — a mesma unidade
 * que motivaria um e-mail. "Lida" é derivado, não gravado por item: um grupo
 * está lido quando todos os despachos que o compõem são anteriores ao marco.
 */

export interface ItemCaixaMensagem extends NovidadeMarca {
  /** Chave estável do grupo (marca+colidência+edição/dia) — usada como key de lista. */
  chave: string;
  lida: boolean;
}

export interface CaixaMensagens {
  itens: ItemCaixaMensagem[];
  total: number;
  totalNaoLidas: number;
}

/** Teto da consulta ao banco — ver LIMITE_CONSULTA acima para o mesmo raciocínio. */
const LIMITE_CAIXA = 1000;

function chaveDoEvento(d: DespachoNovo, colidencia: boolean): string {
  const marco = d.edicaoRpi != null ? `rpi:${d.edicaoRpi}` : `pepi:${d.dataPublicacao.toISOString().slice(0, 10)}`;
  return `${d.marca.id}|${colidencia}|${marco}`;
}

export function agruparCaixaMensagens(
  despachos: (DespachoNovo & { criadoEm: Date })[],
  desde: Date | null,
): ItemCaixaMensagem[] {
  const relevantes = despachos.filter((d) =>
    despachoDisparaAlerta(d.marca.eventosAlerta, d.codigo),
  );

  const grupos = new Map<string, { colidencia: boolean; despachos: (DespachoNovo & { criadoEm: Date })[] }>();
  for (const d of relevantes) {
    const colidencia = ehColidencia(d);
    const chave = chaveDoEvento(d, colidencia);
    const grupo = grupos.get(chave);
    if (grupo) grupo.despachos.push(d);
    else grupos.set(chave, { colidencia, despachos: [d] });
  }

  const itens = [...grupos.entries()].map(([chave, g]) => {
    const recente = [...g.despachos].sort(
      (a, b) => b.dataPublicacao.getTime() - a.dataPublicacao.getTime(),
    )[0];
    return {
      chave,
      marcaId: recente.marca.id,
      marcaNome: recente.marca.nome,
      colidencia: g.colidencia,
      quantidade: g.despachos.length,
      status: statusDoDespacho(recente),
      processo: recente.processo,
      dataPublicacao: recente.dataPublicacao,
      edicaoRpi: recente.edicaoRpi,
      lida: desde != null && g.despachos.every((d) => d.criadoEm <= desde),
    };
  });

  return itens.sort((a, b) => b.dataPublicacao.getTime() - a.dataPublicacao.getTime());
}

export async function carregarCaixaMensagens(usuarioId: string): Promise<CaixaMensagens> {
  const config = await prisma.configuracaoAlerta.findUnique({ where: { usuarioId } });
  const desde = config?.alertasVistosEm ?? null;

  const linhas = await prisma.despacho.findMany({
    where: { marcaId: { not: null } },
    select: {
      id: true,
      processo: true,
      nomeMarca: true,
      classeNcl: true,
      codigo: true,
      textoDespacho: true,
      dataPublicacao: true,
      criadoEm: true,
      edicaoRpi: { select: { numero: true } },
      marca: {
        select: { id: true, nome: true, processo: true, classeNcl: true, eventosAlerta: true },
      },
    },
    orderBy: { criadoEm: 'desc' },
    take: LIMITE_CAIXA,
  });

  const despachos: (DespachoNovo & { criadoEm: Date })[] = linhas.map((d) => ({
    id: d.id,
    processo: d.processo,
    nomeMarca: d.nomeMarca,
    classeNcl: d.classeNcl,
    codigo: d.codigo,
    textoDespacho: d.textoDespacho,
    dataPublicacao: d.dataPublicacao,
    criadoEm: d.criadoEm,
    edicaoRpi: d.edicaoRpi?.numero ?? null,
    marca: {
      id: d.marca!.id,
      nome: d.marca!.nome,
      processo: d.marca!.processo,
      classeNcl: d.marca!.classeNcl,
      eventosAlerta: d.marca!.eventosAlerta,
      destinatario: null,
    },
  }));

  const itens = agruparCaixaMensagens(despachos, desde);
  return {
    itens,
    total: itens.length,
    totalNaoLidas: itens.filter((i) => !i.lida).length,
  };
}

/** Forma enviada à tela — mesmo raciocínio de `paraUI` acima. */
export type ItemCaixaMensagemUI = Omit<ItemCaixaMensagem, 'dataPublicacao'> & {
  dataPublicacao: string;
};

export interface CaixaMensagensUI {
  itens: ItemCaixaMensagemUI[];
  total: number;
  totalNaoLidas: number;
}

export function caixaMensagensParaUI(c: CaixaMensagens): CaixaMensagensUI {
  return {
    total: c.total,
    totalNaoLidas: c.totalNaoLidas,
    itens: c.itens.map((i) => ({ ...i, dataPublicacao: i.dataPublicacao.toISOString() })),
  };
}
