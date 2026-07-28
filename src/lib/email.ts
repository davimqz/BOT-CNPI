/**
 * Envio de e-mail — dois provedores, um padrão.
 *
 * PADRÃO: Resend (API HTTP). O usuário final não configura nada: a credencial é
 * do operador (variável de ambiente / secret do repositório), e o destinatário
 * sai do cadastro. Foi a decisão que substituiu o "cada usuário com seu SMTP" do
 * software de referência — aquele é um app desktop, sem servidor próprio para
 * enviar em nome de ninguém; num sistema hospedado essa razão não existe, e
 * pedir host/porta/senha-de-app a um leigo é a parte mais frágil do produto.
 * Ver CLAUDE.md Seção 3.
 *
 * FALLBACK: SMTP (Nodemailer), mantido para quem quiser usar o próprio servidor
 * e para não depender de um serviço externo estar de pé.
 *
 * Nenhuma credencial vai para o banco nem para o código (CLAUDE.md Seção 6). A
 * chave do Resend em particular NÃO é configuração de usuário: ela dá acesso de
 * envio ao domínio inteiro, então vive só no ambiente.
 */

import nodemailer from 'nodemailer';
import { prisma } from './db';

export interface ConfigSmtp {
  host: string;
  porta: number;
  usuario: string | null;
  senha: string | null;
  remetente: string;
  /** 'ssl' força TLS implícito (porta 465); qualquer outro valor usa STARTTLS. */
  criptografia: string | null;
}

export type ConfigEmail =
  | { provedor: 'resend'; apiKey: string; remetente: string; responderPara: string | null }
  | ({ provedor: 'smtp' } & ConfigSmtp);

export interface Mensagem {
  para: string;
  assunto: string;
  html: string;
  texto: string;
}

const ENDPOINT_RESEND = 'https://api.resend.com/emails';

/**
 * Configuração efetiva, na ordem de preferência. Devolve `null` (em vez de
 * lançar) quando não há nada configurado: um resumo de prazos sem e-mail
 * configurado é um aviso, não uma falha que deva derrubar o job da RPI.
 */
export async function carregarConfigEmail(): Promise<ConfigEmail | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const remetente = process.env.EMAIL_REMETENTE;
  if (apiKey && remetente) {
    return {
      provedor: 'resend',
      apiKey,
      remetente,
      // Resposta do usuário precisa chegar em algum lugar real: o remetente é um
      // endereço de envio do domínio, que ninguém lê.
      responderPara: process.env.EMAIL_RESPONDER_PARA ?? null,
    };
  }

  const config = await prisma.configuracaoAlerta.findFirst({
    where: { smtpHost: { not: null } },
  });
  // Nomes das variáveis conforme .env.example (SMTP_PORT/USER/PASSWORD/FROM).
  const host = config?.smtpHost ?? process.env.SMTP_HOST ?? null;
  const remetenteSmtp = config?.smtpRemetente ?? process.env.SMTP_FROM ?? null;
  if (!host || !remetenteSmtp) return null;

  return {
    provedor: 'smtp',
    host,
    porta: config?.smtpPorta ?? Number(process.env.SMTP_PORT ?? 587),
    usuario: config?.smtpUsuario ?? process.env.SMTP_USER ?? null,
    senha: config?.smtpSenha ?? process.env.SMTP_PASSWORD ?? null,
    remetente: remetenteSmtp,
    criptografia: config?.smtpCriptografia ?? process.env.SMTP_CRIPTOGRAFIA ?? null,
  };
}

/** Corpo da chamada ao Resend — separado do fetch para ser testável. */
export function montarPayloadResend(
  mensagem: Mensagem,
  config: Extract<ConfigEmail, { provedor: 'resend' }>,
) {
  return {
    from: config.remetente,
    to: [mensagem.para],
    subject: mensagem.assunto,
    html: mensagem.html,
    // Texto puro junto do HTML não é redundância: cliente que bloqueia HTML
    // mostraria um alerta de prazo vazio.
    text: mensagem.texto,
    ...(config.responderPara ? { reply_to: config.responderPara } : {}),
  };
}

async function enviarViaResend(
  mensagem: Mensagem,
  config: Extract<ConfigEmail, { provedor: 'resend' }>,
): Promise<void> {
  const resp = await fetch(ENDPOINT_RESEND, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(montarPayloadResend(mensagem, config)),
  });

  if (!resp.ok) {
    const corpo = await resp.text().catch(() => '');
    // Falha silenciosa aqui significa prazo não avisado — o erro precisa ser
    // legível o bastante para o log do Actions bastar como diagnóstico.
    const dica =
      resp.status === 403 || resp.status === 422
        ? ' (domínio do remetente verificado no Resend? EMAIL_REMETENTE precisa usar um domínio já validado)'
        : resp.status === 401
          ? ' (RESEND_API_KEY inválida ou revogada)'
          : '';
    throw new Error(`Resend recusou o envio: HTTP ${resp.status} ${corpo}${dica}`.trim());
  }
}

export function criarTransporte(config: ConfigSmtp) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.porta,
    secure: config.criptografia === 'ssl' || config.porta === 465,
    auth: config.usuario ? { user: config.usuario, pass: config.senha ?? '' } : undefined,
  });
}

export async function enviarEmail(mensagem: Mensagem, config: ConfigEmail): Promise<void> {
  if (config.provedor === 'resend') return enviarViaResend(mensagem, config);

  const transporte = criarTransporte(config);
  await transporte.sendMail({
    from: config.remetente,
    to: mensagem.para,
    subject: mensagem.assunto,
    text: mensagem.texto,
    html: mensagem.html,
  });
}

/** Rótulo do provedor para o log dizer por onde o e-mail saiu. */
export function descreverConfig(config: ConfigEmail): string {
  return config.provedor === 'resend'
    ? `Resend (de ${config.remetente})`
    : `SMTP ${config.host}:${config.porta} (de ${config.remetente})`;
}

/** Destinatário padrão: o e-mail do usuário único desta versão. */
export async function destinatarioPadrao(): Promise<string | null> {
  if (process.env.RESUMO_PRAZOS_PARA) return process.env.RESUMO_PRAZOS_PARA;
  const usuario = await prisma.usuario.findFirst({ orderBy: { criadoEm: 'asc' } });
  return usuario?.email ?? null;
}
