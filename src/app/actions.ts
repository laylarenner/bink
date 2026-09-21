"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { classifyPosts } from "@/lib/classify";
import { DEMO_MODE } from "@/lib/demoModeShared";
import { prisma } from "@/lib/db";
import { getGuestId } from "@/lib/guest";
import { consumeGuestCredit } from "@/lib/guestLimit";
import { fetchGithub, githubDigest, type GithubData } from "@/lib/github";
import {
  GITHUB_USERNAME_RE,
  X_HANDLE_RE,
  normalizeGithubUsername,
  normalizeLinkedinUrl,
  normalizeXHandle,
} from "@/lib/inputs";
import { fetchLinkedinPosts, type LinkedinData } from "@/lib/linkedin";
import { samplesDigest, type SamplePlatform } from "@/lib/samples";
import { summarizeProfile, summaryToText } from "@/lib/summarize";
import { fetchXPosts, type XData } from "@/lib/x";

export type ActionResult = {
  ok: boolean;
  message: string;
  /** One line per step, for multi-step actions like "Build profile". */
  steps?: { label: string; ok: boolean; message: string }[];
};

export type CreateProfileState = {
  error?: string;
  values?: { displayName: string; githubUsername: string; xHandle: string; linkedinUrl: string };
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function cleanUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

type Inputs = {
  displayName: string;
  githubUsername: string;
  xHandle: string;
  linkedinUrl: string | null;
  linkedinRaw: string;
  websiteUrl: string | null;
  notes: string | null;
};

function readInputs(formData: FormData): Inputs {
  const linkedinRaw = String(formData.get("linkedinUrl") ?? "").trim();
  return {
    displayName: String(formData.get("displayName") ?? "").trim(),
    githubUsername: normalizeGithubUsername(String(formData.get("githubUsername") ?? "")),
    xHandle: normalizeXHandle(String(formData.get("xHandle") ?? "")),
    linkedinUrl: normalizeLinkedinUrl(linkedinRaw),
    linkedinRaw,
    websiteUrl: cleanUrl(String(formData.get("websiteUrl") ?? "")),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

function validateInputs(i: Inputs): string | null {
  if (!i.githubUsername && !i.xHandle && !i.linkedinUrl) {
    return "Enter at least one of: a GitHub username, an X handle, or a LinkedIn profile URL.";
  }
  if (i.githubUsername && !GITHUB_USERNAME_RE.test(i.githubUsername)) {
    return `"${i.githubUsername}" does not look like a GitHub username.`;
  }
  if (i.xHandle && !X_HANDLE_RE.test(i.xHandle)) {
    return `"${i.xHandle}" does not look like an X handle (letters, numbers, underscore, max 15).`;
  }
  if (i.linkedinRaw && !i.linkedinUrl) {
    return `"${i.linkedinRaw}" does not look like a LinkedIn profile URL. It should look like linkedin.com/in/yourname.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Create / edit a profile
// ---------------------------------------------------------------------------
export async function createProfile(_prev: CreateProfileState, formData: FormData): Promise<CreateProfileState> {
  const i = readInputs(formData);
  const values = {
    displayName: i.displayName,
    githubUsername: String(formData.get("githubUsername") ?? ""),
    xHandle: String(formData.get("xHandle") ?? ""),
    linkedinUrl: i.linkedinRaw,
  };
  const error = validateInputs(i);
  if (error) return { error, values };

  const guestId = await getGuestId();
  const profile = await prisma.profile.create({
    data: {
      guestId,
      displayName: i.displayName || i.githubUsername || i.xHandle || "New profile",
      githubUsername: i.githubUsername || null,
      xHandle: i.xHandle || null,
      linkedinUrl: i.linkedinUrl,
      websiteUrl: i.websiteUrl,
      notes: i.notes,
      sources: {
        create: [
          ...(i.githubUsername ? [{ kind: "github", label: `github.com/${i.githubUsername}` }] : []),
          ...(i.xHandle ? [{ kind: "x", label: `@${i.xHandle}` }] : []),
          ...(i.linkedinUrl ? [{ kind: "linkedin", label: i.linkedinUrl.replace("https://www.", "") }] : []),
        ],
      },
    },
  });

  revalidatePath("/");
  redirect(`/profile/${profile.id}?tab=Sources`);
}

/** Saves edits to the inputs on the Sources tab (name, handles, links, notes). */
export async function updateProfileInputs(profileId: string, formData: FormData): Promise<ActionResult> {
  const profile = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!profile) return { ok: false, message: "Profile not found." };

  const i = readInputs(formData);
  const error = validateInputs(i);
  if (error) return { ok: false, message: error };

  await prisma.$transaction(async (tx) => {
    await tx.profile.update({
      where: { id: profileId },
      data: {
        displayName: i.displayName || i.githubUsername || i.xHandle || profile.displayName,
        githubUsername: i.githubUsername || null,
        xHandle: i.xHandle || null,
        linkedinUrl: i.linkedinUrl,
        websiteUrl: i.websiteUrl,
        notes: i.notes,
      },
    });

    // One Source row per connected account. A changed handle resets its row; a removed one deletes it.
    const accounts: { kind: string; value: string | null; previous: string | null; label: string; platform?: SamplePlatform }[] = [
      { kind: "github", value: i.githubUsername || null, previous: profile.githubUsername, label: `github.com/${i.githubUsername}` },
      { kind: "x", value: i.xHandle || null, previous: profile.xHandle, label: `@${i.xHandle}`, platform: "x" },
      { kind: "linkedin", value: i.linkedinUrl, previous: profile.linkedinUrl, label: (i.linkedinUrl ?? "").replace("https://www.", ""), platform: "linkedin" },
    ];
    for (const a of accounts) {
      if (a.value) {
        await tx.source.upsert({
          where: { profileId_kind: { profileId, kind: a.kind } },
          create: { profileId, kind: a.kind, label: a.label },
          update: a.previous !== a.value ? { label: a.label, status: "idle", error: null, rawJson: null, digest: null, itemCount: 0 } : {},
        });
        if (a.platform && a.previous !== a.value) {
          await tx.writingSample.deleteMany({ where: { profileId, platform: a.platform } });
        }
      } else {
        await tx.source.deleteMany({ where: { profileId, kind: a.kind } });
        if (a.platform) await tx.writingSample.deleteMany({ where: { profileId, platform: a.platform } });
      }
    }
  });

  revalidatePath(`/profile/${profileId}`);
  revalidatePath("/");
  return { ok: true, message: "Saved." };
}

export async function deleteProfile(profileId: string): Promise<void> {
  await prisma.profile.delete({ where: { id: profileId } });
  revalidatePath("/");
  redirect("/");
}

// ---------------------------------------------------------------------------
// Writing samples: save, classify, curate
// ---------------------------------------------------------------------------
type IncomingSample = {
  externalId: string;
  text: string;
  url: string | null;
  postedAt: string | null;
  likes: number;
  reposts: number;
  replies: number;
  isReply: boolean;
};

/**
 * Replaces the stored samples for one platform. Runs the personal/professional
 * filter, and remembers any ✕ / "use again" decisions the user made before.
 */
async function saveSamples(profileId: string, platform: SamplePlatform, incoming: IncomingSample[], displayName: string | null) {
  const prior = await prisma.writingSample.findMany({
    where: { profileId, platform, excludeReason: { in: ["manual", "kept"] } },
    select: { externalId: true, excluded: true, excludeReason: true },
  });
  const userDecisions = new Map(prior.map((p) => [p.externalId, p]));

  const verdicts = await classifyPosts(
    incoming.map((p) => ({ id: p.externalId, text: p.text })),
    { displayName, platform },
  );

  let autoExcluded = 0;
  const rows = incoming.map((p) => {
    const decision = userDecisions.get(p.externalId);
    const verdict = verdicts.get(p.externalId);
    let excluded = false;
    let excludeReason: string | null = null;
    const signal = verdict?.signal ?? (verdict ? 0 : 1);
    if (decision) {
      excluded = decision.excluded;
      excludeReason = decision.excludeReason;
    } else if (verdict && !verdict.professional) {
      excluded = true;
      excludeReason = "personal";
      autoExcluded++;
    }
    return {
      profileId,
      platform,
      externalId: p.externalId,
      text: p.text,
      url: p.url,
      postedAt: p.postedAt ? new Date(p.postedAt) : null,
      likes: p.likes,
      reposts: p.reposts,
      replies: p.replies,
      isReply: p.isReply,
      excluded,
      excludeReason,
      signal,
    };
  });

  await prisma.$transaction([
    prisma.writingSample.deleteMany({ where: { profileId, platform } }),
    prisma.writingSample.createMany({ data: rows }),
  ]);

  return {
    total: rows.length,
    inUse: rows.filter((r) => !r.excluded).length,
    strong: rows.filter((r) => !r.excluded && r.signal >= 3).length,
    autoExcluded,
    classified: verdicts.size > 0,
  };
}

export async function setSampleExcluded(sampleId: string, excluded: boolean): Promise<ActionResult> {
  const sample = await prisma.writingSample.update({
    where: { id: sampleId },
    data: { excluded, excludeReason: excluded ? "manual" : "kept" },
  });
  revalidatePath(`/profile/${sample.profileId}`);
  return { ok: true, message: excluded ? "Left out." : "Back in." };
}

// ---------------------------------------------------------------------------
// Scrapers. Each one runs behind its own button with a loading state.
// ---------------------------------------------------------------------------
async function saveSourceError(profileId: string, kind: string, label: string | null, message: string) {
  await prisma.source.upsert({
    where: { profileId_kind: { profileId, kind } },
    create: { profileId, kind, label, status: "error", error: message },
    update: { status: "error", error: message },
  });
}

async function saveSourceDone(profileId: string, kind: string, label: string, rawJson: unknown, digest: string | null, itemCount: number) {
  await prisma.source.upsert({
    where: { profileId_kind: { profileId, kind } },
    create: { profileId, kind, label, status: "done", rawJson: JSON.stringify(rawJson), digest, itemCount, fetchedAt: new Date() },
    update: { label, status: "done", rawJson: JSON.stringify(rawJson), digest, itemCount, error: null, fetchedAt: new Date() },
  });
}

function samplesMessage(
  platformLabel: string,
  r: { total: number; inUse: number; strong: number; autoExcluded: number; classified: boolean },
  skipped: number,
) {
  const parts = [`Kept ${r.inUse} ${platformLabel} posts as writing samples${r.strong ? `, ${r.strong} of them directly about your work or business` : ""}.`];
  if (r.autoExcluded > 0) parts.push(`${r.autoExcluded} looked personal and were left out (bring any back below).`);
  if (skipped > 0) parts.push(`${skipped} reposts skipped.`);
  if (!r.classified) parts.push("Personal/professional filter did not run this time.");
  return parts.join(" ");
}

export async function runGithubScrape(profileId: string): Promise<ActionResult> {
  const gate = await consumeGuestCredit(await getGuestId());
  if (!gate.ok) return { ok: false, message: gate.message };
  const profile = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!profile) return { ok: false, message: "Profile not found." };
  if (!profile.githubUsername) return { ok: false, message: "This profile has no GitHub username." };

  const label = `github.com/${profile.githubUsername}`;
  try {
    const data: GithubData = await fetchGithub(profile.githubUsername);
    await saveSourceDone(profileId, "github", label, data, githubDigest(data), data.repos.length);
    await prisma.profile.update({
      where: { id: profileId },
      data: {
        displayName: data.user.name ?? profile.displayName,
        websiteUrl: profile.websiteUrl ?? data.user.blog ?? undefined,
      },
    });
    revalidatePath(`/profile/${profileId}`);
    revalidatePath("/");
    return {
      ok: true,
      message:
        data.repos.length === 0
          ? "This account has no public repositories of its own."
          : `Read ${data.repos.length} repositories (${data.detailedRepoCount} in depth) and ${data.externalPullRequests.length} pull requests to other projects.`,
    };
  } catch (err) {
    const message = errorMessage(err);
    await saveSourceError(profileId, "github", label, message);
    revalidatePath(`/profile/${profileId}`);
    return { ok: false, message };
  }
}

export async function runXScrape(profileId: string): Promise<ActionResult> {
  const gate = await consumeGuestCredit(await getGuestId());
  if (!gate.ok) return { ok: false, message: gate.message };
  const profile = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!profile) return { ok: false, message: "Profile not found." };
  if (!profile.xHandle) return { ok: false, message: "This profile has no X handle." };

  const label = `@${profile.xHandle}`;
  try {
    const data: XData = await fetchXPosts(profile.xHandle, 400);
    const saved = await saveSamples(
      profileId,
      "x",
      data.posts.map((p) => ({
        externalId: p.id,
        text: p.text,
        url: p.url,
        postedAt: p.postedAt,
        likes: p.likes,
        reposts: p.reposts,
        replies: p.replies,
        isReply: p.isReply,
      })),
      profile.displayName,
    );
    await saveSourceDone(profileId, "x", label, data, null, saved.inUse);
    revalidatePath(`/profile/${profileId}`);
    revalidatePath("/");
    return { ok: true, message: samplesMessage("X", saved, data.retweetsRemoved) };
  } catch (err) {
    const message = errorMessage(err);
    await saveSourceError(profileId, "x", label, message);
    revalidatePath(`/profile/${profileId}`);
    return { ok: false, message };
  }
}

export async function runLinkedinScrape(profileId: string): Promise<ActionResult> {
  const gate = await consumeGuestCredit(await getGuestId());
  if (!gate.ok) return { ok: false, message: gate.message };
  const profile = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!profile) return { ok: false, message: "Profile not found." };
  if (!profile.linkedinUrl) return { ok: false, message: "This profile has no LinkedIn URL." };

  const label = profile.linkedinUrl.replace("https://www.", "");
  try {
    const data: LinkedinData = await fetchLinkedinPosts(profile.linkedinUrl, 50);
    const saved = await saveSamples(
      profileId,
      "linkedin",
      data.posts.map((p) => ({
        externalId: p.id,
        text: p.text,
        url: p.url || null,
        postedAt: p.postedAt,
        likes: p.likes,
        reposts: p.shares,
        replies: p.comments,
        isReply: false,
      })),
      profile.displayName,
    );
    await saveSourceDone(profileId, "linkedin", label, data, null, saved.inUse);
    revalidatePath(`/profile/${profileId}`);
    revalidatePath("/");
    return { ok: true, message: samplesMessage("LinkedIn", saved, data.repostsRemoved) };
  } catch (err) {
    const message = errorMessage(err);
    await saveSourceError(profileId, "linkedin", label, message);
    revalidatePath(`/profile/${profileId}`);
    return { ok: false, message };
  }
}

// ---------------------------------------------------------------------------
// Summary: hand everything we gathered to Claude
// ---------------------------------------------------------------------------
export async function runSummary(profileId: string): Promise<ActionResult> {
  const gate = await consumeGuestCredit(await getGuestId());
  if (!gate.ok) return { ok: false, message: gate.message };
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: {
      sources: { where: { status: "done" } },
      samples: { where: { excluded: false } },
    },
  });
  if (!profile) return { ok: false, message: "Profile not found." };

  const github = profile.sources.find((s) => s.kind === "github");
  const xDigest = profile.xHandle ? samplesDigest(profile.samples, "x", `@${profile.xHandle}`) : null;
  const linkedinDigest = profile.linkedinUrl ? samplesDigest(profile.samples, "linkedin", profile.displayName ?? profile.linkedinUrl) : null;

  if (!github && !xDigest && !linkedinDigest && !profile.notes) {
    return { ok: false, message: "Fetch at least one source first. There is nothing to summarize yet." };
  }

  try {
    const result = await summarizeProfile({
      displayName: profile.displayName,
      githubDigest: github?.digest ?? null,
      xDigest,
      linkedinDigest,
      notes: profile.notes,
    });

    await prisma.profile.update({
      where: { id: profileId },
      data: {
        summary: summaryToText(result.summary),
        summaryJson: JSON.stringify(result.summary),
        summarizedAt: new Date(),
      },
    });

    revalidatePath(`/profile/${profileId}`);
    revalidatePath("/");
    return {
      ok: true,
      message: `Your profile is written, from ${profile.samples.length} writing samples${github ? " and GitHub" : ""}.`,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// One button that does everything: fetch all sources in parallel, then summarize
// ---------------------------------------------------------------------------
export async function runEverything(profileId: string): Promise<ActionResult> {
  const profile = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!profile) return { ok: false, message: "Profile not found." };

  const [github, x, linkedin] = await Promise.all([
    profile.githubUsername ? runGithubScrape(profileId) : Promise.resolve(null),
    profile.xHandle ? runXScrape(profileId) : Promise.resolve(null),
    profile.linkedinUrl ? runLinkedinScrape(profileId) : Promise.resolve(null),
  ]);

  const steps: NonNullable<ActionResult["steps"]> = [];
  if (github) steps.push({ label: "GitHub", ...github });
  if (x) steps.push({ label: "X posts", ...x });
  if (linkedin) steps.push({ label: "LinkedIn posts", ...linkedin });

  if (!steps.some((s) => s.ok)) {
    return { ok: false, message: "No source could be fetched, so no profile was written.", steps };
  }

  const summary = await runSummary(profileId);
  steps.push({ label: "Profile", ...summary });

  return {
    ok: summary.ok,
    message: summary.ok ? "Done. The profile is on the Home tab." : "Sources fetched, but writing the profile failed.",
    steps,
  };
}

// ---------------------------------------------------------------------------
// Strategy chat
// ---------------------------------------------------------------------------
import { extractText } from "@/lib/extractText";
import { runStrategyTurn, type StrategyChatMessage } from "@/lib/strategy";
import { buildStrategyContext } from "@/lib/strategyContext";

export type SendStrategyMessageResult = {
  reply: string;
  saved: boolean;
};

export async function sendStrategyMessage(profileId: string, formData: FormData): Promise<SendStrategyMessageResult> {
  const gate = await consumeGuestCredit(await getGuestId());
  if (!gate.ok) throw new Error(gate.message);
  const message = String(formData.get("message") ?? "").trim();
  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: { messages: { orderBy: { createdAt: "asc" } }, uploads: true, research: { where: { status: "kept" } } },
  });
  if (!profile) throw new Error("Profile not found.");

  // Extract and save any uploaded files first, so they are in context for this turn.
  const newUploads: { name: string; chars: number }[] = [];
  const extractedTexts: string[] = [];
  for (const file of files) {
    try {
      const extracted = await extractText(file);
      await prisma.upload.create({
        data: { profileId, name: extracted.name, mimeType: extracted.mimeType, text: extracted.text, chars: extracted.chars },
      });
      newUploads.push({ name: extracted.name, chars: extracted.chars });
      extractedTexts.push(`${extracted.name}:\n${extracted.text}`);
    } catch (err) {
      extractedTexts.push(`${file.name}: could not be read (${errorMessage(err)})`);
    }
  }

  const userText =
    [message, extractedTexts.length ? `[Attached: ${extractedTexts.map((t) => t.split(":")[0]).join(", ")}]` : ""]
      .filter(Boolean)
      .join("\n\n") || "(sent an attachment with no message)";
  const modelInputText = [message, ...extractedTexts].filter(Boolean).join("\n\n---\n\n");

  const allUploads = await prisma.upload.findMany({ where: { profileId } });
  const context = buildStrategyContext(profile, allUploads, profile.research);

  const history: StrategyChatMessage[] = [
    ...profile.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: modelInputText },
  ];

  await prisma.strategyMessage.create({
    data: { profileId, role: "user", content: userText, attachments: newUploads.length ? JSON.stringify(newUploads) : null },
  });

  const result = await runStrategyTurn(context, history);

  await prisma.strategyMessage.create({ data: { profileId, role: "assistant", content: result.reply } });

  if (result.saved) {
    await prisma.profile.update({
      where: { id: profileId },
      data: {
        positioning: result.saved.positioning,
        pillars: JSON.stringify(result.saved.pillars),
        topics: JSON.stringify(result.saved.topics),
        audience: result.saved.audience ?? null,
        strategyUpdatedAt: new Date(),
      },
    });
  }

  revalidatePath(`/profile/${profileId}`);
  revalidatePath("/");
  return { reply: result.reply, saved: Boolean(result.saved) };
}

/**
 * First message of a fresh chat: the strategist opens on its own, no user input yet.
 *
 * Two page loads can both see an empty chat and both call this at once, so the
 * actual opening is claimed atomically first. Whoever loses the race just waits
 * for the winner's message to land, instead of both calling the model and both
 * writing a message (which is what used to duplicate the opening line).
 */
export async function startStrategyChat(profileId: string): Promise<SendStrategyMessageResult> {
  const gate = await consumeGuestCredit(await getGuestId());
  if (!gate.ok) throw new Error(gate.message);
  const claim = await prisma.profile.updateMany({
    where: { id: profileId, chatStartedAt: null },
    data: { chatStartedAt: new Date() },
  });

  if (claim.count === 0) {
    // Someone else (another tab, a fast reload) is opening this chat right now.
    for (let i = 0; i < 20; i++) {
      const existing = await prisma.strategyMessage.findFirst({ where: { profileId }, orderBy: { createdAt: "asc" } });
      if (existing) return { reply: existing.content, saved: false };
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("This chat is still starting. Reload the page in a moment.");
  }

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: { messages: true, uploads: true, research: { where: { status: "kept" } } },
  });
  if (!profile) throw new Error("Profile not found.");
  if (profile.messages.length > 0) return { reply: profile.messages[0].content, saved: false };

  const context = buildStrategyContext(profile, profile.uploads, profile.research);
  const result = await runStrategyTurn(context, [
    { role: "user", content: "(The user has not said anything yet. Open the conversation now, following your instructions.)" },
  ]);

  await prisma.strategyMessage.create({ data: { profileId, role: "assistant", content: result.reply } });
  revalidatePath(`/profile/${profileId}`);
  return { reply: result.reply, saved: false };
}

/**
 * Answers a user message that never got a reply (e.g. the server restarted, or the
 * network dropped, mid-turn). The message is already saved; this just finishes the turn.
 */
export async function continueStrategyChat(profileId: string): Promise<SendStrategyMessageResult> {
  const gate = await consumeGuestCredit(await getGuestId());
  if (!gate.ok) throw new Error(gate.message);
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: { messages: { orderBy: { createdAt: "asc" } }, uploads: true, research: { where: { status: "kept" } } },
  });
  if (!profile) throw new Error("Profile not found.");
  if (profile.messages.length === 0) throw new Error("Nothing to continue yet.");
  const last = profile.messages[profile.messages.length - 1];
  if (last.role !== "user") return { reply: last.content, saved: false };

  const context = buildStrategyContext(profile, profile.uploads, profile.research);
  const history: StrategyChatMessage[] = profile.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  const result = await runStrategyTurn(context, history);

  await prisma.strategyMessage.create({ data: { profileId, role: "assistant", content: result.reply } });
  if (result.saved) {
    await prisma.profile.update({
      where: { id: profileId },
      data: {
        positioning: result.saved.positioning,
        pillars: JSON.stringify(result.saved.pillars),
        topics: JSON.stringify(result.saved.topics),
        audience: result.saved.audience ?? null,
        strategyUpdatedAt: new Date(),
      },
    });
  }
  revalidatePath(`/profile/${profileId}`);
  return { reply: result.reply, saved: Boolean(result.saved) };
}

/** Edits made by hand on the Strategy tab (positioning, pillars, topics). */
export async function updateStrategyFields(profileId: string, formData: FormData): Promise<ActionResult> {
  const positioning = String(formData.get("positioning") ?? "").trim() || null;
  const audience = String(formData.get("audience") ?? "").trim() || null;
  let pillars: unknown;
  let topics: unknown;
  try {
    pillars = JSON.parse(String(formData.get("pillars") ?? "[]"));
    topics = JSON.parse(String(formData.get("topics") ?? "[]"));
  } catch {
    return { ok: false, message: "Could not read the pillars or topics you entered." };
  }

  await prisma.profile.update({
    where: { id: profileId },
    data: {
      positioning,
      audience,
      pillars: JSON.stringify(pillars),
      topics: JSON.stringify(topics),
      strategyUpdatedAt: new Date(),
    },
  });
  revalidatePath(`/profile/${profileId}`);
  revalidatePath("/");
  return { ok: true, message: "Saved." };
}

export async function addResearchTopicAsStrategyTopic(profileId: string, text: string): Promise<ActionResult> {
  const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { topics: true } });
  if (!profile) return { ok: false, message: "Profile not found." };
  let topics: string[] = [];
  try {
    const parsed = JSON.parse(profile.topics ?? "[]");
    if (Array.isArray(parsed)) topics = parsed.filter((t): t is string => typeof t === "string");
  } catch {
    topics = [];
  }
  if (!topics.includes(text)) topics.push(text);
  await prisma.profile.update({ where: { id: profileId }, data: { topics: JSON.stringify(topics) } });
  revalidatePath(`/profile/${profileId}`);
  return { ok: true, message: "Added to your topics." };
}

// ---------------------------------------------------------------------------
// Research: peer posts + news, both through the one generic Apify helper
// ---------------------------------------------------------------------------
import { searchNews, searchPeerPosts } from "@/lib/research";

export type RunResearchResult = ActionResult & { found: number };

export async function runPeerResearch(profileId: string): Promise<RunResearchResult> {
  const gate = await consumeGuestCredit(await getGuestId());
  if (!gate.ok) return { ok: false, message: gate.message, found: 0 };
  const profile = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!profile) return { ok: false, message: "Profile not found.", found: 0 };

  // `peerSearchQuery` (who counts as a peer, e.g. "GTM marketers") takes priority over
  // `topics` (what THIS person posts about, e.g. "vibe coding") — using topics here was
  // pulling in developers and AI trainers instead of actual marketing peers.
  let keywords: string[] = [];
  if (profile.peerSearchQuery) {
    keywords = profile.peerSearchQuery.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  } else {
    try {
      const t = JSON.parse(profile.topics ?? "[]");
      if (Array.isArray(t)) keywords = t.filter((x): x is string => typeof x === "string").slice(0, 3);
    } catch {
      keywords = [];
    }
  }
  let xHandles: string[] = [];
  let linkedinUrls: string[] = [];
  try {
    const h = JSON.parse(profile.peerXHandles ?? "[]");
    if (Array.isArray(h)) xHandles = h.filter((x): x is string => typeof x === "string");
  } catch {}
  try {
    const l = JSON.parse(profile.peerLinkedinUrls ?? "[]");
    if (Array.isArray(l)) linkedinUrls = l.filter((x): x is string => typeof x === "string");
  } catch {}

  if (keywords.length === 0 && xHandles.length === 0 && linkedinUrls.length === 0) {
    return {
      ok: false,
      message: "Say who counts as a peer above, or add specific accounts below, so we know who to look for.",
      found: 0,
    };
  }

  try {
    const outcome = await searchPeerPosts({ keywords, xHandles, linkedinUrls });
    const saved = await saveResearch(profileId, "peer_post", outcome.hits.map((h) => ({ ...h, kind: "peer_post" as const })));
    revalidatePath(`/profile/${profileId}`);
    const problemNote = outcome.problems.length ? ` ${outcome.problems.length} source(s) had trouble: ${outcome.problems[0]}` : "";
    return { ok: true, message: `Found ${saved} peer posts worth a look.${problemNote}`, found: saved };
  } catch (err) {
    return { ok: false, message: errorMessage(err), found: 0 };
  }
}

export async function runNewsResearch(profileId: string): Promise<RunResearchResult> {
  const gate = await consumeGuestCredit(await getGuestId());
  if (!gate.ok) return { ok: false, message: gate.message, found: 0 };
  const profile = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!profile) return { ok: false, message: "Profile not found.", found: 0 };

  let keywords: string[] = [];
  try {
    const rk = JSON.parse(profile.researchKeywords ?? "[]");
    if (Array.isArray(rk)) keywords = rk.filter((x): x is string => typeof x === "string");
  } catch {}
  if (keywords.length === 0) {
    try {
      const t = JSON.parse(profile.topics ?? "[]");
      if (Array.isArray(t)) keywords = t.filter((x): x is string => typeof x === "string").slice(0, 4);
    } catch {}
  }
  if (keywords.length === 0 && profile.positioning) keywords = [profile.positioning.slice(0, 60)];

  if (keywords.length === 0) {
    return { ok: false, message: "Add a few keywords below, or lock in a strategy first, so we know what to search for.", found: 0 };
  }

  try {
    const outcome = await searchNews(keywords, { perQuery: 8, sinceDays: 30 });
    const saved = await saveResearch(profileId, "article", outcome.hits.map((h) => ({ ...h, kind: "article" as const })));
    revalidatePath(`/profile/${profileId}`);
    const problemNote = outcome.problems.length ? ` ${outcome.problems[0]}` : "";
    return { ok: true, message: `Found ${saved} articles from the last 30 days.${problemNote}`, found: saved };
  } catch (err) {
    return { ok: false, message: errorMessage(err), found: 0 };
  }
}

async function saveResearch(
  profileId: string,
  kind: "peer_post" | "article",
  hits: { kind: "peer_post" | "article"; platform: string; query: string; title: string | null; text: string; url: string; author: string | null; likes: number; comments: number; publishedAt: string | null }[],
): Promise<number> {
  if (hits.length === 0) return 0;
  const existing = await prisma.researchItem.findMany({ where: { profileId, kind }, select: { url: true } });
  const known = new Set(existing.map((e) => e.url));
  const fresh = hits.filter((h) => !known.has(h.url)).slice(0, 60);
  if (fresh.length === 0) return 0;
  await prisma.researchItem.createMany({
    data: fresh.map((h) => ({
      profileId,
      kind: h.kind,
      platform: h.platform,
      query: h.query,
      title: h.title,
      text: h.text,
      url: h.url,
      author: h.author,
      likes: h.likes,
      comments: h.comments,
      publishedAt: h.publishedAt ? new Date(h.publishedAt) : null,
    })),
  });
  return fresh.length;
}

export async function setResearchStatus(itemId: string, status: "kept" | "dismissed" | "new"): Promise<ActionResult> {
  const item = await prisma.researchItem.update({ where: { id: itemId }, data: { status } });
  revalidatePath(`/profile/${item.profileId}`);
  return { ok: true, message: status === "kept" ? "Kept." : status === "dismissed" ? "Dismissed." : "Reset." };
}

export async function updatePeerAccounts(profileId: string, formData: FormData): Promise<ActionResult> {
  const xHandles = String(formData.get("peerXHandles") ?? "")
    .split(",")
    .map((s) => normalizeXHandle(s))
    .filter(Boolean);
  const linkedinUrls = String(formData.get("peerLinkedinUrls") ?? "")
    .split(",")
    .map((s) => normalizeLinkedinUrl(s))
    .filter((s): s is string => Boolean(s));
  const researchKeywords = String(formData.get("researchKeywords") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const peerSearchQuery = String(formData.get("peerSearchQuery") ?? "").trim() || null;

  await prisma.profile.update({
    where: { id: profileId },
    data: {
      peerXHandles: JSON.stringify(xHandles),
      peerLinkedinUrls: JSON.stringify(linkedinUrls),
      researchKeywords: JSON.stringify(researchKeywords),
      peerSearchQuery,
    },
  });
  revalidatePath(`/profile/${profileId}`);
  return { ok: true, message: "Saved." };
}

// ---------------------------------------------------------------------------
// Peer discovery: find who is posting in your niche, then scrape the ones you pick
// ---------------------------------------------------------------------------
import { discoverPeerProfiles, groundPeerSearchTerms, type PeerCandidate } from "@/lib/research";

export type DiscoverPeersResult = { ok: boolean; message: string; candidates: PeerCandidate[] };

export async function discoverPeers(profileId: string, formData?: FormData): Promise<DiscoverPeersResult> {
  const gate = await consumeGuestCredit(await getGuestId());
  if (!gate.ok) return { ok: false, message: gate.message, candidates: [] };
  const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { peerSearchQuery: true, summary: true } });
  if (!profile) return { ok: false, message: "Profile not found.", candidates: [] };

  const typed = String(formData?.get("query") ?? "").trim();
  const query = typed || profile.peerSearchQuery || "";
  if (!query) {
    return { ok: false, message: "Say who counts as a peer first, e.g. \"GTM marketers, growth marketers\".", candidates: [] };
  }
  const keywords = await groundPeerSearchTerms(query, profile.summary);

  if (typed && typed !== profile.peerSearchQuery) {
    await prisma.profile.update({ where: { id: profileId }, data: { peerSearchQuery: typed } });
  }

  try {
    const { candidates, problems } = await discoverPeerProfiles(keywords);
    const note = problems.length ? ` ${problems[0]}` : "";
    if (candidates.length === 0) {
      return { ok: false, message: `No one distinct turned up for those topics.${note}`, candidates: [] };
    }
    return { ok: true, message: `Found ${candidates.length} people posting about this.${note}`, candidates };
  } catch (err) {
    return { ok: false, message: errorMessage(err), candidates: [] };
  }
}

/** Scrapes the full post history for the peers the user picked from discoverPeers, and remembers them. */
export async function scrapeSelectedPeers(profileId: string, formData: FormData): Promise<RunResearchResult> {
  const gate = await consumeGuestCredit(await getGuestId());
  if (!gate.ok) return { ok: false, message: gate.message, found: 0 };
  const profile = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!profile) return { ok: false, message: "Profile not found.", found: 0 };

  let picked: PeerCandidate[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("candidates") ?? "[]"));
    if (Array.isArray(parsed)) picked = parsed;
  } catch {
    return { ok: false, message: "Could not read your selection.", found: 0 };
  }
  if (picked.length === 0) return { ok: false, message: "Pick at least one person first.", found: 0 };

  const xHandles = picked.filter((p) => p.platform === "x").map((p) => p.handle);
  const linkedinUrls = picked.filter((p) => p.platform === "linkedin").map((p) => p.handle);

  try {
    const outcome = await searchPeerPosts({ keywords: [], xHandles, linkedinUrls });
    const saved = await saveResearch(profileId, "peer_post", outcome.hits.map((h) => ({ ...h, kind: "peer_post" as const })));

    // Remember them, so a plain "Find peer posts" run picks them up automatically next time.
    const existingX = new Set(safeStringArray(profile.peerXHandles));
    const existingLi = new Set(safeStringArray(profile.peerLinkedinUrls));
    xHandles.forEach((h) => existingX.add(h));
    linkedinUrls.forEach((u) => existingLi.add(u));
    await prisma.profile.update({
      where: { id: profileId },
      data: { peerXHandles: JSON.stringify([...existingX]), peerLinkedinUrls: JSON.stringify([...existingLi]) },
    });

    revalidatePath(`/profile/${profileId}`);
    const problemNote = outcome.problems.length ? ` ${outcome.problems[0]}` : "";
    return { ok: true, message: `Pulled ${saved} posts from ${picked.length} people, and saved them as peers to watch.${problemNote}`, found: saved };
  } catch (err) {
    return { ok: false, message: errorMessage(err), found: 0 };
  }
}

function safeStringArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Content ideas: generated from the person's own work, the news, and peers
// ---------------------------------------------------------------------------
import { generateIdeas, reviseIdea } from "@/lib/ideas";

function strategyToText(profile: { positioning: string | null; audience: string | null; pillars: string | null; topics: string | null }): string | null {
  if (!profile.positioning) return null;
  const pillars = safeStringPairs(profile.pillars);
  const topics = safeStringArray(profile.topics);
  const lines = [`Positioning: ${profile.positioning}`];
  if (profile.audience) lines.push(`Audience: ${profile.audience}`);
  if (pillars.length) lines.push(`Pillars:\n${pillars.map((p) => `- ${p.name}: ${p.description}`).join("\n")}`);
  if (topics.length) lines.push(`Topics they want to cover:\n${topics.map((t) => `- ${t}`).join("\n")}`);
  return lines.join("\n\n");
}

function safeStringPairs(json: string | null): { name: string; description: string }[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((p): p is { name: string; description: string } => typeof p?.name === "string") : [];
  } catch {
    return [];
  }
}

function researchDigest(items: { title: string | null; text: string; url: string; author: string | null; likes: number; comments: number }[], limit: number): string | null {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => b.likes + b.comments - (a.likes + a.comments)).slice(0, limit);
  return sorted
    .map((r) => `- ${r.title ? `"${r.title}" ` : ""}${r.author ? `by ${r.author} ` : ""}(${r.url}): ${r.text.replace(/\s+/g, " ").trim().slice(0, 400)}`)
    .join("\n");
}

export type GenerateIdeasResult = ActionResult & { count: number };

export async function runGenerateIdeas(profileId: string): Promise<GenerateIdeasResult> {
  const gate = await consumeGuestCredit(await getGuestId());
  if (!gate.ok) return { ok: false, message: gate.message, count: 0 };
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: { research: { where: { status: { in: ["new", "kept"] } } } },
  });
  if (!profile) return { ok: false, message: "Profile not found.", count: 0 };
  if (!profile.pillars) return { ok: false, message: "Lock in a strategy first.", count: 0 };

  const news = profile.research.filter((r) => r.kind === "article");
  const peers = profile.research.filter((r) => r.kind === "peer_post");

  try {
    const { ideas } = await generateIdeas({
      profileSummaryText: profile.summary,
      strategyText: strategyToText(profile),
      newsDigest: researchDigest(news, 25),
      peerDigest: researchDigest(peers, 25),
    });

    if (ideas.length === 0) {
      return { ok: false, message: "Nothing came back. Try again, or fetch more news and peer posts first.", count: 0 };
    }

    const existing = await prisma.contentIdea.findMany({ where: { profileId }, select: { title: true } });
    const knownTitles = new Set(existing.map((e) => e.title.toLowerCase()));
    const fresh = ideas.filter((i) => !knownTitles.has(i.title.toLowerCase()));

    if (fresh.length > 0) {
      await prisma.contentIdea.createMany({
        data: fresh.map((i) => ({
          profileId,
          source: i.source,
          title: i.title,
          angle: i.angle,
          platform: i.platform,
          evidence: i.evidence,
          pillar: i.pillar ?? null,
          sourceUrl: i.sourceUrl ?? null,
          sourceTitle: i.sourceTitle ?? null,
        })),
      });
    }

    revalidatePath(`/profile/${profileId}`);
    const skipped = ideas.length - fresh.length;
    return {
      ok: true,
      message: `Added ${fresh.length} new ideas.${skipped ? ` (${skipped} looked like duplicates of ones you already have.)` : ""}`,
      count: fresh.length,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err), count: 0 };
  }
}

export async function setIdeaStatus(ideaId: string, status: "kept" | "dismissed" | "new"): Promise<ActionResult> {
  const idea = await prisma.contentIdea.update({ where: { id: ideaId }, data: { status } });
  revalidatePath(`/profile/${idea.profileId}`);
  return { ok: true, message: status === "kept" ? "Marked as one to use." : status === "dismissed" ? "Dismissed." : "Reset." };
}

export async function deleteIdea(ideaId: string): Promise<ActionResult> {
  const idea = await prisma.contentIdea.delete({ where: { id: ideaId } });
  revalidatePath(`/profile/${idea.profileId}`);
  return { ok: true, message: "Deleted." };
}

export type ReviseIdeaResult = ActionResult & {
  idea?: { title: string; angle: string; platform: string; pillar: string | null };
};

export async function reviseIdeaAction(ideaId: string, formData: FormData): Promise<ReviseIdeaResult> {
  const gate = await consumeGuestCredit(await getGuestId());
  if (!gate.ok) return { ok: false, message: gate.message };
  const instruction = String(formData.get("instruction") ?? "").trim();
  if (!instruction) return { ok: false, message: "Say what you want changed first." };

  const current = await prisma.contentIdea.findUnique({ where: { id: ideaId } });
  if (!current) return { ok: false, message: "That idea is gone." };

  try {
    const revised = await reviseIdea(
      { title: current.title, angle: current.angle, platform: current.platform, evidence: current.evidence, pillar: current.pillar },
      instruction,
    );
    const updated = await prisma.contentIdea.update({
      where: { id: ideaId },
      data: {
        title: revised.title,
        angle: revised.angle,
        platform: revised.platform,
        evidence: revised.evidence,
        pillar: revised.pillar ?? current.pillar,
      },
    });
    revalidatePath(`/profile/${current.profileId}`);
    return {
      ok: true,
      message: "Rewritten.",
      idea: { title: updated.title, angle: updated.angle, platform: updated.platform, pillar: updated.pillar },
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Drafts: turn a kept idea into an actual post, in their voice
// ---------------------------------------------------------------------------
import { generateDraft, type DraftPlatform } from "@/lib/drafts";

function opener(text: string, chars = 90): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > chars ? t.slice(0, chars) + "…" : t;
}

async function draftContext(profileId: string, platform: DraftPlatform) {
  const [profile, samples] = await Promise.all([
    prisma.profile.findUnique({ where: { id: profileId } }),
    prisma.writingSample.findMany({ where: { profileId, excluded: false }, orderBy: [{ signal: "desc" }, { likes: "desc" }] }),
  ]);
  if (!profile) throw new Error("Profile not found.");

  const samplePlatform = platform === "linkedin" ? "linkedin" : "x";
  const voiceSamples = samples.filter((s) => s.platform === samplePlatform).slice(0, 8).map((s) => s.text);
  // Dedup context spans both platforms — a post they already made on X still counts as "already said" on LinkedIn.
  const alreadyPosted = samples.slice(0, 80).map((s) => opener(s.text));

  let voiceTraits: string[] = [];
  if (profile.summaryJson) {
    try {
      const parsed = JSON.parse(profile.summaryJson);
      if (Array.isArray(parsed?.voiceTraits)) voiceTraits = parsed.voiceTraits.filter((t: unknown): t is string => typeof t === "string");
    } catch {}
  }

  return { profile, voiceSamples, alreadyPosted, voiceTraits, strategyText: strategyToText(profile) };
}

async function writeOneDraft(profileId: string, ideaId: string, platform: DraftPlatform, instruction?: string) {
  const idea = await prisma.contentIdea.findUnique({ where: { id: ideaId } });
  if (!idea) throw new Error("That idea is gone.");
  const ctx = await draftContext(profileId, platform);

  const result = await generateDraft({
    idea: { title: idea.title, angle: idea.angle, evidence: idea.evidence, source: idea.source, sourceTitle: idea.sourceTitle },
    platform,
    displayName: ctx.profile.displayName,
    voiceSamples: ctx.voiceSamples,
    alreadyPosted: ctx.alreadyPosted,
    voiceTraits: ctx.voiceTraits,
    strategyText: ctx.strategyText,
    instruction,
  });
  return { idea, result };
}

function ideaPlatforms(idea: { platform: string }): DraftPlatform[] {
  return idea.platform === "both" ? ["linkedin", "x"] : [idea.platform as DraftPlatform];
}

export type UseIdeaResult = ActionResult & { draftsWritten: number };

/** "Use" on a content idea: marks it kept AND writes the draft(s) for it right away. */
export async function markIdeaUsed(profileId: string, ideaId: string): Promise<UseIdeaResult> {
  const gate = await consumeGuestCredit(await getGuestId());
  if (!gate.ok) return { ok: false, message: gate.message, draftsWritten: 0 };
  const idea = await prisma.contentIdea.findUnique({ where: { id: ideaId }, include: { drafts: true } });
  if (!idea) return { ok: false, message: "That idea is gone.", draftsWritten: 0 };

  await prisma.contentIdea.update({ where: { id: ideaId }, data: { status: "kept" } });

  const platforms = ideaPlatforms(idea).filter((p) => !idea.drafts.some((d) => d.platform === p));
  if (platforms.length === 0) {
    revalidatePath(`/profile/${profileId}`);
    return { ok: true, message: "Marked as used. Drafts for this one are already on the Posts tab.", draftsWritten: 0 };
  }

  const errors: string[] = [];
  let written = 0;
  for (const platform of platforms) {
    try {
      const { result } = await writeOneDraft(profileId, ideaId, platform);
      await prisma.draft.create({ data: { profileId, ideaId, platform, text: result.text, model: result.model } });
      written++;
    } catch (err) {
      errors.push(`${platform === "linkedin" ? "LinkedIn" : "X"}: ${errorMessage(err)}`);
    }
  }

  revalidatePath(`/profile/${profileId}`);
  if (written === 0) {
    return { ok: false, message: `Marked as used, but writing the draft failed. ${errors[0] ?? ""}`, draftsWritten: 0 };
  }
  return {
    ok: true,
    message: `Marked as used. ${written} draft${written === 1 ? "" : "s"} ready on the Posts tab.${errors.length ? ` (${errors[0]})` : ""}`,
    draftsWritten: written,
  };
}

/** Writes (or re-writes) one platform's draft for an idea from the Posts tab. */
export async function writeDraftForIdea(profileId: string, ideaId: string, platform: DraftPlatform): Promise<ActionResult> {
  const gate = await consumeGuestCredit(await getGuestId());
  if (!gate.ok) return { ok: false, message: gate.message };
  try {
    const { result } = await writeOneDraft(profileId, ideaId, platform);
    const existing = await prisma.draft.findFirst({ where: { profileId, ideaId, platform } });
    if (existing) {
      await prisma.draft.update({ where: { id: existing.id }, data: { text: result.text, model: result.model } });
    } else {
      await prisma.draft.create({ data: { profileId, ideaId, platform, text: result.text, model: result.model } });
    }
    revalidatePath(`/profile/${profileId}`);
    return { ok: true, message: "Draft ready." };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export type RegenerateDraftResult = ActionResult & { text?: string };

export async function regenerateDraft(draftId: string, formData: FormData): Promise<RegenerateDraftResult> {
  const gate = await consumeGuestCredit(await getGuestId());
  if (!gate.ok) return { ok: false, message: gate.message };
  const draft = await prisma.draft.findUnique({ where: { id: draftId } });
  if (!draft) return { ok: false, message: "That draft is gone." };
  const instruction = String(formData.get("instruction") ?? "").trim() || undefined;

  try {
    let text: string;
    let model: string;
    if (draft.ideaId) {
      const { result } = await writeOneDraft(draft.profileId, draft.ideaId, draft.platform as DraftPlatform, instruction);
      text = result.text;
      model = result.model;
    } else {
      throw new Error("This draft has no idea behind it to rewrite from.");
    }
    await prisma.draft.update({ where: { id: draftId }, data: { text, model } });
    revalidatePath(`/profile/${draft.profileId}`);
    return { ok: true, message: "Rewritten.", text };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function updateDraftText(draftId: string, text: string): Promise<ActionResult> {
  const draft = await prisma.draft.update({ where: { id: draftId }, data: { text } });
  revalidatePath(`/profile/${draft.profileId}`);
  return { ok: true, message: "Saved." };
}

export async function deleteDraft(draftId: string): Promise<ActionResult> {
  const draft = await prisma.draft.delete({ where: { id: draftId } });
  revalidatePath(`/profile/${draft.profileId}`);
  return { ok: true, message: "Deleted." };
}

// ---------------------------------------------------------------------------
// Zernio: connecting real LinkedIn/X accounts and publishing approved drafts
// ---------------------------------------------------------------------------
import { headers } from "next/headers";
import {
  createZernioPost,
  createZernioProfile,
  disconnectZernioAccount,
  extractZernioPostId,
  extractZernioPostUrl,
  getZernioConnectUrl,
  getZernioPost,
  listZernioAccounts,
  ZernioApiError,
  ZERNIO_CONNECT_PLATFORMS,
  zernioPlatformFor,
  type ZernioAccount,
} from "@/lib/zernio";
import { nextBestTime } from "@/lib/schedule";

function friendlyZernioError(err: unknown, fallback: string): never {
  if (err instanceof ZernioApiError) {
    if (err.status === 402 || err.body?.code === "PAYMENT_REQUIRED") {
      throw new Error("That platform needs a payment method added on the Zernio account before it can connect. That's a one-time setup on zernio.com, not something wrong here.");
    }
    throw new Error(fallback);
  }
  throw err instanceof Error ? new Error(fallback) : new Error(fallback);
}

/** Creates the Zernio sub-profile behind the scenes the first time it's needed. No setup code, ever. */
async function ensureZernioProfile(profileId: string): Promise<string> {
  const profile = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!profile) throw new Error("Profile not found.");
  if (profile.zernioProfileId) return profile.zernioProfileId;

  const zernioProfileId = await createZernioProfile(profile.displayName ?? `Bink profile ${profileId.slice(0, 8)}`);
  await prisma.profile.update({ where: { id: profileId }, data: { zernioProfileId } });
  return zernioProfileId;
}

export type ListAccountsResult = { ok: boolean; message: string; accounts: ZernioAccount[] };

export async function listConnectedAccounts(profileId: string): Promise<ListAccountsResult> {
  if (DEMO_MODE) return { ok: false, message: "Real posting is turned off in this public demo.", accounts: [] };
  try {
    const zernioProfileId = await ensureZernioProfile(profileId);
    const accounts = await listZernioAccounts(zernioProfileId);
    return { ok: true, message: "", accounts };
  } catch (err) {
    if (err instanceof ZernioApiError) friendlyZernioError(err, "Couldn't load your connected accounts. Try refreshing.");
    return { ok: false, message: errorMessage(err), accounts: [] };
  }
}

export type ConnectUrlResult = { ok: boolean; message: string; url?: string };

export async function getConnectUrl(profileId: string, platform: string): Promise<ConnectUrlResult> {
  if (DEMO_MODE) return { ok: false, message: "Real posting is turned off in this public demo." };
  try {
    const zernioProfileId = await ensureZernioProfile(profileId);
    const requestHeaders = await headers();
    const origin = `${requestHeaders.get("x-forwarded-proto") ?? "http"}://${requestHeaders.get("host")}`;
    const callbackUrl = `${origin}/profile/${profileId}?tab=Posts&connected=${encodeURIComponent(platform)}`;
    const url = await getZernioConnectUrl(zernioProfileId, platform, callbackUrl);
    return { ok: true, message: "", url };
  } catch (err) {
    if (err instanceof ZernioApiError) {
      try {
        friendlyZernioError(err, "Couldn't start that connection. Try again in a moment.");
      } catch (friendly) {
        return { ok: false, message: errorMessage(friendly) };
      }
    }
    return { ok: false, message: errorMessage(err) };
  }
}

export async function disconnectAccount(profileId: string, accountId: string): Promise<ActionResult> {
  if (DEMO_MODE) return { ok: false, message: "Real posting is turned off in this public demo." };
  try {
    await disconnectZernioAccount(accountId);
    revalidatePath(`/profile/${profileId}`);
    return { ok: true, message: "Disconnected." };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export type PublishDraftResult = ActionResult & { scheduledFor?: string; postUrl?: string };

/**
 * The "approve and it's done" step: publishes (or schedules) a draft straight
 * to the person's real, connected account. Only ever called when the user
 * clicks the button themselves.
 */
export async function publishDraft(draftId: string, when: "now" | "best"): Promise<PublishDraftResult> {
  if (DEMO_MODE) return { ok: false, message: "Real posting is turned off in this public demo." };
  const draft = await prisma.draft.findUnique({ where: { id: draftId } });
  if (!draft) return { ok: false, message: "That draft is gone." };

  const profile = await prisma.profile.findUnique({ where: { id: draft.profileId } });
  if (!profile?.zernioProfileId) {
    return { ok: false, message: "Connect your accounts above first." };
  }

  const zernioPlatform = zernioPlatformFor(draft.platform);
  if (!zernioPlatform) return { ok: false, message: `"${draft.platform}" isn't a platform Bink can post to.` };

  try {
    const accounts = await listZernioAccounts(profile.zernioProfileId);
    const account = accounts.find((a) => a.platform === zernioPlatform);
    if (!account) {
      const label = ZERNIO_CONNECT_PLATFORMS.find((p) => p.platform === zernioPlatform)?.label ?? draft.platform;
      return { ok: false, message: `No connected ${label} account. Connect one above first.` };
    }

    const scheduledFor = when === "best" ? nextBestTime(draft.platform) : null;
    const response = await createZernioPost({ content: draft.text, platform: zernioPlatform, accountId: account.id, scheduledFor });
    // Only an immediate publish can have a live URL yet — a scheduled post hasn't gone out.
    let postUrl = scheduledFor ? null : extractZernioPostUrl(response);
    // Some platforms resolve the live URL a beat after publish, not in the create response itself.
    // One short wait-and-recheck, not a full poll loop, so this stays bounded.
    if (!postUrl && !scheduledFor) {
      const postId = extractZernioPostId(response);
      if (postId) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        try {
          postUrl = extractZernioPostUrl(await getZernioPost(postId));
        } catch {
          // leave postUrl null — "Posted" still stands, just without a QR code
        }
      }
    }

    await prisma.draft.update({
      where: { id: draftId },
      data: {
        status: scheduledFor ? "scheduled" : "posted",
        scheduledFor,
        postedAt: scheduledFor ? null : new Date(),
        postUrl,
        postError: null,
      },
    });
    revalidatePath(`/profile/${draft.profileId}`);
    return {
      ok: true,
      message: scheduledFor ? `Scheduled for ${scheduledFor.toLocaleString()}.` : "Posted.",
      scheduledFor: scheduledFor?.toISOString(),
      postUrl: postUrl ?? undefined,
    };
  } catch (err) {
    const message = errorMessage(err);
    await prisma.draft.update({ where: { id: draftId }, data: { status: "failed", postError: message } });
    revalidatePath(`/profile/${draft.profileId}`);
    return { ok: false, message };
  }
}
