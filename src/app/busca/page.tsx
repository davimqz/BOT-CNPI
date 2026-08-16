import Image from 'next/image';
import Link from 'next/link';

/**
 * Seletor de tipo de busca — réplica visual da tela "Pesquisa em Propriedade
 * Industrial" do pePI (busca.inpi.gov.br/pePI), a que aparece depois do login
 * anônimo. Grid fixo 2x4, mesma ordem do original.
 *
 * Os 8 ícones em `public/pepi-icones/` são recortes do print da tela real
 * (fornecido pelo usuário em 16/08/2026), não desenhos refeitos — é a única
 * forma de garantir fidelidade pixel a pixel sem acesso à tela ao vivo (ela
 * fica atrás de login/sessão anônima do pePI, que WebFetch não consegue
 * simular). O fundo cinza-claro do cartão usa a cor amostrada do mesmo print
 * (#e4e5ea) para o recorte de cada ícone colar sem borda visível — por isso
 * NÃO segue o tema claro/escuro do app: é fac-símile de uma tela de
 * terceiro, não um componente novo do design system daqui.
 *
 * Só "Marca" tem funcionalidade implementada (`/busca/marca`, Fase 2). Os
 * outros sete tipos de propriedade industrial estão fora do escopo desta
 * primeira versão (CLAUDE.md Seção 1) — ficam visíveis, fiéis ao original,
 * mas desabilitados.
 */

interface BoxPI {
  nome: string;
  imagem: string;
  href?: string;
}

const BOXES: BoxPI[] = [
  { nome: 'Marca', imagem: '/pepi-icones/marca.png', href: '/busca/marca' },
  { nome: 'Patente', imagem: '/pepi-icones/patente.png' },
  { nome: 'Desenho Industrial', imagem: '/pepi-icones/desenho-industrial.png' },
  { nome: 'Indicação Geográfica', imagem: '/pepi-icones/indicacao-geografica.png' },
  { nome: 'Programa de Computador', imagem: '/pepi-icones/programa-computador.png' },
  { nome: 'Topografia de Circuito Integrado', imagem: '/pepi-icones/topografia-circuito.png' },
  { nome: 'Transferência de Tecnologia', imagem: '/pepi-icones/transferencia-tecnologia.png' },
  { nome: 'Informação Tecnológica de Patentes', imagem: '/pepi-icones/informacao-tecnologica.png' },
];

export default function BuscaSeletorPage() {
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Pesquisa da Propriedade Industrial</h1>
        <p className="mt-2 max-w-2xl text-sm opacity-70">
          Escolha o tipo de busca, como na tela de seleção do pePI. Hoje só{' '}
          <strong className="font-medium opacity-100">Marca</strong> está implementada — os demais
          tipos são fase futura do roadmap.
        </p>
      </header>

      <div className="rounded-lg p-6 sm:p-8" style={{ backgroundColor: '#e4e5ea' }}>
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
          {BOXES.map(({ nome, imagem, href }) => {
            const conteudo = (
              <>
                <Image src={imagem} alt="" width={64} height={64} className="size-16 shrink-0" />
                <span className="text-[15px] leading-tight font-bold" style={{ color: '#1b3f72' }}>
                  {nome}
                </span>
              </>
            );

            if (href) {
              return (
                <Link
                  key={nome}
                  href={href}
                  className="flex items-center gap-4 rounded-md p-1 transition-opacity hover:opacity-80"
                >
                  {conteudo}
                </Link>
              );
            }

            return (
              <div
                key={nome}
                className="flex cursor-not-allowed items-center gap-4 p-1 opacity-60"
                title="Em breve — fase futura do roadmap."
              >
                {conteudo}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
