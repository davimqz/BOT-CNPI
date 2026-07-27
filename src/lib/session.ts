// Sessão de usuário único: cookie httpOnly com payload assinado via HMAC-SHA256.
// Usa Web Crypto (crypto.subtle) para funcionar tanto no runtime Node quanto no Edge.

const SESSION_COOKIE = 'session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

export { SESSION_COOKIE };

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET não configurado (ver .env.example)');
  return secret;
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64url(new Uint8Array(sig));
}

export async function createSessionToken(email: string): Promise<string> {
  const payload = base64url(
    new TextEncoder().encode(JSON.stringify({ email, exp: Date.now() + SESSION_TTL_MS })),
  );
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  if ((await hmac(payload)) !== sig) return false;
  try {
    const b64 = payload.replaceAll('-', '+').replaceAll('_', '/');
    const data = JSON.parse(atob(b64)) as { exp?: number };
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}
