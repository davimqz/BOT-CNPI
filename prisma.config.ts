import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Usada só pelo CLI (migrate/studio). No Neon, migrations devem usar a conexão
    // direta (host sem "-pooler"); o runtime usa a pooled via adapter em src/lib/db.ts.
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? '',
  },
});
