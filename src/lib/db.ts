import { PrismaClient } from "@prisma/client";

// One shared Prisma client. In development Next.js hot-reloads modules, so we
// keep the instance on `globalThis` to avoid opening a new SQLite connection on
// every reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
