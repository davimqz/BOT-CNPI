'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      });
      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { erro?: string };
        setErro(data.erro ?? 'Falha no login');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-black/10 p-6 dark:border-white/15"
      >
        <h1 className="text-xl font-semibold">Monitor de Marcas — INPI</h1>
        <label className="block space-y-1">
          <span className="text-sm">E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="w-full rounded border border-black/20 bg-transparent px-3 py-2 dark:border-white/20"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Senha</span>
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            className="w-full rounded border border-black/20 bg-transparent px-3 py-2 dark:border-white/20"
          />
        </label>
        {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded bg-foreground px-3 py-2 font-medium text-background disabled:opacity-50"
        >
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
