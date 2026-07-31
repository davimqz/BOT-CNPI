/**
 * Configurações de Alertas (Fase 6) — quais canais estão ligados e se cada um
 * consegue de fato entregar.
 *
 * A regra que organiza este módulo: **um interruptor que não desliga nada é
 * pior do que interruptor nenhum.** Até aqui, `configuracoes_alerta.email_habilitado`
 * existia no schema e não era lido por ninguém — quem mandava era só a presença
 * de credencial no ambiente. Uma tela que mostrasse aquela coluna como "canal de
 * e-mail" estaria mentindo nas duas direções (desligado continuaria enviando,
 * ligado sem credencial continuaria mudo). Por isso o flag passou a ser
 * consultado pelos workers (ver `canalEmailLiberado`) e a tela mostra, junto do
 * interruptor, o diagnóstico do ambiente.
 *
 * A distinção entre "o usuário desligou" e "está ligado mas não consegue enviar"
 * é o conteúdo principal desta tela. O segundo caso é o modo de falha que este
 * sistema inteiro existe para evitar: tudo parece configurado e nenhum alerta
 * sai. Ele nunca pode aparecer como um "ok" verde.
 *
 * Nenhuma credencial vaza para a tela: daqui sai o *nome* do provedor e o
 * remetente, nunca a chave (CLAUDE.md Seção 3.2 — a chave do Resend autoriza
 * envio pelo domínio inteiro e vive só no ambiente).
 *
 * LIMITE DO DIAGNÓSTICO, e ele é importante em produção: o que se lê aqui é o
 * ambiente **do app web** (Vercel). Quem envia de verdade é o worker no GitHub
 * Actions, com os *secrets do repositório* — em desenvolvimento os dois são o
 * mesmo `.env`, em produção são ambientes separados. Então este diagnóstico
 * responde "o app enxerga um provedor?", não "o alerta vai sair?", e pode
 * divergir do envio real se as duas configurações saírem de sincronia. Por isso
 * os textos abaixo falam do app, e a tela remete ao `email-teste.yml` (que roda
 * no runner) para a prova de ponta a ponta. Se um dia isto precisar afirmar o
 * envio real, o caminho é o worker registrar o resultado da última rodada no
 * banco e a tela ler esse registro — nunca inferir do próprio ambiente.
 */

import { prisma } from './db';
import { carregarConfigEmail, destinatarioPadrao } from './email';

/**
 * O canal de WhatsApp ainda não existe (TASKS.md Fase 6: depende da aprovação
 * da Cloud API da Meta, que tem lead time externo). A constante existe para a
 * tela poder dizer isso explicitamente em vez de oferecer um interruptor que
 * não entrega mensagem nenhuma — habilitar um canal mudo é exatamente como se
 * perde um prazo achando que está avisado.
 */
export const WHATSAPP_DISPONIVEL = false;

export type ProvedorEmail = 'resend' | 'smtp';

/**
 * `ativo` — ligado e com tudo que precisa para entregar.
 * `desligado` — o usuário desligou; nada é enviado e nada é descartado.
 * `incompleto` — ligado, mas falta algo no ambiente: NÃO entrega.
 * `indisponivel` — o canal não foi construído ainda.
 */
export type SituacaoCanal = 'ativo' | 'desligado' | 'incompleto' | 'indisponivel';

export interface EstadoEmail {
  habilitado: boolean;
  /** Resolvido do ambiente/banco por `carregarConfigEmail`; null = nada configurado. */
  provedor: ProvedorEmail | null;
  remetente: string | null;
  destinatario: string | null;
}

export interface Diagnostico {
  situacao: SituacaoCanal;
  /** Frase pronta para a tela — o que está acontecendo e o que fazer a respeito. */
  detalhe: string;
}

/**
 * Diagnóstico do canal de e-mail. Puro de propósito: é a regra que decide se a
 * tela mostra tranquilidade ou alarme, e ela precisa ser testável sem banco.
 */
export function diagnosticarEmail(e: EstadoEmail): Diagnostico {
  if (!e.habilitado) {
    return {
      situacao: 'desligado',
      detalhe:
        'Nenhum e-mail é enviado. As movimentações detectadas continuam na fila e no aviso da tela — desligar não descarta alerta.',
    };
  }
  if (!e.provedor) {
    return {
      situacao: 'incompleto',
      detalhe:
        'Ligado, mas este app não enxerga provedor de envio: falta RESEND_API_KEY + EMAIL_REMETENTE no ambiente (ou a configuração de SMTP do fallback).',
    };
  }
  if (!e.destinatario) {
    return {
      situacao: 'incompleto',
      detalhe:
        'Ligado e com provedor, mas sem destinatário: defina RESUMO_PRAZOS_PARA ou cadastre o e-mail do usuário. Nenhum e-mail sai sem isso.',
    };
  }
  return {
    situacao: 'ativo',
    detalhe: `Este app enxerga o provedor ${e.provedor === 'resend' ? 'Resend' : 'SMTP'} e um destinatário — o canal está configurado do lado da aplicação.`,
  };
}

export function diagnosticarPopup(habilitado: boolean): Diagnostico {
  return habilitado
    ? {
        situacao: 'ativo',
        detalhe:
          'O aviso aparece em qualquer tela do sistema e só some quando você clica em "Já vi". Não depende de nenhuma credencial.',
      }
    : {
        situacao: 'desligado',
        detalhe:
          'O aviso não aparece. Como este é o único canal que funciona sem credencial nenhuma, desligá-lo junto com o e-mail deixa o sistema detectando movimentação sem avisar ninguém.',
      };
}

export function diagnosticarWhatsapp(): Diagnostico {
  return {
    situacao: 'indisponivel',
    detalhe:
      'Ainda não construído. Depende da aprovação da Cloud API oficial da Meta (conta comercial, número verificado e template aprovado) — automação de WhatsApp Web não é alternativa aqui, é risco de banimento do número (CLAUDE.md Seção 5).',
  };
}

export interface ConfiguracoesAlertaUI {
  email: EstadoEmail & Diagnostico;
  popup: { habilitado: boolean } & Diagnostico;
  whatsapp: { habilitado: boolean; disponivel: boolean } & Diagnostico;
}

/**
 * Estado completo para a tela. Usa `upsert` implícito no sentido de tolerar a
 * ausência da linha: no uso pessoal ela só passa a existir quando o usuário
 * mexe em alguma coisa, e "nunca mexi" tem que significar o padrão ligado, não
 * "canal desligado".
 */
export async function carregarConfiguracoesAlerta(
  usuarioId: string,
): Promise<ConfiguracoesAlertaUI> {
  const [config, envio, destinatario] = await Promise.all([
    prisma.configuracaoAlerta.findUnique({ where: { usuarioId } }),
    carregarConfigEmail(),
    destinatarioPadrao(),
  ]);

  const email: EstadoEmail = {
    habilitado: config?.emailHabilitado ?? true,
    provedor: envio?.provedor ?? null,
    // Só o remetente e o provedor atravessam para a tela — a chave, nunca.
    remetente: envio?.remetente ?? null,
    destinatario,
  };
  const popupHabilitado = config?.popupHabilitado ?? true;

  return {
    email: { ...email, ...diagnosticarEmail(email) },
    popup: { habilitado: popupHabilitado, ...diagnosticarPopup(popupHabilitado) },
    whatsapp: {
      habilitado: config?.whatsappHabilitado ?? false,
      disponivel: WHATSAPP_DISPONIVEL,
      ...diagnosticarWhatsapp(),
    },
  };
}

export interface AlteracaoCanais {
  emailHabilitado?: boolean;
  popupHabilitado?: boolean;
}

/**
 * Grava a escolha dos canais. `whatsappHabilitado` não entra: enquanto o canal
 * não existir, deixá-lo gravável só permitiria ao usuário registrar uma
 * expectativa que o sistema não cumpre.
 */
export async function salvarCanais(
  usuarioId: string,
  alteracao: AlteracaoCanais,
): Promise<void> {
  await prisma.configuracaoAlerta.upsert({
    where: { usuarioId },
    create: { usuarioId, ...alteracao },
    update: alteracao,
  });
}

/**
 * Portão consultado pelos workers antes de enviar qualquer e-mail.
 *
 * Sem linha de configuração devolve `true`: nesta versão de usuário único a
 * linha pode nunca ter sido criada, e o padrão de um sistema de prazos é
 * avisar. Silêncio só por escolha explícita.
 *
 * Usa `findFirst` porque o worker roda no GitHub Actions, sem sessão — é a
 * mesma convenção de usuário único de `carregarConfigEmail`. Na Fase 8
 * (multiusuário) isto passa a receber o usuário como parâmetro.
 */
export async function canalEmailLiberado(): Promise<boolean> {
  const config = await prisma.configuracaoAlerta.findFirst({
    orderBy: { atualizadoEm: 'asc' },
  });
  return config?.emailHabilitado ?? true;
}
