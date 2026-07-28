// Validação do payload de marca monitorada, compartilhada entre POST (criação,
// payload completo) e PATCH (edição, payload parcial — só os campos presentes).

export interface DadosMarca {
  nome?: string;
  processo?: string | null;
  classeNcl?: string | null;
  tipoBusca?: 'radical' | 'exata';
  fonteDados?: 'rpi' | 'scraping';
  clienteId?: string | null;
  ativa?: boolean;
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

  if (presente('ativa')) {
    if (typeof body.ativa !== 'boolean') return { erro: 'ativa deve ser true/false' };
    dados.ativa = body.ativa;
  }

  return { dados };
}
