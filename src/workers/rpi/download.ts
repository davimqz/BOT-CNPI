import AdmZip from 'adm-zip';

// URL previsível confirmada na skill rpi-ingestion-despachos:
// edição 2893 → https://revistas.inpi.gov.br/txt/RM2893.zip
const ZIP_URL = (numero: number) => `https://revistas.inpi.gov.br/txt/RM${numero}.zip`;

export type ResultadoDownload =
  | { status: 'publicada'; xml: string }
  | { status: 'nao-publicada' }
  | { status: 'erro'; detalhe: string };

// Edição ainda não publicada NÃO é 404 direto: o servidor responde
// 302 → /error/404.html (confirmado em 27/07/2026). Tratamos ambos.
export async function baixarEdicao(numero: number): Promise<ResultadoDownload> {
  const url = ZIP_URL(numero);
  console.log(`[rpi] baixando ${url}`);

  let response: Response;
  try {
    response = await fetch(url, { redirect: 'manual' });
  } catch (e) {
    return { status: 'erro', detalhe: `falha de rede: ${(e as Error).message}` };
  }

  if (response.status === 404 || (response.status >= 300 && response.status < 400)) {
    return { status: 'nao-publicada' };
  }
  if (!response.ok) {
    return { status: 'erro', detalhe: `HTTP ${response.status}` };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  // Servidor já devolveu 200 com HTML de erro em alguns cenários — valide o magic number.
  if (buffer.length < 4 || buffer.toString('latin1', 0, 2) !== 'PK') {
    return { status: 'erro', detalhe: 'resposta 200 mas não é um ZIP válido' };
  }

  const zip = new AdmZip(buffer);
  const entry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('.xml'));
  if (!entry) {
    return { status: 'erro', detalhe: 'ZIP sem arquivo .xml dentro' };
  }

  // XML declarado e confirmado como UTF-8 nas edições 2897/2898.
  const xml = entry.getData().toString('utf-8');
  console.log(`[rpi] edição ${numero}: XML extraído (${(xml.length / 1e6).toFixed(1)} MB)`);
  return { status: 'publicada', xml };
}
