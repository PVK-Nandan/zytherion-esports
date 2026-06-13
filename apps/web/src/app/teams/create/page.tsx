"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createTeam } from "@/lib/teams";

export default function CreateTeamPage() {
  const router = useRouter();
  const { getToken, isSignedIn } = useAuth();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description] = useState("");
  const [logoUrl] = useState("");
  const [slugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isSignedIn) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-gray-400">
          Please sign in to create a team.
        </p>
      </main>
    );
  }

  function deriveSlug(n: string) {
    return n
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function handleNameChange(value: string) {
    setName(value);

    if (!slugTouched) {
      setSlug(deriveSlug(value));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim() || !slug.trim()) {
      return;
    }

    try {
      setSubmitting(true);

      const token = await getToken();

      if (!token) {
        throw new Error("Not authenticated");
      }

      const team = await createTeam(
        {
          name: name.trim(),
          slug: slug.trim(),
          ...(description.trim()
            ? { description: description.trim() }
            : {}),
          ...(logoUrl.trim()
            ? { logoUrl: logoUrl.trim() }
            : {}),
        },
        token,
      );

      router.push(`/teams/${team.slug}`);
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0d0f14] text-white">
      <div className="mx-auto max-w-lg px-4 py-10">
        <h1 className="text-2xl font-bold mb-1">
          Create a team
        </h1>

        <p className="text-sm text-gray-400 mb-8">
          Build your squad and compete together.
        </p>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Team name <span className="text-red-400">*</span>
            </label>

            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Shadow Wolves"
              maxLength={50}
              required
              className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !name.trim() || !slug.trim()}
            className="w-full rounded-lg bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/40 disabled:cursor-not-allowed text-white font-semibold py-3 text-sm transition-colors"
          >
            {submitting ? "Creating…" : "Create team"}
          </button>
        </form>
      </div>
    </main>
  );
}