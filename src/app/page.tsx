import { LogoutButton } from './logout-button';

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Monitor de Marcas — INPI</h1>
        <LogoutButton />
      </header>
      <section className="space-y-2 text-sm opacity-80">
        <p>Fundação do projeto (Fase 0) concluída. Próximos módulos, na ordem do TASKS.md:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>Fase 1 — Histórico RPI (ingestão semanal da revista)</li>
          <li>Fase 2 — Consulta manual ao pePI + relatório Consultor de Marca</li>
          <li>Fase 3 — Cadastro e monitoramento de marcas</li>
        </ul>
      </section>
    </main>
  );
}
