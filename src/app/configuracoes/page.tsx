import Link from 'next/link';
import { getUsuarioUnico } from '@/lib/usuario';
import { carregarConfiguracoesAlerta } from '@/lib/configuracao-alertas';
import { PainelCanais } from './painel-canais';

export const dynamic = 'force-dynamic';

export default async function ConfiguracoesPage() {
  const usuario = await getUsuarioUnico();
  const configuracoes = await carregarConfiguracoesAlerta(usuario.id);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Configurações de Alertas</h1>
        <Link href="/" className="text-sm underline opacity-70 hover:opacity-100">
          ← voltar
        </Link>
      </header>

      <p className="mb-6 text-sm opacity-80">
        Por onde o sistema avisa quando detecta movimentação nas marcas monitoradas. Cada canal é
        independente: desligar um não afeta os outros, e nada é descartado quando um canal está
        desligado — a movimentação continua registrada no histórico e nos prazos.
      </p>

      <PainelCanais inicial={configuracoes} />

      {/*
        O destinatário e a credencial não são editáveis aqui de propósito, e a
        tela precisa dizer por quê — senão a ausência do campo parece
        funcionalidade faltando. Ver CLAUDE.md Seção 3.2.
      */}
      <section className="mt-8 rounded border border-black/10 p-4 text-sm opacity-80 dark:border-white/15">
        <p className="mb-2">
          <strong>Por que não há campo de senha/SMTP nesta tela.</strong> A credencial de envio é do
          operador do sistema e vive só no ambiente (<code>RESEND_API_KEY</code>,{' '}
          <code>EMAIL_REMETENTE</code>) — ela autoriza envio pelo domínio inteiro, então não pode
          ficar no banco nem numa tela. O software de referência pedia SMTP ao usuário porque é um
          app desktop, sem servidor próprio para enviar; aqui essa restrição não existe.
        </p>
        <p className="mb-2">
          Para trocar o destinatário, use <code>RESUMO_PRAZOS_PARA</code> ou o e-mail do usuário
          cadastrado.
        </p>
        <p>
          <strong>O que o diagnóstico de e-mail acima cobre.</strong> Ele lê o ambiente{' '}
          <em>deste aplicativo</em>. Quem envia os alertas é o worker no GitHub Actions, usando os{' '}
          <em>secrets do repositório</em> — em produção são dois ambientes separados, e o estado
          aqui pode divergir do envio real se os dois saírem de sincronia. A prova de ponta a ponta
          é o workflow <code>E-mail de teste</code>, que roda no mesmo lugar que os alertas: dispare
          pela aba Actions e confira a caixa de entrada.
        </p>
      </section>
    </main>
  );
}
