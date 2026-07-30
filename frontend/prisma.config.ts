import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer reads `url = env("DATABASE_URL")` from schema.prisma
// for CLI operations like `migrate deploy`. The datasource URL has to
// live here instead. This file must sit at the current working directory
// when the CLI runs (see docker-entrypoint.sh, which cd's into the
// standalone output before invoking prisma).
export default defineConfig({
  schema: "lib/prisma/schema.prisma",
  migrations: {
    path: "lib/prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});