import { NextResponse } from 'next/server';
import { getUsuarioUnico } from '@/lib/usuario';
import { carregarNovidades, marcarNovidadesVistas, paraUI } from '@/lib/novidades';

// Pop-up de novidades (Fase 6). A autenticação é feita no proxy (src/proxy.ts):
// tudo fora de /login já chega aqui autenticado, ou vira 401 antes.
export const dynamic = 'force-dynamic';

export async function GET() {
  const usuario = await getUsuarioUnico();
  // paraUI: mesma forma que o layout entrega no render do servidor.
  return NextResponse.json(paraUI(await carregarNovidades(usuario.id)));
}

/** "Já vi": move o marco do usuário para agora e esvazia o aviso. */
export async function POST() {
  const usuario = await getUsuarioUnico();
  const vistoEm = await marcarNovidadesVistas(usuario.id);
  return NextResponse.json({ vistoEm });
}
