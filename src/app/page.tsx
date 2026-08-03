import Link from 'next/link';
import { LogoutButton } from './logout-button';

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Monitor de Marcas — INPI</h1>
        <LogoutButton />
      </header>
      <nav className="mb-8 flex flex-wrap gap-4">
        <Link
          href="/revistas"
          className="inline-block rounded border border-black/15 px-4 py-3 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          <span className="block font-medium">Revistas INPI</span>
          <span className="block text-sm opacity-70">
            Todas as edições desde janeiro de 2026, com download
          </span>
        </Link>
        <Link
          href="/historico"
          className="inline-block rounded border border-black/15 px-4 py-3 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          <span className="block font-medium">Histórico RPI</span>
          <span className="block text-sm opacity-70">
            Despachos das edições semanais já processadas
          </span>
        </Link>
        <Link
          href="/busca"
          className="inline-block rounded border border-black/15 px-4 py-3 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          <span className="block font-medium">Consulta ao pePI</span>
          <span className="block text-sm opacity-70">
            Busca ao vivo na base de marcas do INPI (Radical/Exata)
          </span>
        </Link>
        <Link
          href="/marcas"
          className="inline-block rounded border border-black/15 px-4 py-3 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          <span className="block font-medium">Marcas monitoradas</span>
          <span className="block text-sm opacity-70">
            Cadastro das marcas acompanhadas a cada edição da RPI
          </span>
        </Link>
        <Link
          href="/prazos"
          className="inline-block rounded border border-black/15 px-4 py-3 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          <span className="block font-medium">Prazos INPI</span>
          <span className="block text-sm opacity-70">
            Prazos legais abertos pelos despachos das marcas monitoradas
          </span>
        </Link>
        <Link
          href="/configuracoes"
          className="inline-block rounded border border-black/15 px-4 py-3 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          <span className="block font-medium">Configurações de Alertas</span>
          <span className="block text-sm opacity-70">
            Por onde o sistema avisa quando detecta movimentação
          </span>
        </Link>
      </nav>
      <section className="space-y-2 text-sm opacity-80">
        <p>Próximos módulos, na ordem do TASKS.md:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>Fase 6 — WhatsApp pela Cloud API da Meta (depende de aprovação externa)</li>
          <li>Fase 9 — Deploy no Vercel e validação em paralelo com a RPI real</li>
        </ul>
      </section>
    </main>
  );
}
