import type { Metadata } from "next";
import { AnimatedHero } from "@/components/dashboard/AnimatedHero";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { TournamentSection } from "@/components/dashboard/TournamentSection";
import type { Tournament, TournamentsResponse } from "@/types/tournament";

export const metadata: Metadata = {
  title: "Dashboard — Zytherion Esports",
  description: "Live tournaments, scrims and leaderboards for BGMI esports.",
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function fetchTournaments(status?: string): Promise<Tournament[]> {
  const url = `${API_URL}/tournaments${status ? `?status=${status}&limit=12` : "?limit=50"}`;
  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return [];
    const json: TournamentsResponse = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const [liveData, openData, allData] = await Promise.all([
    fetchTournaments("in_progress"),
    fetchTournaments("registration_open"),
    fetchTournaments(),
  ]);

  const completedData = allData.filter((t) => t.status === "completed").slice(0, 6);
  const totalCount = allData.length;

  return (
    <main className="min-h-screen bg-cyber-bg">
      {/* Hero */}
      <AnimatedHero />

      {/* Stats */}
      <StatsBar
        liveCount={liveData.length}
        openCount={openData.length}
        totalCount={totalCount}
      />

      {/* Divider */}
      <div className="max-w-6xl mx-auto px-4">
        <div className="h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
      </div>

      {/* Live / In-Progress */}
      <TournamentSection
        title="Live Now"
        subtitle="Tournaments currently in progress"
        tournaments={liveData}
        accentColor="violet"
        emptyMessage="No live tournaments right now. Check back soon."
      />

      {/* Open for Registration */}
      <TournamentSection
        title="Open Registration"
        subtitle="Join before spots fill up"
        tournaments={openData}
        accentColor="blue"
        emptyMessage="No open registrations at the moment."
      />

      {/* Recently Completed */}
      <TournamentSection
        title="Recently Completed"
        subtitle="Past tournaments and results"
        tournaments={completedData}
        accentColor="cyan"
        emptyMessage="No completed tournaments yet."
      />

      {/* Footer glow */}
      <div className="h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent mt-8" />
      <div className="text-center py-8 text-slate-700 text-xs tracking-widest uppercase">
        Zytherion Esports © 2026
      </div>
    </main>
  );
}
