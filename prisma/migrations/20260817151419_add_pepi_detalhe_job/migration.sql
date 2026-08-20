-- CreateTable
CREATE TABLE "pepi_detalhe_jobs" (
    "id" TEXT NOT NULL,
    "cod_pedido" TEXT NOT NULL,
    "processo" TEXT NOT NULL,
    "status" "StatusJobBusca" NOT NULL DEFAULT 'pendente',
    "etapa" TEXT,
    "resultado" JSONB,
    "erro" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizado_em" TIMESTAMP(3),

    CONSTRAINT "pepi_detalhe_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pepi_detalhe_jobs_status_criado_em_idx" ON "pepi_detalhe_jobs"("status", "criado_em");

-- CreateIndex
CREATE INDEX "pepi_detalhe_jobs_cod_pedido_status_finalizado_em_idx" ON "pepi_detalhe_jobs"("cod_pedido", "status", "finalizado_em");
