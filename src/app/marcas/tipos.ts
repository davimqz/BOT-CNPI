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
  /** Data de publicação do pedido (despacho IPAS009/IPAS756) — null se ainda não capturada. */
  prioridade: string | null;
  /** Número da edição da RPI da última movimentação capturada — null se nenhuma ainda. */
  rpiAtual: number | null;
}
