"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createProfile, type CreateProfileState } from "@/app/actions";

const initialState: CreateProfileState = {};

export const inputClass =
  "w-full rounded-lg border border-sand bg-cream-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-coral focus:outline-none";
export const labelClass = "mb-1 block text-sm font-semibold text-ink";
export const helpClass = "mt-1 text-xs text-ink-soft";

export function ProfileForm() {
  const [state, formAction] = useActionState(createProfile, initialState);

  return (
    <form action={formAction} className="space-y-5 rounded-xl border border-sand bg-white p-6 shadow-sm">
      <div>
        <label className={labelClass} htmlFor="displayName">
          Name <span className="font-normal text-ink-soft">(optional)</span>
        </label>
        <input
          id="displayName"
          name="displayName"
          defaultValue={state.values?.displayName}
          placeholder="Your name"
          autoComplete="off"
          className={inputClass}
        />
        <p className={helpClass}>Leave blank and we&apos;ll use the name on your GitHub profile.</p>
      </div>

      <div>
        <label className={labelClass} htmlFor="githubUsername">
          GitHub username
        </label>
        <input
          id="githubUsername"
          name="githubUsername"
          defaultValue={state.values?.githubUsername}
          placeholder="e.g. antfu  or  https://github.com/antfu"
          autoComplete="off"
          spellCheck={false}
          className={inputClass}
        />
        <p className={helpClass}>We read your repo names, descriptions, READMEs and commit messages. Never the code.</p>
      </div>

      <div>
        <label className={labelClass} htmlFor="xHandle">
          X handle
        </label>
        <input
          id="xHandle"
          name="xHandle"
          defaultValue={state.values?.xHandle}
          placeholder="e.g. @antfu7  or  https://x.com/antfu7"
          autoComplete="off"
          spellCheck={false}
          className={inputClass}
        />
        <p className={helpClass}>Your last 400 posts become writing samples, so we write the way you actually write. Personal posts get filtered out.</p>
      </div>

      <div>
        <label className={labelClass} htmlFor="linkedinUrl">
          LinkedIn profile URL
        </label>
        <input
          id="linkedinUrl"
          name="linkedinUrl"
          defaultValue={state.values?.linkedinUrl}
          placeholder="https://www.linkedin.com/in/yourname/"
          autoComplete="off"
          className={inputClass}
        />
        <p className={helpClass}>Your last 50 LinkedIn posts become writing samples too.</p>
      </div>

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
              placeholder="https://…"
              autoComplete="off"
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
              placeholder="Paste notes, a bio, talk abstracts, anything about you…"
              className={`${inputClass} bg-white`}
            />
          </div>
        </div>
      </div>

      {state.error && <p className="rounded-lg bg-rose/10 px-3 py-2 text-sm text-rose">{state.error}</p>}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-coral px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-coral-dark disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create profile"}
    </button>
  );
}
