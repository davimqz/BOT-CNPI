import type { SVGProps } from 'react';

/**
 * Ícones próprios do sistema, desenhados para estas funcionalidades.
 *
 * São uma família, não uma coleção: mesma grade de 24, mesmo traço de 1.5,
 * `currentColor`, pontas arredondadas e nenhum preenchimento. Ícone que foge de
 * um desses parâmetros salta aos olhos ao lado dos outros mesmo quando o desenho
 * está certo — é o que faz um menu parecer remendado.
 *
 * `aria-hidden` fixo: o rótulo de texto ao lado é quem nomeia o item para o
 * leitor de tela. Um ícone anunciado junto do próprio rótulo lê tudo duas vezes.
 */
type IconeProps = Omit<SVGProps<SVGSVGElement>, 'children'>;

function Base({ children, ...props }: IconeProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Revistas INPI — pilha de edições, a da frente aberta. */
export function IconeRevistas(props: IconeProps) {
  return (
    <Base {...props}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 14.5Z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5Z" />
      <path d="M12 18v2" />
    </Base>
  );
}

/** Histórico RPI — registro em linhas, com a marcação de busca. */
export function IconeHistorico(props: IconeProps) {
  return (
    <Base {...props}>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h7.7a1.5 1.5 0 0 1 1.06.44l3.3 3.3A1.5 1.5 0 0 1 19 7.8V19.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5Z" />
      <path d="M14 3v4.5h4.5" />
      <path d="M8.5 12h7" />
      <path d="M8.5 15.5h7" />
      <path d="M8.5 18h4" />
    </Base>
  );
}

/** Consulta ao pePI — lupa sobre o registro, a busca ao vivo. */
export function IconeConsulta(props: IconeProps) {
  return (
    <Base {...props}>
      <circle cx="11" cy="11" r="6.25" />
      <path d="m15.6 15.6 4.15 4.15" />
      <path d="M8.75 11h4.5" />
      <path d="M11 8.75v4.5" />
    </Base>
  );
}

/** Marcas monitoradas — etiqueta de marca registrada. */
export function IconeMarcas(props: IconeProps) {
  return (
    <Base {...props}>
      <path d="M3.5 11.4V5.2A1.7 1.7 0 0 1 5.2 3.5h6.2a2 2 0 0 1 1.42.59l7.1 7.1a2 2 0 0 1 0 2.83l-6.2 6.2a2 2 0 0 1-2.83 0l-7.1-7.1a2 2 0 0 1-.59-1.42Z" />
      <circle cx="8" cy="8" r="1.35" />
    </Base>
  );
}

/** Prazos INPI — relógio com o ponteiro na contagem. */
export function IconePrazos(props: IconeProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="13" r="7.75" />
      <path d="M12 9.25V13l2.6 1.8" />
      <path d="M9.5 2.75h5" />
      <path d="M12 2.75v2.5" />
    </Base>
  );
}

/** Configurações de Alertas — sino do aviso, com o badge de ajuste. */
export function IconeAlertas(props: IconeProps) {
  return (
    <Base {...props}>
      <path d="M6.5 10a5.5 5.5 0 0 1 8.2-4.78" />
      <path d="M17.5 10.9V13c0 1.5.4 2.6 1.2 3.6.4.5 0 1.4-.7 1.4H6c-.7 0-1.1-.9-.7-1.4.8-1 1.2-2.1 1.2-3.6v-2" />
      <path d="M10.2 20.5a2.1 2.1 0 0 0 3.6 0" />
      <circle cx="18" cy="6" r="2.5" />
    </Base>
  );
}

/** Colidências — dois nomes de marca se sobrepondo (a mesma comparação da skill fonética). */
export function IconeColidencia(props: IconeProps) {
  return (
    <Base {...props}>
      <circle cx="9.5" cy="12" r="6.25" />
      <circle cx="14.5" cy="12" r="6.25" />
    </Base>
  );
}

/** Patentes — lâmpada da invenção, com o filamento aceso. */
export function IconePatentes(props: IconeProps) {
  return (
    <Base {...props}>
      <path d="M8.25 9.75a3.75 3.75 0 1 1 7.5 0c0 1.6-.85 2.5-1.6 3.3-.6.65-1.15 1.25-1.15 2.2h-2c0-.95-.55-1.55-1.15-2.2-.75-.8-1.6-1.7-1.6-3.3Z" />
      <path d="M10.5 18.5h3" />
      <path d="M11 21h2" />
      <path d="M12 3v1.5" />
    </Base>
  );
}

/** Desenho Industrial — prancheta de projeto com o traço da forma registrada. */
export function IconeDesenhoIndustrial(props: IconeProps) {
  return (
    <Base {...props}>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5Z" />
      <path d="M8.25 15.5 11 9l2 3.5 1.25-2 1.5 3" />
    </Base>
  );
}
