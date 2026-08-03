export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Monitor de Marcas — INPI</h1>
      </header>
      <p className="max-w-2xl text-sm opacity-80">
        Monitoramento das marcas depositadas no INPI: a RPI é lida toda terça, os despachos das suas
        marcas viram prazo com data calculada, e o alerta sai pelos canais ligados em Alertas.
        Escolha uma funcionalidade no menu lateral.
      </p>
    </div>
  );
}
