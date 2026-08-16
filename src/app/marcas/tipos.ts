// Tipos compartilhados entre a listagem (Acompanhar Processo), o formulário de
// cadastro/edição e a página de detalhe — um único lugar para não divergir.

export interface Cliente {
  id: string;
  nome: string;
}

export interface Marca {
  id: string;
  nome: string;
  processo: string | null;
  classeNcl: string | null;
  tipoBusca: 'radical' | 'exata' | 'processo';
  fonteDados: 'rpi' | 'scraping';
  clienteId: string | null;
  cliente: Cliente | null;
  eventosAlerta: string[];
  ativa: boolean;
  similaridadeAtiva: boolean;
  similaridadeThreshold: number | null;
}
