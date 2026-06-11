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
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isSignedIn) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-gray-400">Please sign in to create a team.</p>
      </main>
    );
  }

  function deriveSlug(n: string) {
    return n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(deriveSlug(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !slug.trim()) return;
    try {
      setSubmitting(true);
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const team = await createTeam(
        {
          name: name.trim(),
          slug: slug.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(logoUrl.trim() ? { logoUrl: logoUrl.trim() } : {}),
        },
        token,
      );
      router.push(`/teams/${team.slug}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0d0f14] text-white">
      <div className="mx-auto max-w-lg px-4 py-10">
        <h1 className="text-2xl font-bold mb-1">Create a team</h1>
        <p className="text-sm text-gray-400 mb-8">
          Build your squad and compete together.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Team name */}
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
              className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Team URL slug <span className="text-red-400">*</span>
            </label>
            <div className="flex items-center rounded-lg bg-white/5 border border-white/10 overflow-hidden focus-within:ring-2 focus-within:ring-orange-500/50 focus-within:border-orange-500/50">
              <span className="px-3 py-2.5 text-sm text-gray-500 border-r border-white/10 select-none">
                /teams/
              </span>
              <input
                type="text"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                }}
                placeholder="shadow-wolves"
                maxLength={32}
                required
                className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell players about your team..."
              maxLength={200}
              rows={3}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50"
            />
          </div>

          {/* Logo URL */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Logo URL
            </label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-4 py-2.5">
              {error}
            </p>
          )}

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
