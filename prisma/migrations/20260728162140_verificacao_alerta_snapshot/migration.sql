-- AlterTable
ALTER TABLE "despachos" ADD COLUMN     "alerta_pendente" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "marcas_monitoradas" ADD COLUMN     "ultimo_snapshot_pepi" JSONB,
ADD COLUMN     "verificado_em" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "despachos_marca_id_alerta_pendente_idx" ON "despachos"("marca_id", "alerta_pendente");
