import { defineConfig } from "prisma/config";

try {
  require("dotenv").config();
} catch (_err) {
  // Ignorar si dotenv no está instalado localmente
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
