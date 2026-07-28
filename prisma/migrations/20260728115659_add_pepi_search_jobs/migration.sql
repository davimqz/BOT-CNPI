-- CreateEnum
CREATE TYPE "StatusJobBusca" AS ENUM ('pendente', 'executando', 'sucesso', 'erro');

-- CreateTable
CREATE TABLE "pepi_search_jobs" (
    "id" TEXT NOT NULL,
    "termo" TEXT NOT NULL,
    "tipo_busca" "TipoBusca" NOT NULL,
    "classe_ncl" TEXT,
    "status" "StatusJobBusca" NOT NULL DEFAULT 'pendente',
    "etapa" TEXT,
    "resultado" JSONB,
    "erro" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizado_em" TIMESTAMP(3),

    CONSTRAINT "pepi_search_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pepi_search_jobs_status_criado_em_idx" ON "pepi_search_jobs"("status", "criado_em");
