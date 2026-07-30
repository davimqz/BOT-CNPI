import { NextResponse } from 'next/server';
import { getUsuarioUnico } from '@/lib/usuario';
import { carregarConfiguracoesAlerta, salvarCanais } from '@/lib/configuracao-alertas';

// Configurações de Alertas (Fase 6). Autenticação vem do proxy (src/proxy.ts):
// tudo fora de /login já chega aqui autenticado, ou vira 401 antes.
export const dynamic = 'force-dynamic';

export async function GET() {
  const usuario = await getUsuarioUnico();
  return NextResponse.json(await carregarConfiguracoesAlerta(usuario.id));
}

/**
 * Liga/desliga canais. Só aceita os dois campos que correspondem a canais que
 * existem de verdade — `whatsappHabilitado` fica de fora enquanto a Cloud API
 * não estiver aprovada, para o banco não guardar uma expectativa que o sistema
 * não cumpre.
 */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const alteracao: { emailHabilitado?: boolean; popupHabilitado?: boolean } = {};
  if (typeof body.emailHabilitado === 'boolean') alteracao.emailHabilitado = body.emailHabilitado;
  if (typeof body.popupHabilitado === 'boolean') alteracao.popupHabilitado = body.popupHabilitado;

  if (Object.keys(alteracao).length === 0) {
    return NextResponse.json({ erro: 'Nenhum canal informado' }, { status: 400 });
  }

  const usuario = await getUsuarioUnico();
  await salvarCanais(usuario.id, alteracao);
  // Devolve o estado recarregado: desligar o e-mail muda o diagnóstico exibido,
  // e a tela não deve precisar adivinhar qual é o novo texto.
  return NextResponse.json(await carregarConfiguracoesAlerta(usuario.id));
}
