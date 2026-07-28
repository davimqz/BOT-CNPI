import { prisma } from './db';

// O login é de usuário único via AUTH_EMAIL/AUTH_PASSWORD (env, ver src/lib/session.ts) —
// a linha em `usuarios` existe só para satisfazer as FKs do modelo (marcas monitoradas,
// templates, configurações de alerta). Multiusuário de verdade fica para a Fase 8.
export async function getUsuarioUnico() {
  const email = process.env.AUTH_EMAIL;
  if (!email) throw new Error('AUTH_EMAIL não configurado (ver .env.example)');
  return prisma.usuario.upsert({
    where: { email },
    update: {},
    // senhaHash vazio: a senha real vive em AUTH_PASSWORD, nunca no banco nesta versão.
    create: { email, nome: 'Usuário único', senhaHash: '' },
  });
}
