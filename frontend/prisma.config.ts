import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "lib/prisma/schema.prisma",
  migrations: {
    path: "lib/prisma/migrations",
  },
  datasource: {
    // Deliberately NOT using the `env()` helper here. `env()` throws
    // immediately if the variable is missing, which breaks `prisma
    // generate` during `docker build` — build time has no access to
    // docker-compose's runtime `environment:` values, so DATABASE_URL
    // genuinely isn't set yet at that point.
    //
    // `prisma generate` never needs a real connection, so the fallback
    // below is never actually used for anything. `prisma migrate deploy`
    // at container runtime gets the real value, since DATABASE_URL is
    // set correctly by then via docker-compose.yml.
    url:
      process.env.DATABASE_URL ??
      "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});