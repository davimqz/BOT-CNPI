-- CreateEnum
CREATE TYPE "FonteDados" AS ENUM ('rpi', 'scraping');

-- CreateEnum
CREATE TYPE "TipoBusca" AS ENUM ('radical', 'exata');

-- CreateEnum
CREATE TYPE "StatusPrazo" AS ENUM ('pendente', 'cumprido', 'vencido');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "whatsapp" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marcas_monitoradas" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "nome" TEXT NOT NULL,
    "processo" TEXT,
    "classe_ncl" TEXT,
    "tipo_busca" "TipoBusca" NOT NULL DEFAULT 'radical',
    "similaridade_ativa" BOOLEAN NOT NULL DEFAULT false,
    "similaridade_threshold" INTEGER,
    "fonte_dados" "FonteDados" NOT NULL DEFAULT 'rpi',
    "eventos_alerta" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marcas_monitoradas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "despachos" (
    "id" TEXT NOT NULL,
    "marca_id" TEXT,
    "edicao_rpi_id" TEXT,
    "processo" TEXT NOT NULL,
    "nome_marca" TEXT,
    "titular" TEXT,
    "classe_ncl" TEXT,
    "codigo" TEXT NOT NULL,
    "texto_despacho" TEXT,
    "data_publicacao" TIMESTAMP(3) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "despachos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prazos" (
    "id" TEXT NOT NULL,
    "despacho_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "data_limite" TIMESTAMP(3) NOT NULL,
    "status" "StatusPrazo" NOT NULL DEFAULT 'pendente',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prazos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edicoes_rpi" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "data_publicacao" TIMESTAMP(3) NOT NULL,
    "processado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edicoes_rpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "nome_escritorio" TEXT,
    "telefone" TEXT,
    "email_contato" TEXT,
    "site" TEXT,
    "logo_url" TEXT,
    "ocultar_logo" BOOLEAN NOT NULL DEFAULT false,
    "cor_destaque" TEXT,
    "texto_rodape" TEXT,
    "email_assunto" TEXT,
    "email_cabecalho" TEXT,
    "email_texto_intro" TEXT,
    "email_rodape" TEXT,
    "assinatura" TEXT,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracoes_alerta" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "email_habilitado" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp_habilitado" BOOLEAN NOT NULL DEFAULT false,
    "popup_habilitado" BOOLEAN NOT NULL DEFAULT true,
    "delay_email_minutos" INTEGER NOT NULL DEFAULT 0,
    "intervalo_whatsapp_seg" INTEGER NOT NULL DEFAULT 30,
    "smtp_host" TEXT,
    "smtp_porta" INTEGER,
    "smtp_usuario" TEXT,
    "smtp_senha" TEXT,
    "smtp_remetente" TEXT,
    "smtp_criptografia" TEXT,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracoes_alerta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_execucao" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mensagem" TEXT,
    "detalhes" JSONB,
    "iniciado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizado_em" TIMESTAMP(3),

    CONSTRAINT "logs_execucao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "despachos_processo_idx" ON "despachos"("processo");

-- CreateIndex
CREATE INDEX "despachos_codigo_idx" ON "despachos"("codigo");

-- CreateIndex
CREATE INDEX "prazos_status_data_limite_idx" ON "prazos"("status", "data_limite");

-- CreateIndex
CREATE UNIQUE INDEX "edicoes_rpi_numero_key" ON "edicoes_rpi"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "templates_usuario_id_key" ON "templates"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "configuracoes_alerta_usuario_id_key" ON "configuracoes_alerta"("usuario_id");

-- CreateIndex
CREATE INDEX "logs_execucao_tipo_iniciado_em_idx" ON "logs_execucao"("tipo", "iniciado_em");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcas_monitoradas" ADD CONSTRAINT "marcas_monitoradas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcas_monitoradas" ADD CONSTRAINT "marcas_monitoradas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despachos" ADD CONSTRAINT "despachos_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marcas_monitoradas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despachos" ADD CONSTRAINT "despachos_edicao_rpi_id_fkey" FOREIGN KEY ("edicao_rpi_id") REFERENCES "edicoes_rpi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prazos" ADD CONSTRAINT "prazos_despacho_id_fkey" FOREIGN KEY ("despacho_id") REFERENCES "despachos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracoes_alerta" ADD CONSTRAINT "configuracoes_alerta_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
