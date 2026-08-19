'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

// Tela de consulta manual ao pePI (Fase 2). A busca roda no GitHub Actions
// (nunca no Vercel — CLAUDE.md Seção 3.1): o POST cria o job e dispara o
// workflow; aqui fazemos polling do status até o resultado aparecer, sempre
// mostrando a etapa atual para o usuário nunca ficar sem feedback.
//
// O formulário replica as 3 abas da tela real "Marca" do pePI — Pesquisa
// Básica (nº processo/GRU/protocolo/inscrição internacional), Marca
// (radical/exata + classe NCL) e Titular (nome ou CPF/CNPJ) — cada uma com
// seus próprios campos, para não misturar estado entre buscas de tipos
// diferentes. O dropdown "Nº de Processos por página" (20-100) que existe
// nas telas reais foi omitido de propósito: o worker sempre pede 100/página
// e agrega todas as páginas antes de exibir (ver search.ts) — não há
// paginação de tela aqui, então o controle não teria efeito nenhum.

const POLL_MS = 3000;
const TIMEOUT_MS = 8 * 60 * 1000;

// Explicações de cada campo, no mesmo texto das telas reais do pePI — exibidas
// no ícone de ajuda ao lado do rótulo (ver InfoTooltip), para o usuário não
// precisar adivinhar formato/exemplo de cada identificador.
const AJUDA_BASICA: Record<'processo' | 'gru' | 'protocolo' | 'inscricaoInternacional', string> = {
  processo:
    'Número do pedido de registro de marca, atribuído ao depositante no momento do depósito. Tem 9 dígitos. Exemplos: "816527385", "904155196".',
  gru:
    'Número da Guia de Recolhimento da União (GRU) usada para pagar o serviço administrativo. Tem 17 dígitos. Exemplo: "00000231109316994".',
  protocolo:
    'Número dado à petição protocolada. Tem 12 dígitos. Exemplo: "850110006566".',
  inscricaoInternacional:
    'Composto por até 7 números, podendo ter letras ao final. Exemplos: "1356494", "1475235A".',
};

const AJUDA_MARCA = {
  marca:
    'Informe a marca que deseja consultar. Na busca Exata, os resultados trazem as marcas publicadas que contêm exatamente o termo digitado. Na busca Radical, o sistema procura pelo radical — por exemplo, o radical "ter" encontra marcas como "Internacional" e "Internet". A busca radical só aceita termos com três ou mais caracteres; para termos menores, use a busca Exata. Caracteres especiais (como "!") não são considerados, e letras acentuadas são tratadas como se não tivessem acento, com exceção do "Ç". Máximo de 40 caracteres.',
  ncl:
    'Código da Classificação de Nice. Informar a classe deixa o resultado da busca mais preciso e mais rápido.',
};

const AJUDA_TITULAR: Record<'nome' | 'cpfCnpj', string> = {
  nome:
    'Nome da pessoa física ou jurídica titular da marca. Aceita os operadores booleanos AND, OR e NOT, além do coringa "*". Exemplos: "União AND Mercantil", "Mercant*".',
  cpfCnpj:
    'CNPJ da pessoa jurídica ou CPF da pessoa física titular da marca. Pessoa física pode requerer o registro de marca desde que comprove, por documento do órgão competente, a atividade exercida. Exemplo: "61095048000115".',
};

// Círculo com "?" ao lado do rótulo de um campo — mostra a explicação em um
// balão ao passar o mouse ou focar via teclado (acessível sem JS extra).
function InfoTooltip({ texto }: { texto: string }) {
  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={0}
        role="img"
        aria-label={texto}
        className="inline-flex h-4 w-4 shrink-0 cursor-help select-none items-center justify-center rounded-full border border-black/30 text-[10px] font-semibold leading-none opacity-60 hover:opacity-100 focus:opacity-100 focus:outline-none dark:border-white/40"
      >
        ?
      </span>
      <span
        className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 w-64 -translate-x-1/2 rounded border border-black/10 bg-background p-2 text-xs font-normal normal-case leading-snug text-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:border-white/15"
      >
        {texto}
      </span>
    </span>
  );
}

type Aba = 'basica' | 'marca' | 'titular';
type TipoBusca = 'radical' | 'exata' | 'processo' | 'titular';

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'basica', rotulo: 'Pesquisa Básica' },
  { id: 'marca', rotulo: 'Marca' },
  { id: 'titular', rotulo: 'Titular' },
];

interface ItemResultado {
  processo: string;
  prioridade: string | null;
  marca: string | null;
  situacao: string | null;
  titular: string | null;
  classe: string | null;
  codPedido: string | null;
}

interface Resultado {
  total: number;
  paginas?: number;
  truncado?: boolean;
  itens?: ItemResultado[];
  /** Busca por titular que casou com vários nomes: o usuário escolhe um da lista. */
  tipoResultado?: 'titulares';
  titulares?: string[];
  /** Busca por titular resolvida: nome do titular cujos processos estão em `itens`. */
  titular?: string;
  /** Nº de cadastros do mesmo nome na base do INPI somados em `itens` (quando > 1). */
  cadastrosTitular?: number;
}

interface JobStatus {
  jobId: string;
  status: 'pendente' | 'executando' | 'sucesso' | 'erro';
  etapa: string | null;
  resultado: Resultado | null;
  erro: string | null;
}

export default function BuscaMarcaPage() {
  const [aba, setAba] = useState<Aba>('marca');

  // Campos independentes por aba — trocar de aba não perde o que foi digitado
  // nas outras, e cada aba só manda ao worker os campos que ela realmente tem.
  //
  // A Pesquisa Básica tem 4 campos visíveis (réplica da tela real), mas o pePI
  // só tem UM campo de busca ali (NumPedido — ver selectors.ts) que aceita
  // qualquer um dos 4 identificadores: preencher um desabilita os outros 3,
  // para não dar a entender que dá pra buscar por vários ao mesmo tempo.
  const CAMPOS_BASICA = [
    ['processo', 'Nº do Processo'],
    ['gru', 'Nº Guia de Recolhimento da União (GRU)'],
    ['protocolo', 'Nº do Protocolo'],
    ['inscricaoInternacional', 'Nº Inscrição Internacional'],
  ] as const;
  type CampoBasica = (typeof CAMPOS_BASICA)[number][0];
  const [valoresBasica, setValoresBasica] = useState<Record<CampoBasica, string>>({
    processo: '',
    gru: '',
    protocolo: '',
    inscricaoInternacional: '',
  });
  const campoBasicaAtivo = (Object.keys(valoresBasica) as CampoBasica[]).find(
    (c) => valoresBasica[c] !== '',
  );
  function alterarCampoBasica(campo: CampoBasica, valor: string) {
    setValoresBasica((prev) => ({ ...prev, [campo]: valor }));
  }
  const [termoMarca, setTermoMarca] = useState('');
  const [subTipoMarca, setSubTipoMarca] = useState<'radical' | 'exata'>('radical');
  const [classeNcl, setClasseNcl] = useState('');

  // Titular também é 1 campo só no pePI (interpretarTermoTitular decide nome vs
  // CPF/CNPJ pelo formato do valor) — mesmo padrão de "preencher um desabilita
  // o outro" da Pesquisa Básica, pra deixar explícito que é um OU outro.
  const CAMPOS_TITULAR = [
    ['nome', 'Nome / Razão Social'],
    ['cpfCnpj', 'CPF/CNPJ'],
  ] as const;
  type CampoTitular = (typeof CAMPOS_TITULAR)[number][0];
  const [valoresTitular, setValoresTitular] = useState<Record<CampoTitular, string>>({
    nome: '',
    cpfCnpj: '',
  });
  const campoTitularAtivo = (Object.keys(valoresTitular) as CampoTitular[]).find(
    (c) => valoresTitular[c] !== '',
  );
  function alterarCampoTitular(campo: CampoTitular, valor: string) {
    setValoresTitular((prev) => ({ ...prev, [campo]: valor }));
  }

  const [job, setJob] = useState<JobStatus | null>(null);
  // Tipo/termo que efetivamente geraram os resultados exibidos — não a aba
  // selecionada no momento, para o usuário poder trocar de aba sem que a
  // tabela de resultados (e as ações específicas de titular) mude de leitura.
  const [buscaAtual, setBuscaAtual] = useState<{ tipo: TipoBusca; termo: string } | null>(null);
  const porProcesso = buscaAtual?.tipo === 'processo';
  const porTitular = buscaAtual?.tipo === 'titular';
  const [buscando, setBuscando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  const cancelado = useRef(false);

  // Seleção em lote da busca por titular (Fase 3): quais processos do resultado
  // estão marcados e quais já constam no monitor (processo → ativa).
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [monitoradas, setMonitoradas] = useState<Map<string, boolean>>(new Map());
  const [loteMsg, setLoteMsg] = useState<string | null>(null);
  const [loteErro, setLoteErro] = useState<string | null>(null);
  const [salvandoLote, setSalvandoLote] = useState(false);

  useEffect(() => {
    return () => {
      cancelado.current = true;
    };
  }, []);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (aba === 'basica' && !campoBasicaAtivo) {
      setErroEnvio('Preencha um dos campos da Pesquisa Básica');
      return;
    }
    if (aba === 'titular' && !campoTitularAtivo) {
      setErroEnvio('Preencha Nome ou CPF/CNPJ');
      return;
    }
    const tipo: TipoBusca = aba === 'basica' ? 'processo' : aba === 'titular' ? 'titular' : subTipoMarca;
    const termoBusca = aba === 'basica'
      ? valoresBasica[campoBasicaAtivo!]
      : aba === 'titular'
        ? valoresTitular[campoTitularAtivo!]
        : termoMarca;
    await iniciarBusca(termoBusca, tipo);
  }

  // Também chamada ao escolher um titular na lista devolvida pela busca por
  // titular ambígua — dispara um novo job com o nome exato do titular.
  async function iniciarBusca(termoBusca: string, tipo: TipoBusca) {
    setErroEnvio(null);
    setJob(null);
    setBuscando(true);
    setSegundos(0);
    setSelecao(new Set());
    setMonitoradas(new Map());
    setLoteMsg(null);
    setLoteErro(null);
    setBuscaAtual({ tipo, termo: termoBusca });
    cancelado.current = false;

    try {
      const resp = await fetch('/api/busca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termo: termoBusca,
          tipoBusca: tipo,
          classeNcl: tipo === 'radical' || tipo === 'exata' ? classeNcl || undefined : undefined,
        }),
      });
      const data = (await resp.json()) as { jobId?: string; erro?: string };
      if (!resp.ok || !data.jobId) {
        setErroEnvio(data.erro ?? `Falha ao iniciar a busca (HTTP ${resp.status})`);
        setBuscando(false);
        return;
      }

      const inicio = Date.now();
      while (!cancelado.current && Date.now() - inicio < TIMEOUT_MS) {
        const st = await fetch(`/api/busca/${data.jobId}`);
        if (st.ok) {
          const s = (await st.json()) as JobStatus;
          setJob(s);
          if (s.status === 'sucesso' || s.status === 'erro') {
            setBuscando(false);
            if (tipo === 'titular' && s.resultado?.itens?.length) {
              void carregarMonitoradas(s.resultado.itens.map((i) => i.processo));
            }
            return;
          }
        }
        setSegundos(Math.round((Date.now() - inicio) / 1000));
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      if (!cancelado.current) {
        setErroEnvio(
          'A busca demorou mais que o esperado. Confira a aba Actions do repositório — o resultado pode ainda aparecer.',
        );
        setBuscando(false);
      }
    } catch {
      setErroEnvio('Erro de rede ao iniciar a busca');
      setBuscando(false);
    }
  }

  // Consulta quais dos processos listados já estão no monitor, para marcar as
  // linhas e deixar claro o que "adicionar"/"remover" vai fazer de fato.
  async function carregarMonitoradas(processos: string[]) {
    try {
      const resp = await fetch(`/api/marcas/lote?processos=${processos.join(',')}`);
      if (!resp.ok) return;
      const data = (await resp.json()) as { monitoradas: { processo: string; ativa: boolean }[] };
      setMonitoradas(new Map(data.monitoradas.map((m) => [m.processo, m.ativa])));
    } catch {
      // Status de monitoramento é informativo — a busca em si já deu certo.
    }
  }

  function alternarSelecao(processo: string) {
    setSelecao((prev) => {
      const nova = new Set(prev);
      if (nova.has(processo)) {
        nova.delete(processo);
      } else {
        nova.add(processo);
      }
      return nova;
    });
  }

  async function executarLote(acao: 'adicionar' | 'remover') {
    const itens = (job?.resultado?.itens ?? []).filter((i) => selecao.has(i.processo));
    if (itens.length === 0) return;
    setSalvandoLote(true);
    setLoteMsg(null);
    setLoteErro(null);
    try {
      const resp = await fetch('/api/marcas/lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao,
          itens: itens.map((i) => ({ processo: i.processo, marca: i.marca, classe: i.classe })),
        }),
      });
      const data = (await resp.json()) as {
        erro?: string;
        adicionadas?: number;
        jaMonitoradas?: number;
        removidas?: number;
        desativadas?: number;
        naoMonitoradas?: number;
      };
      if (!resp.ok) {
        setLoteErro(data.erro ?? `Falha na ação em lote (HTTP ${resp.status})`);
        return;
      }
      const partes: string[] = [];
      if (acao === 'adicionar') {
        partes.push(`${data.adicionadas ?? 0} processo(s) adicionado(s) ao monitor`);
        if (data.jaMonitoradas) partes.push(`${data.jaMonitoradas} já estava(m) monitorado(s)`);
      } else {
        partes.push(`${data.removidas ?? 0} processo(s) removido(s) do monitor`);
        if (data.desativadas) {
          partes.push(`${data.desativadas} desativado(s) por terem despachos no histórico`);
        }
        if (data.naoMonitoradas) partes.push(`${data.naoMonitoradas} não estava(m) no monitor`);
      }
      setLoteMsg(`${partes.join('; ')}.`);
      setSelecao(new Set());
      await carregarMonitoradas((job?.resultado?.itens ?? []).map((i) => i.processo));
    } catch {
      setLoteErro('Erro de rede na ação em lote');
    } finally {
      setSalvandoLote(false);
    }
  }

  const resultado = job?.status === 'sucesso' ? job.resultado : null;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-6">
      <header className="mb-6">
        <Link href="/busca" className="mb-2 inline-block text-sm opacity-60 hover:underline">
          ← Pesquisa da Propriedade Industrial
        </Link>
        <h1 className="text-2xl font-semibold">Consulta ao pePI — Marca</h1>
      </header>

      <p className="mb-6 max-w-3xl text-sm opacity-70">
        Busca ao vivo na base de marcas do INPI. A consulta roda em um worker remoto e leva de
        alguns segundos a ~2 minutos (fila do runner + navegação no site do INPI).
      </p>

      <div className="mb-4 flex gap-1 border-b border-black/10 text-sm dark:border-white/15">
        {ABAS.map(({ id, rotulo }) => (
          <button
            key={id}
            type="button"
            disabled={buscando}
            onClick={() => setAba(id)}
            className={`-mb-px rounded-t border-b-2 px-4 py-2 font-medium disabled:opacity-50 ${
              aba === id
                ? 'border-foreground opacity-100'
                : 'border-transparent opacity-60 hover:opacity-90'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <form onSubmit={buscar} className="mb-6 flex flex-wrap items-end gap-3 text-sm">
        {aba === 'basica' && (
          <div className="w-full max-w-md">
            {CAMPOS_BASICA.map(([campo, rotulo], indice) => (
              <div key={campo}>
                {indice > 0 && (
                  <div className="my-1 flex items-center gap-3 text-xs font-medium uppercase opacity-50">
                    <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
                    ou
                    <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
                  </div>
                )}
                <label className="block">
                  <span className="mb-1 flex items-center gap-1.5 opacity-70">
                    {rotulo}
                    <InfoTooltip texto={AJUDA_BASICA[campo]} />
                  </span>
                  <input
                    value={valoresBasica[campo]}
                    onChange={(e) => alterarCampoBasica(campo, e.target.value)}
                    placeholder="só dígitos"
                    minLength={2}
                    disabled={buscando || (campoBasicaAtivo !== undefined && campoBasicaAtivo !== campo)}
                    title="Preencha apenas um destes 4 campos por busca"
                    className="w-full rounded border border-black/20 bg-transparent px-2 py-1.5 disabled:opacity-40 dark:border-white/20"
                  />
                </label>
              </div>
            ))}
            <button
              type="submit"
              disabled={buscando}
              className="mt-4 w-full rounded bg-foreground px-4 py-1.5 font-medium text-background disabled:opacity-50"
            >
              {buscando ? 'Consultando…' : 'Consultar INPI'}
            </button>
          </div>
        )}

        {aba === 'marca' && (
          <>
            <fieldset className="block" disabled={buscando}>
              <span className="mb-1 block opacity-70">Tipo de busca</span>
              <div className="flex gap-3 rounded border border-black/20 px-3 py-1.5 dark:border-white/20">
                {(
                  [
                    ['radical', 'Radical'],
                    ['exata', 'Exata'],
                  ] as const
                ).map(([t, rotulo]) => (
                  <label key={t} className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name="subTipoMarca"
                      checked={subTipoMarca === t}
                      onChange={() => setSubTipoMarca(t)}
                    />
                    {rotulo}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block flex-1 basis-52">
              <span className="mb-1 flex items-center gap-1.5 opacity-70">
                Marca
                <InfoTooltip texto={AJUDA_MARCA.marca} />
              </span>
              <input
                value={termoMarca}
                onChange={(e) => setTermoMarca(e.target.value)}
                placeholder="ex: NATURA"
                required
                minLength={2}
                disabled={buscando}
                className="w-full rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20"
              />
            </label>
            <label className="block w-32">
              <span className="mb-1 flex items-center gap-1.5 opacity-70">
                Classificação Nice - NCL
                <InfoTooltip texto={AJUDA_MARCA.ncl} />
              </span>
              <input
                value={classeNcl}
                onChange={(e) => setClasseNcl(e.target.value)}
                placeholder="opcional"
                pattern="\d{1,2}"
                disabled={buscando}
                className="w-full rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/20"
              />
            </label>
          </>
        )}

        {aba === 'titular' && (
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            {CAMPOS_TITULAR.map(([campo, rotulo]) => (
              <label key={campo} className="block">
                <span className="mb-1 flex items-center gap-1.5 opacity-70">
                  {rotulo}
                  <InfoTooltip texto={AJUDA_TITULAR[campo]} />
                </span>
                <input
                  value={valoresTitular[campo]}
                  onChange={(e) => alterarCampoTitular(campo, e.target.value)}
                  placeholder={campo === 'nome' ? 'ex: NATURA COSMÉTICOS S/A' : 'ex: 71.673.990/0001-77'}
                  minLength={2}
                  disabled={buscando || (campoTitularAtivo !== undefined && campoTitularAtivo !== campo)}
                  title="Preencha apenas um destes 2 campos por busca"
                  className="w-full rounded border border-black/20 bg-transparent px-2 py-1.5 disabled:opacity-40 dark:border-white/20"
                />
              </label>
            ))}
          </div>
        )}

        {aba !== 'basica' && (
          <button
            type="submit"
            disabled={buscando}
            className="rounded bg-foreground px-4 py-1.5 font-medium text-background disabled:opacity-50"
          >
            {buscando ? 'Consultando…' : 'Consultar INPI'}
          </button>
        )}
      </form>

      {erroEnvio && (
        <p className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {erroEnvio}
        </p>
      )}

      {buscando && (
        <div className="mb-4 rounded border border-black/10 px-4 py-3 text-sm dark:border-white/15">
          <p className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-amber-500" />
            Consultando o INPI… {segundos > 0 && <span className="opacity-60">({segundos}s)</span>}
          </p>
          <p className="mt-1 pl-5 font-mono text-xs opacity-70">
            {job?.etapa ?? 'aguardando o worker iniciar (fila do GitHub Actions)'}
          </p>
        </div>
      )}

      {job?.status === 'erro' && (
        <p className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          A busca falhou no worker: {job.erro ?? 'erro desconhecido'}
        </p>
      )}

      {resultado?.tipoResultado === 'titulares' && (
        <div className="mb-4">
          <p className="mb-3 text-sm opacity-70">
            {resultado.total === 0 ? (
              <>
                Nenhum titular encontrado com esse termo. Atenção: a busca do INPI diferencia
                acentos (COSMÉTICOS ≠ COSMETICOS) — tente um pedaço do nome sem palavras
                acentuadas, ou o CPF/CNPJ.
              </>
            ) : (
              <>
                {resultado.total.toLocaleString('pt-BR')} titular(es) contêm o termo — escolha um
                para listar os processos dele.
                {resultado.truncado && (
                  <span className="ml-2 text-amber-600 dark:text-amber-400">
                    Lista truncada — há mais titulares do que o limite; refine o termo.
                  </span>
                )}
              </>
            )}
          </p>
          {resultado.total > 0 && (
          <ul className="max-h-96 divide-y divide-black/5 overflow-y-auto rounded border border-black/10 text-sm dark:divide-white/10 dark:border-white/15">
            {(resultado.titulares ?? []).map((nome, i) => (
              <li key={`${nome}-${i}`}>
                <button
                  type="button"
                  disabled={buscando}
                  onClick={() => {
                    setValoresTitular({ nome, cpfCnpj: '' });
                    void iniciarBusca(nome, 'titular');
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
                  title="Listar os processos deste titular"
                >
                  {nome}
                </button>
              </li>
            ))}
          </ul>
          )}
        </div>
      )}

      {resultado && resultado.tipoResultado !== 'titulares' && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm opacity-70">
              {resultado.titular && (
                <span className="mr-2 font-medium opacity-100">
                  Processos do titular “{resultado.titular}”:
                </span>
              )}
              {resultado.total.toLocaleString('pt-BR')} resultado(s) em {resultado.paginas ?? 1}{' '}
              página(s) do pePI.
              {(resultado.cadastrosTitular ?? 0) > 1 && (
                <span className="ml-2">
                  Soma de {resultado.cadastrosTitular} cadastros do mesmo nome na base do INPI.
                </span>
              )}
              {resultado.truncado && (
                <span className="ml-2 text-amber-600 dark:text-amber-400">
                  Resultado truncado no limite de páginas — refine a busca (Exata ou classe NCL).
                </span>
              )}
            </p>
            {porTitular && (resultado.itens ?? []).length > 0 && (
              <span className="flex gap-2">
                <button
                  type="button"
                  disabled={salvandoLote || selecao.size === 0}
                  onClick={() => void executarLote('adicionar')}
                  className="rounded bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
                >
                  {salvandoLote ? 'Salvando…' : `Adicionar ao monitor (${selecao.size})`}
                </button>
                <button
                  type="button"
                  disabled={salvandoLote || selecao.size === 0}
                  onClick={() => void executarLote('remover')}
                  className="rounded border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
                >
                  Remover do monitor ({selecao.size})
                </button>
              </span>
            )}
            {job && !porTitular && (
              <span className="flex gap-2">
                <a
                  href={`/api/busca/${job.jobId}/relatorio`}
                  target="_blank"
                  rel="noopener"
                  className="rounded border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                >
                  Relatório Consultor de Marca ↗
                </a>
                <a
                  href={`/api/busca/${job.jobId}/relatorio?formato=pdf`}
                  target="_blank"
                  rel="noopener"
                  title="Abre o relatório com o diálogo de impressão — escolha 'Salvar como PDF'"
                  className="rounded border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                >
                  PDF ↗
                </a>
              </span>
            )}
          </div>
          {loteErro && (
            <p className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {loteErro}
            </p>
          )}
          {loteMsg && (
            <p className="mb-3 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              {loteMsg} <Link href="/marcas" className="underline">Ver marcas monitoradas →</Link>
            </p>
          )}
          <div className="overflow-x-auto rounded border border-black/10 dark:border-white/15">
            <table className="w-full text-sm">
              <thead className="bg-black/5 text-left dark:bg-white/10">
                <tr>
                  {porTitular && (
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        title="Selecionar todos"
                        checked={
                          (resultado.itens ?? []).length > 0 &&
                          selecao.size === (resultado.itens ?? []).length
                        }
                        onChange={(e) =>
                          setSelecao(
                            e.target.checked
                              ? new Set((resultado.itens ?? []).map((i) => i.processo))
                              : new Set(),
                          )
                        }
                      />
                    </th>
                  )}
                  <th className="px-3 py-2 font-medium">Processo</th>
                  <th className="px-3 py-2 font-medium">Marca</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                  <th className="px-3 py-2 font-medium">Titular</th>
                  <th className="px-3 py-2 font-medium">Classe</th>
                  <th className="px-3 py-2 font-medium">Prioridade</th>
                  {porTitular && <th className="px-3 py-2 font-medium">Monitor</th>}
                </tr>
              </thead>
              <tbody>
                {(resultado.itens ?? []).map((r, i) => (
                  <tr
                    key={`${r.processo}-${i}`}
                    className="border-t border-black/5 align-top dark:border-white/10"
                  >
                    {porTitular && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selecao.has(r.processo)}
                          disabled={salvandoLote}
                          onChange={() => alternarSelecao(r.processo)}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 font-mono">
                      {r.codPedido ? (
                        <Link
                          href={`/busca/marca/processo/${r.codPedido}?processo=${r.processo}`}
                          className="underline decoration-dotted hover:opacity-70"
                          title="Ver detalhe do processo"
                        >
                          {r.processo}
                        </Link>
                      ) : (
                        r.processo
                      )}
                    </td>
                    <td className="px-3 py-2">{r.marca ?? '—'}</td>
                    <td className="px-3 py-2">{r.situacao ?? '—'}</td>
                    <td className="max-w-64 truncate px-3 py-2" title={r.titular ?? undefined}>
                      {r.titular ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{r.classe ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{r.prioridade ?? '—'}</td>
                    {porTitular && (
                      <td className="whitespace-nowrap px-3 py-2">
                        {monitoradas.has(r.processo) ? (
                          monitoradas.get(r.processo) ? (
                            <span className="text-emerald-700 dark:text-emerald-400">✓ monitorada</span>
                          ) : (
                            <span className="opacity-60">desativada</span>
                          )
                        ) : (
                          <span className="opacity-40">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {(resultado.itens ?? []).length === 0 && (
                  <tr>
                    <td colSpan={porTitular ? 8 : 6} className="px-3 py-8 text-center opacity-60">
                      {porProcesso
                        ? 'Nenhum processo encontrado com esse número — confira os dígitos.'
                        : porTitular
                          ? 'Nenhum processo de marca encontrado para este titular.'
                          : 'Nenhuma marca encontrada — bom sinal para um registro novo.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
