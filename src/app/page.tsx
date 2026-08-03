import Link from 'next/link';
import { LogoutButton } from './logout-button';

/**
 * Navegação do sistema. O emoji é rótulo visual, não decoração: ele precisa ser
 * distinguível de relance dos vizinhos, senão vira ruído com cara de ícone.
 */
const FUNCIONALIDADES = [
  {
    href: '/revistas',
    emoji: '📚',
    nome: 'Revistas INPI',
    descricao: 'Edições da RPI desde janeiro de 2026, com download',
  },
  {
    href: '/historico',
    emoji: '🗂️',
    nome: 'Histórico RPI',
    descricao: 'Despachos das edições já processadas',
  },
  {
    href: '/busca',
    emoji: '🔍',
    nome: 'Consulta ao pePI',
    descricao: 'Busca ao vivo na base de marcas do INPI',
  },
  {
    href: '/marcas',
    emoji: '🏷️',
    nome: 'Marcas monitoradas',
    descricao: 'Cadastro das marcas acompanhadas a cada edição',
  },
  {
    href: '/prazos',
    emoji: '⏰',
    nome: 'Prazos INPI',
    descricao: 'Prazos legais abertos pelos despachos',
  },
  {
    href: '/configuracoes',
    emoji: '🔔',
    nome: 'Configurações de Alertas',
    descricao: 'Por onde o sistema avisa quando detecta movimentação',
  },
] as const;

export default function Home() {
  return (
    // Empilha no celular e vira duas colunas a partir do md: uma barra lateral
    // fixa numa tela estreita comeria a largura útil do conteúdo.
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6 md:flex-row">
      <aside className="w-full shrink-0 md:w-64">
        <nav className="flex flex-col gap-1">
          {FUNCIONALIDADES.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="flex items-start gap-3 rounded px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/10"
            >
              <span aria-hidden className="text-lg leading-6">
                {f.emoji}
              </span>
              <span>
                <span className="block font-medium leading-6">{f.nome}</span>
                <span className="block text-xs opacity-70">{f.descricao}</span>
              </span>
            </Link>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="mb-6 flex items-center justify-between gap-4 border-b border-black/10 pb-4 dark:border-white/15">
          <h1 className="text-2xl font-semibold">Monitor de Marcas — INPI</h1>
          <LogoutButton />
        </header>
        <p className="max-w-2xl text-sm opacity-80">
          Monitoramento das marcas depositadas no INPI: a RPI é lida toda terça, os despachos das
          suas marcas viram prazo com data calculada, e o alerta sai pelos canais ligados em
          Configurações. Escolha uma funcionalidade ao lado.
        </p>
      </main>
    </div>
  );
}
