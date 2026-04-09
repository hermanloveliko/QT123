import { PrismaPg } from "@prisma/adapter-pg";
import prismaPkg from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL 未配置");
}

const adapter = new PrismaPg({ connectionString });

const { PrismaClient } = prismaPkg as unknown as { PrismaClient: new (opts: any) => any };

export const prisma = new PrismaClient({ adapter });

