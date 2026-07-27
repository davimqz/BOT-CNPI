import { NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE } from '@/lib/session';

export async function POST(request: Request) {
  const { email, senha } = (await request.json().catch(() => ({}))) as {
    email?: string;
    senha?: string;
  };

  const expectedEmail = process.env.AUTH_EMAIL;
  const expectedPassword = process.env.AUTH_PASSWORD;
  if (!expectedEmail || !expectedPassword) {
    return NextResponse.json(
      { erro: 'AUTH_EMAIL/AUTH_PASSWORD não configurados no servidor' },
      { status: 500 },
    );
  }

  if (email !== expectedEmail || senha !== expectedPassword) {
    return NextResponse.json({ erro: 'E-mail ou senha inválidos' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(email), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });
  return response;
}
