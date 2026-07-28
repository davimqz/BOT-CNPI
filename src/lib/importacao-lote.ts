// Parser da importação em lote de marcas (Fase 3): texto colado ou conteúdo
// de arquivo .txt/.csv, uma marca por linha, nos 3 formatos do software de
// referência: só nº de processo; nº + nome; nº + nome + classe NCL.
//
// Função pura sem I/O — a rota de API decide o que fazer com o resultado
// (gravar as válidas, devolver os erros linha a linha para o usuário corrigir).

export interface LinhaImportada {
  processo: string;
  // null no formato "só número" — a marca entra com nome-placeholder e
  // tipoBusca "processo", já que só dá para monitorá-la pelo nº.
  nome: string | null;
  classeNcl: string | null;
}

export interface ErroLinha {
  // 1-indexado, contando linhas em branco — para o usuário achar no arquivo.
  linha: number;
  conteudo: string;
  motivo: string;
}

export interface ResultadoParse {
  marcas: LinhaImportada[];
  erros: ErroLinha[];
}

// Cabeçalho típico de planilha exportada ("processo;marca;classe") — ignorado
// em silêncio se for a primeira linha não vazia e o 1º campo não for numérico.
const CABECALHO = /^(n[º°uú]|num|processo|protocolo)/i;

function limparNumeroProcesso(campo: string): string {
  // Nº de processo costuma vir formatado ("912.345.678", "912345678-0").
  return campo.replace(/[.\s/-]/g, '');
}

function separadorDa(linha: string): string {
  if (linha.includes(';')) return ';';
  if (linha.includes('\t')) return '\t';
  return ',';
}

export function parsearImportacao(texto: string): ResultadoParse {
  const marcas: LinhaImportada[] = [];
  const erros: ErroLinha[] = [];
  // Processo → linha em que apareceu, para acusar duplicata dentro do arquivo.
  const vistos = new Map<string, number>();

  // U+FEFF: BOM de arquivos .csv salvos pelo Excel.
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/);
  let primeiraNaoVazia = true;

  linhas.forEach((bruta, i) => {
    const linha = bruta.trim();
    if (!linha) return;

    const numero = i + 1;
    const ehPrimeira = primeiraNaoVazia;
    primeiraNaoVazia = false;

    const sep = separadorDa(linha);
    // Campos vazios no fim (ex: "912345678;;") não mudam o formato da linha.
    const campos = linha.split(sep).map((c) => c.trim());
    while (campos.length > 1 && campos[campos.length - 1] === '') campos.pop();

    const processo = limparNumeroProcesso(campos[0]);
    if (!/^\d{6,12}$/.test(processo)) {
      if (ehPrimeira && CABECALHO.test(campos[0])) return; // cabeçalho, ignora
      erros.push({
        linha: numero,
        conteudo: linha,
        motivo: 'Nº de processo deve ter apenas dígitos (6 a 12)',
      });
      return;
    }

    const duplicataDe = vistos.get(processo);
    if (duplicataDe !== undefined) {
      erros.push({
        linha: numero,
        conteudo: linha,
        motivo: `Processo repetido (já apareceu na linha ${duplicataDe})`,
      });
      return;
    }

    let nome: string | null = null;
    let classeNcl: string | null = null;

    if (campos.length >= 3) {
      // Último campo é a classe NCL; o nome pode conter o próprio separador
      // (ex: "CAFÉ, PÃO & CIA"), então junta tudo entre o nº e a classe.
      const classe = campos[campos.length - 1];
      if (!/^\d{1,2}$/.test(classe) || Number(classe) < 1 || Number(classe) > 45) {
        erros.push({
          linha: numero,
          conteudo: linha,
          motivo: 'Classe NCL deve ser um número de 1 a 45',
        });
        return;
      }
      classeNcl = classe;
      nome = campos.slice(1, -1).join(sep === '\t' ? ' ' : `${sep} `).trim();
    } else if (campos.length === 2) {
      nome = campos[1];
    }

    if (nome !== null && nome.length < 2) {
      erros.push({
        linha: numero,
        conteudo: linha,
        motivo: 'Nome da marca deve ter no mínimo 2 caracteres',
      });
      return;
    }

    vistos.set(processo, numero);
    marcas.push({ processo, nome, classeNcl });
  });

  return { marcas, erros };
}
