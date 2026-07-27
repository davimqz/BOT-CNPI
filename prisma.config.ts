import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Neon em produção; Postgres do docker-compose.yml em dev offline.
    url: process.env.DATABASE_URL ?? '',
  },
});
