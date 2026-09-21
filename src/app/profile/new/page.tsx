import Link from "next/link";
import { ProfileForm } from "@/components/profile-form";

export default function NewProfilePage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <Link href="/" className="text-sm text-ink-soft hover:text-coral hover:underline">
        ← Back
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold tracking-tight text-ink">New profile</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Tell us where to find you. Your GitHub username, X handle or LinkedIn URL is enough to start.
      </p>
      <ProfileForm />
    </main>
  );
}
