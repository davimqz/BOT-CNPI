import { NextResponse } from 'next/server';
import { getUsuarioUnico } from '@/lib/usuario';
import { caixaMensagensParaUI, carregarCaixaMensagens } from '@/lib/novidades';

// Caixa de Mensagem: inbox persistente das notificações dos processos
// acompanhados, construída sobre a mesma fonte do pop-up de novidades
// (ver src/lib/novidades.ts). "Marcar todas como lidas" reaproveita
// POST /api/alertas/novidades — é o mesmo marco `alertas_vistos_em`.
export const dynamic = 'force-dynamic';

export async function GET() {
  const usuario = await getUsuarioUnico();
  return NextResponse.json(caixaMensagensParaUI(await carregarCaixaMensagens(usuario.id)));
}
