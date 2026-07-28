// Validação do payload de marca monitorada, compartilhada entre POST (criação,
// payload completo) e PATCH (edição, payload parcial — só os campos presentes).

import { eventoPorSlug } from './eventos-alerta';

export interface DadosMarca {
  nome?: string;
  processo?: string | null;
  classeNcl?: string | null;
  tipoBusca?: 'radical' | 'exata';
  fonteDados?: 'rpi' | 'scraping';
  clienteId?: string | null;
  eventosAlerta?: string[];
  ativa?: boolean;
  similaridadeAtiva?: boolean;
  similaridadeThreshold?: number | null;
}

export function validarMarca(
  body: Record<string, unknown>,
  opts: { parcial: boolean },
): { erro: string } | { dados: DadosMarca } {
  const dados: DadosMarca = {};
  const presente = (campo: string) => campo in body;

  if (!opts.parcial || presente('nome')) {
    const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
    if (nome.length < 2) return { erro: 'Informe o nome da marca (mínimo 2 caracteres)' };
    dados.nome = nome;
  }

  if (!opts.parcial || presente('processo')) {
    const processo = typeof body.processo === 'string' ? body.processo.trim() : '';
    if (processo && !/^\d{6,12}$/.test(processo)) {
      return { erro: 'Nº de processo deve ter apenas dígitos (6 a 12)' };
    }
    dados.processo = processo || null;
  }

  if (!opts.parcial || presente('classeNcl')) {
    const classe = typeof body.classeNcl === 'string' ? body.classeNcl.trim() : '';
    if (classe && (!/^\d{1,2}$/.test(classe) || Number(classe) < 1 || Number(classe) > 45)) {
      return { erro: 'Classe NCL deve ser um número de 1 a 45' };
    }
    dados.classeNcl = classe || null;
  }

  if (!opts.parcial || presente('tipoBusca')) {
    if (body.tipoBusca !== 'radical' && body.tipoBusca !== 'exata') {
      return { erro: 'tipoBusca deve ser "radical" ou "exata"' };
    }
    dados.tipoBusca = body.tipoBusca;
  }

  if (!opts.parcial || presente('fonteDados')) {
    if (body.fonteDados !== 'rpi' && body.fonteDados !== 'scraping') {
      return { erro: 'fonteDados deve ser "rpi" ou "scraping"' };
    }
    dados.fonteDados = body.fonteDados;
  }

  if (presente('clienteId')) {
    const clienteId = typeof body.clienteId === 'string' ? body.clienteId.trim() : '';
    dados.clienteId = clienteId || null;
  }

  if (presente('eventosAlerta')) {
    const lista = body.eventosAlerta;
    if (!Array.isArray(lista) || lista.some((e) => typeof e !== 'string')) {
      return { erro: 'eventosAlerta deve ser uma lista de eventos' };
    }
    const slugs = [...new Set(lista as string[])];
    const invalido = slugs.find((s) => !eventoPorSlug(s));
    if (invalido) return { erro: `Evento de alerta desconhecido: "${invalido}"` };
    // Lista vazia é válida e significa "todos os eventos" (padrão).
    dados.eventosAlerta = slugs;
  }

  if (presente('ativa')) {
    if (typeof body.ativa !== 'boolean') return { erro: 'ativa deve ser true/false' };
    dados.ativa = body.ativa;
  }

  if (presente('similaridadeAtiva')) {
    if (typeof body.similaridadeAtiva !== 'boolean') {
      return { erro: 'similaridadeAtiva deve ser true/false' };
    }
    dados.similaridadeAtiva = body.similaridadeAtiva;
  }

  // Percentual por marca (Fase 4): 65/80/90 são os presets da skill, mas o campo
  // é livre porque o próprio software de referência aceita valor customizado.
  // Nulo = usar o padrão de src/lib/similaridade.ts.
  if (presente('similaridadeThreshold')) {
    const valor = body.similaridadeThreshold;
    if (valor === null || valor === '') {
      dados.similaridadeThreshold = null;
    } else {
      const numero = typeof valor === 'string' ? Number(valor) : valor;
      if (typeof numero !== 'number' || !Number.isFinite(numero) || numero < 50 || numero > 100) {
        return { erro: 'Threshold de similaridade deve ser um número de 50 a 100' };
      }
      dados.similaridadeThreshold = Math.round(numero);
    }
  }

  return { dados };
}
