import { defineConfig, env } from '@prisma/config';

export default defineConfig({
  schema: 'lib/prisma/schema.prisma',
  datasource: {
    url: 'postgresql://rebit:rebit@localhost:5432/rebit',
  },
});