-- A tela de Configurações de Alertas (Fase 6) transforma `email_habilitado` num
-- interruptor de verdade: a partir daqui os workers consultam o flag antes de
-- enviar (ver src/lib/configuracao-alertas.ts). Até agora ele existia no schema
-- e não era lido por ninguém — o envio dependia só de haver credencial no
-- ambiente.
--
-- Por isso o default passa a `true` e as linhas existentes são atualizadas:
-- manter o `false` herdado desligaria, em silêncio, o alerta de quem só tem uma
-- linha de configuração porque clicou em "Já vi" no pop-up. Desligar um canal
-- de aviso de prazo tem que ser um gesto explícito do usuário, nunca efeito
-- colateral de uma migration.
ALTER TABLE "configuracoes_alerta" ALTER COLUMN "email_habilitado" SET DEFAULT true;
UPDATE "configuracoes_alerta" SET "email_habilitado" = true;
