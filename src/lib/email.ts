/**
 * Envio de e-mail por SMTP do próprio usuário (Nodemailer) — a mesma escolha do
 * software de referência, e a que mantém o custo em zero (CLAUDE.md, Seção 3).
 *
 * A configuração vem de `configuracoes_alerta` quando existe, com as variáveis de
 * ambiente como fallback — é o que permite o worker do GitHub Actions enviar sem
 * depender de alguém ter aberto a tela de configuração antes (Fase 6). Nenhuma
 * credencial é hardcodada (CLAUDE.md, Seção 6).
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

export interface Mensagem {
  para: string;
  assunto: string;
  html: string;
  texto: string;
}

/**
 * Configuração efetiva. Devolve `null` (em vez de lançar) quando não há SMTP
 * configurado: um resumo de prazos sem e-mail configurado é um aviso, não uma
 * falha que deva derrubar o job da RPI.
 */
export async function carregarConfigSmtp(): Promise<ConfigSmtp | null> {
  const config = await prisma.configuracaoAlerta.findFirst({
    where: { smtpHost: { not: null } },
  });

  // Nomes das variáveis conforme .env.example (SMTP_PORT/USER/PASSWORD/FROM).
  const host = config?.smtpHost ?? process.env.SMTP_HOST ?? null;
  const remetente = config?.smtpRemetente ?? process.env.SMTP_FROM ?? null;
  if (!host || !remetente) return null;

  return {
    host,
    porta: config?.smtpPorta ?? Number(process.env.SMTP_PORT ?? 587),
    usuario: config?.smtpUsuario ?? process.env.SMTP_USER ?? null,
    senha: config?.smtpSenha ?? process.env.SMTP_PASSWORD ?? null,
    remetente,
    criptografia: config?.smtpCriptografia ?? process.env.SMTP_CRIPTOGRAFIA ?? null,
  };
}

export function criarTransporte(config: ConfigSmtp) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.porta,
    secure: config.criptografia === 'ssl' || config.porta === 465,
    auth: config.usuario ? { user: config.usuario, pass: config.senha ?? '' } : undefined,
  });
}

export async function enviarEmail(mensagem: Mensagem, config: ConfigSmtp): Promise<void> {
  const transporte = criarTransporte(config);
  await transporte.sendMail({
    from: config.remetente,
    to: mensagem.para,
    subject: mensagem.assunto,
    text: mensagem.texto,
    html: mensagem.html,
  });
}

/** Destinatário do resumo: o e-mail do usuário único desta versão. */
export async function destinatarioPadrao(): Promise<string | null> {
  if (process.env.RESUMO_PRAZOS_PARA) return process.env.RESUMO_PRAZOS_PARA;
  const usuario = await prisma.usuario.findFirst({ orderBy: { criadoEm: 'asc' } });
  return usuario?.email ?? null;
}
