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
      </nav>
      <section className="space-y-2 text-sm opacity-80">
        <p>Próximos módulos, na ordem do TASKS.md:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>Fase 3 — Eventos de alerta, importação em lote e job de verificação</li>
          <li>Fase 4 — Motor de similaridade fonética</li>
        </ul>
      </section>
    </main>
  );
}
