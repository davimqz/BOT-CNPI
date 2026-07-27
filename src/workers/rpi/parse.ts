import { XMLParser } from 'fast-xml-parser';

// Estrutura validada contra o manual oficial v1.03 (docs/rpi_xml_marcas_versao_103.pdf)
// e contra as edições reais 2897 e 2898. Diferença observada entre manual e produção:
// as classes NCL vêm dentro de <lista-classe-nice>, não como <classe-nice> solta.

export interface DespachoParseado {
  processo: string;
  codigo: string;
  nomeDespacho: string;
  textoComplementar: string | null;
  nomeMarca: string | null;
  titular: string | null;
  classeNcl: string | null;
}

export interface RevistaParseada {
  numero: number;
  dataPublicacao: Date;
  despachos: DespachoParseado[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function parseDataBr(data: string): Date {
  const [dia, mes, ano] = data.split('/').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

export function parseRevista(xml: string): RevistaParseada {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    // Números de processo têm zeros à esquerda; nunca converter para Number.
    parseTagValue: false,
    parseAttributeValue: false,
    isArray: (name) =>
      ['processo', 'despacho', 'titular', 'classe-nice', 'classe-vienna'].includes(name),
  });

  const doc = parser.parse(xml);
  const revista = doc.revista;
  if (!revista || !revista['@numero'] || !revista['@data']) {
    throw new Error('XML não tem a raiz <revista numero data> esperada — layout mudou?');
  }

  const numero = Number(revista['@numero']);
  const dataPublicacao = parseDataBr(revista['@data']);
  const despachos: DespachoParseado[] = [];

  for (const processo of asArray<any>(revista.processo)) {
    const numeroProcesso = String(processo['@numero'] ?? '').trim();
    if (!numeroProcesso) continue;

    const nomeMarca = processo.marca?.nome != null ? String(processo.marca.nome).trim() : null;

    const titulares = asArray<any>(processo.titulares?.titular)
      .map((t) => String(t['@nome-razao-social'] ?? '').trim())
      .filter(Boolean);
    const titular = titulares.length ? titulares.join('; ') : null;

    // Produção usa <lista-classe-nice><classe-nice>; o manual mostra <classe-nice> direta.
    const classes = [
      ...asArray<any>(processo['lista-classe-nice']?.['classe-nice']),
      ...asArray<any>(processo['classe-nice']),
    ]
      .map((c) => String(c['@codigo'] ?? '').trim())
      .filter(Boolean);
    const classeNcl = classes.length ? classes.join(';') : null;

    for (const despacho of asArray<any>(processo.despachos?.despacho)) {
      const codigo = String(despacho['@codigo'] ?? '').trim();
      if (!codigo) continue;
      const texto = despacho['texto-complementar'];
      despachos.push({
        processo: numeroProcesso,
        codigo,
        nomeDespacho: String(despacho['@nome'] ?? '').trim(),
        textoComplementar: texto != null && String(texto).trim() ? String(texto).trim() : null,
        nomeMarca,
        titular,
        classeNcl,
      });
    }
  }

  return { numero, dataPublicacao, despachos };
}
