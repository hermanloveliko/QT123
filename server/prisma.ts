import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL 未配置");
}

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });

