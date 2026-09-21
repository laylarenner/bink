"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import type { Source } from "@prisma/client";
import {
  deleteProfile,
  runEverything,
  runGithubScrape,
  runLinkedinScrape,
  runSummary,
  runXScrape,
  updateProfileInputs,
} from "@/app/actions";
import { GithubIcon, LinkedinIcon, XIcon } from "@/components/HomeIcons";
import { helpClass, inputClass, labelClass } from "@/components/profile-form";
import { RunButton } from "@/components/run-button";
import { timeAgo, yearMonth } from "@/lib/format";
import type { GithubData } from "@/lib/github";
import type { ProfileWithSources } from "./ProfileDetail";
import WritingSamplesList from "./WritingSamplesList";
import ConnectAccounts from "./ConnectAccounts";

function SaveButton({ justSaved }: { justSaved: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed ${
        justSaved && !pending ? "bg-sage-text" : "bg-coral hover:bg-coral-dark"
      }`}
    >
      {pending ? "Saving…" : justSaved ? "Saved ✓" : "Save details"}
    </button>
  );
}

function safeParse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export default function SourcesTab({ profile, isRequired }: { profile: ProfileWithSources; isRequired: boolean }) {
  const router = useRouter();
  const removeProfile = deleteProfile.bind(null, profile.id);

  const [state, formAction] = useActionState(
    async (_prev: { savedAt: number; error: string | null } | null, formData: FormData) => {
      const result = await updateProfileInputs(profile.id, formData);
      return { savedAt: Date.now(), error: result.ok ? null : result.message };
    },
    null,
  );

  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!state || state.error) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-dismissing "Saved" confirmation, not derived render state
    setJustSaved(true);
    const timeout = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(timeout);
  }, [state]);

  const github = profile.sources.find((s) => s.kind === "github");
  const x = profile.sources.find((s) => s.kind === "x");
  const linkedin = profile.sources.find((s) => s.kind === "linkedin");
  const githubData = safeParse<GithubData>(github?.rawJson);

  const anyHandle = Boolean(profile.githubUsername || profile.xHandle || profile.linkedinUrl);
  const hasFetched = profile.sources.some((s) => s.status === "done");
  const xInUse = profile.samples.filter((s) => s.platform === "x" && !s.excluded).length;
  const xLeftOut = profile.samples.filter((s) => s.platform === "x" && s.excluded).length;
  const liInUse = profile.samples.filter((s) => s.platform === "linkedin" && !s.excluded).length;
  const liLeftOut = profile.samples.filter((s) => s.platform === "linkedin" && s.excluded).length;

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-lg font-bold text-ink">Sources</h2>
        {isRequired ? (
          <p className="mt-1 rounded-lg border border-coral/40 bg-peach/40 px-3 py-2 text-sm text-coral-dark">
            Tell us where to look before we write anything. Your GitHub username, X handle or LinkedIn URL is enough
            to start. Fetch at least one to unlock the rest of the tool.
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">
            Everything we know about you comes from here. Add, change or refresh any of it anytime.
          </p>
        )}
      </div>

      {/* Build the profile */}
      {anyHandle && (
        <div className="rounded-lg border border-dashed border-coral/50 bg-cream-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                {!hasFetched ? "Ready to go?" : profile.summarizedAt ? "Something changed?" : "Sources are in."}
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {!hasFetched
                  ? "Fetches every connected account at the same time, then writes your profile. About 1 to 2 minutes."
                  : "Claude reads everything we kept and writes your profile in plain English. 20 to 60 seconds."}
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              {hasFetched && (
                <RunButton
                  action={runEverything.bind(null, profile.id)}
                  label="Re-fetch + rebuild"
                  pendingLabel="Re-fetching…"
                  hint="Fetching every account again, then rewriting the profile. 1 to 2 minutes."
                  size="sm"
                />
              )}
              <RunButton
                action={hasFetched ? runSummary.bind(null, profile.id) : runEverything.bind(null, profile.id)}
                label={!hasFetched ? "Build my profile" : profile.summarizedAt ? "Rebuild my profile" : "Build my profile"}
                pendingLabel={hasFetched ? "Writing…" : "Building…"}
                hint={
                  hasFetched
                    ? "Claude is reading everything and writing the profile. Keep this tab open."
                    : "Fetching sources, then writing the profile. Keep this tab open."
                }
                variant="primary"
                onDone={(r) => {
                  if (r.ok) router.replace(`/profile/${profile.id}?tab=Home`, { scroll: false });
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Connected accounts */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-soft">Connected accounts</h3>
        <div className="space-y-3">
          {profile.githubUsername && (
            <SourceCard
              icon={<GithubIcon className="h-4 w-4" />}
              title="GitHub"
              label={`github.com/${profile.githubUsername}`}
              source={github}
              summaryLine={
                githubData
                  ? `${githubData.repos.length} repos · ${githubData.detailedRepoCount} read in depth · ${githubData.externalPullRequests.length} PRs on other projects`
                  : "Not fetched yet"
              }
              button={
                <RunButton
                  action={runGithubScrape.bind(null, profile.id)}
                  label={github?.status === "done" ? "Refresh" : "Fetch GitHub"}
                  pendingLabel="Reading…"
                  hint="Reading repos, READMEs and commit messages. 10 to 30 seconds."
                  size="sm"
                />
              }
            >
              {githubData && githubData.repos.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-xs font-semibold text-coral-dark">What we read</summary>
                  <ul className="mt-2 space-y-1.5">
                    {githubData.repos.slice(0, githubData.detailedRepoCount).map((r) => (
                      <li key={r.fullName}>
                        <a href={r.url} target="_blank" rel="noreferrer" className="font-semibold text-ink hover:text-coral-dark hover:underline">
                          {r.name}
                        </a>
                        <span className="text-xs text-ink-soft">
                          {" "}
                          · ★{r.stars} · last push {yearMonth(r.pushedAt)}
                          {r.readme ? " · README" : ""}
                          {r.commitMessages.length ? ` · ${r.commitMessages.length} commits` : ""}
                        </span>
                        {r.description && <p className="text-xs text-ink-soft">{r.description}</p>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </SourceCard>
          )}

          {profile.xHandle && (
            <SourceCard
              icon={<XIcon className="h-4 w-4" />}
              title="X"
              label={`@${profile.xHandle}`}
              source={x}
              summaryLine={
                x?.status === "done"
                  ? `${xInUse} posts in use as writing samples${xLeftOut ? ` · ${xLeftOut} left out` : ""}`
                  : "Not fetched yet"
              }
              button={
                <RunButton
                  action={runXScrape.bind(null, profile.id)}
                  label={x?.status === "done" ? "Refresh" : "Fetch X posts"}
                  pendingLabel="Scraping…"
                  hint="Pulling your last 400 posts, then sorting personal from professional. 1 to 2 minutes."
                  size="sm"
                />
              }
            />
          )}

          {profile.linkedinUrl && (
            <SourceCard
              icon={<LinkedinIcon className="h-4 w-4" />}
              title="LinkedIn"
              label={profile.linkedinUrl.replace("https://www.", "")}
              source={linkedin}
              summaryLine={
                linkedin?.status === "done"
                  ? `${liInUse} posts in use as writing samples${liLeftOut ? ` · ${liLeftOut} left out` : ""}`
                  : "Not fetched yet"
              }
              button={
                <RunButton
                  action={runLinkedinScrape.bind(null, profile.id)}
                  label={linkedin?.status === "done" ? "Refresh" : "Fetch LinkedIn posts"}
                  pendingLabel="Scraping…"
                  hint="Pulling your last 50 posts, then sorting personal from professional. 1 to 3 minutes."
                  size="sm"
                />
              }
            />
          )}

          {!anyHandle && (
            <p className="rounded-xl border border-dashed border-sand bg-cream-soft px-4 py-5 text-sm text-ink-soft">
              Add a GitHub username, X handle or LinkedIn URL below and save. The account will show up here.
            </p>
          )}
        </div>
      </div>

      {/* Posting accounts */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-soft">Posting accounts</h3>
        <p className="mb-3 text-sm text-ink-soft">
          Separate from the accounts above. Those are for reading; this is the real LinkedIn account a
          post actually goes out to.
        </p>
        <ConnectAccounts profileId={profile.id} />
      </div>

      {/* Writing samples */}
      <WritingSamplesList samples={profile.samples} />

      {/* Details form */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-soft">Details</h3>
        <form action={formAction} className="space-y-5 rounded-xl border border-sand bg-white p-6 shadow-sm">
          <div>
            <label className={labelClass} htmlFor="displayName">
              Name
            </label>
            <input id="displayName" name="displayName" defaultValue={profile.displayName ?? ""} className={inputClass} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="githubUsername">
                GitHub username
              </label>
              <input
                id="githubUsername"
                name="githubUsername"
                defaultValue={profile.githubUsername ?? ""}
                placeholder="e.g. antfu"
                spellCheck={false}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="xHandle">
                X handle
              </label>
              <input
                id="xHandle"
                name="xHandle"
                defaultValue={profile.xHandle ?? ""}
                placeholder="e.g. @antfu7"
                spellCheck={false}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="linkedinUrl">
              LinkedIn profile URL
            </label>
            <input
              id="linkedinUrl"
              name="linkedinUrl"
              defaultValue={profile.linkedinUrl ?? ""}
              placeholder="https://www.linkedin.com/in/yourname/"
              className={inputClass}
            />
          </div>
          <p className={helpClass}>Change an account and it resets. Fetch it again afterwards.</p>

          <div className="rounded-lg border border-dashed border-sand bg-cream-soft/60 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Saved now, read in the next build step</p>
            <div className="mt-3 space-y-4">
              <div>
                <label className={labelClass} htmlFor="websiteUrl">
                  Website or blog
                </label>
                <input
                  id="websiteUrl"
                  name="websiteUrl"
                  defaultValue={profile.websiteUrl ?? ""}
                  placeholder="https://…"
                  className={`${inputClass} bg-white`}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="notes">
                  Anything else
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  defaultValue={profile.notes ?? ""}
                  placeholder="Paste notes, a bio, talk abstracts, anything about you…"
                  className={`${inputClass} bg-white`}
                />
              </div>
            </div>
          </div>

          {state?.error && <p className="rounded-lg bg-rose/10 px-3 py-2 text-xs text-rose">{state.error}</p>}
          <SaveButton justSaved={justSaved} />
        </form>
      </div>

      <div className="border-t border-sand pt-5">
        <form
          action={removeProfile}
          onSubmit={(e) => {
            if (!confirm(`Delete "${profile.displayName ?? "this profile"}" and everything we fetched for it?`)) {
              e.preventDefault();
            }
          }}
        >
          <button type="submit" className="text-sm font-semibold text-rose hover:underline">
            Delete this profile
          </button>
        </form>
      </div>
    </div>
  );
}

function SourceCard(props: {
  icon: React.ReactNode;
  title: string;
  label: string;
  source: Source | undefined;
  summaryLine: string;
  button: React.ReactNode;
  children?: React.ReactNode;
}) {
  const status = props.source?.status ?? "idle";
  return (
    <div className="min-w-0 rounded-xl border border-sand bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream-soft text-ink">{props.icon}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-ink">{props.title}</h4>
              <StatusPill status={status} />
            </div>
            <p className="truncate text-xs text-ink-soft">{props.label}</p>
            <p className="mt-1.5 text-sm text-ink">{props.summaryLine}</p>
            {props.source?.fetchedAt && <p className="text-xs text-ink-soft">Fetched {timeAgo(props.source.fetchedAt)}</p>}
          </div>
        </div>
        <div className="shrink-0">{props.button}</div>
      </div>
      {status === "error" && props.source?.error && (
        <p className="mt-3 break-words rounded-lg bg-rose/10 px-3 py-2 text-xs text-rose">{props.source.error}</p>
      )}
      {props.children}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    done: "bg-sage text-sage-text",
    error: "bg-rose/15 text-rose",
    idle: "bg-cream-soft text-ink-soft",
  };
  const labels: Record<string, string> = { done: "Fetched", error: "Failed", idle: "Not fetched" };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[status] ?? styles.idle}`}>{labels[status] ?? status}</span>;
}
