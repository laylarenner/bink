import { prisma } from "./db";
import { DEMO_MODE, DEMO_DAILY_LIMIT } from "./demoModeShared";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Every scrape and every AI-written draft costs real money on the demo's
 * own API keys, and this deployment is public. One shared daily counter per
 * guest keeps a single visitor (or a bot) from running up the bill. A no-op
 * outside demo mode, so the real, private deployment is never rate-limited.
 */
export async function consumeGuestCredit(guestId: string, cost = 1): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!DEMO_MODE) return { ok: true };

  const now = new Date();
  const usage = await prisma.guestUsage.upsert({
    where: { guestId },
    create: { guestId, count: 0, windowStart: now },
    update: {},
  });

  let { count, windowStart } = usage;
  if (now.getTime() - windowStart.getTime() > DAY_MS) {
    count = 0;
    windowStart = now;
  }

  if (count + cost > DEMO_DAILY_LIMIT) {
    return {
      ok: false,
      message: `This public demo caps usage at ${DEMO_DAILY_LIMIT} actions a day per visitor, to keep the API bill in check. Come back tomorrow, or clone the repo and run it with your own API keys.`,
    };
  }

  await prisma.guestUsage.update({ where: { guestId }, data: { count: count + cost, windowStart } });
  return { ok: true };
}
