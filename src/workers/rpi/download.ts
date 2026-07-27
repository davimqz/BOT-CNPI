import AdmZip from 'adm-zip';

// URL previsível confirmada na skill rpi-ingestion-despachos:
// edição 2893 → https://revistas.inpi.gov.br/txt/RM2893.zip
const ZIP_URL = (numero: number) => `https://revistas.inpi.gov.br/txt/RM${numero}.zip`;

export type ResultadoDownload =
  | { status: 'publicada'; xml: string }
  | { status: 'nao-publicada' }
  | { status: 'erro'; detalhe: string };

const TENTATIVAS = 4;
const ESPERA_BASE_MS = 5_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Edição ainda não publicada NÃO é 404 direto: o servidor responde
// 302 → /error/404.html (confirmado em 27/07/2026). Tratamos ambos.
// O servidor também trunca/derruba downloads com frequência — daí o retry.
export async function baixarEdicao(numero: number): Promise<ResultadoDownload> {
  let ultimo: ResultadoDownload = { status: 'erro', detalhe: 'nenhuma tentativa feita' };
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    ultimo = await tentarBaixar(numero, tentativa);
    if (ultimo.status !== 'erro') return ultimo;
    console.warn(`[rpi] tentativa ${tentativa}/${TENTATIVAS} falhou: ${ultimo.detalhe}`);
    if (tentativa < TENTATIVAS) await sleep(ESPERA_BASE_MS * tentativa);
  }
  return ultimo;
}

async function tentarBaixar(numero: number, tentativa: number): Promise<ResultadoDownload> {
  const url = ZIP_URL(numero);
  console.log(`[rpi] baixando ${url} (tentativa ${tentativa})`);

  let buffer: Buffer;
  let response: Response;
  try {
    response = await fetch(url, { redirect: 'manual' });
    if (response.status === 404 || (response.status >= 300 && response.status < 400)) {
      return { status: 'nao-publicada' };
    }
    if (!response.ok) {
      return { status: 'erro', detalhe: `HTTP ${response.status}` };
    }
    buffer = Buffer.from(await response.arrayBuffer());
  } catch (e) {
    return { status: 'erro', detalhe: `falha de rede: ${(e as Error).message}` };
  }

  // Servidor já devolveu 200 com corpo truncado/HTML — valide o magic number.
  if (buffer.length < 4 || buffer.toString('latin1', 0, 2) !== 'PK') {
    return {
      status: 'erro',
      detalhe: `resposta 200 mas não é um ZIP válido (${buffer.length} bytes, início: ${JSON.stringify(buffer.toString('latin1', 0, 30))})`,
    };
  }

  try {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('.xml'));
    if (!entry) {
      return { status: 'erro', detalhe: 'ZIP sem arquivo .xml dentro' };
    }

    // XML declarado e confirmado como UTF-8 nas edições 2897/2898.
    const xml = entry.getData().toString('utf-8');
    console.log(`[rpi] edição ${numero}: XML extraído (${(xml.length / 1e6).toFixed(1)} MB)`);
    return { status: 'publicada', xml };
  } catch (e) {
    // ZIP truncado pelo servidor passa no magic number mas falha aqui — retry resolve.
    return { status: 'erro', detalhe: `ZIP corrompido/truncado: ${(e as Error).message}` };
  }
}
