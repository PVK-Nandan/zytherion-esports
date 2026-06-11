"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { getMyInvitations, acceptInvitation, declineInvitation } from "@/lib/teams";
import type { Invitation } from "@/types/team";

export function useInvitations() {
  const { getToken } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;
      const data = await getMyInvitations(token);
      setInvitations(data);
    } catch {
      setError("Failed to load invitations");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const accept = useCallback(
    async (id: string) => {
      const token = await getToken();
      if (!token) return;
      await acceptInvitation(id, token);
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
    },
    [getToken],
  );

  const decline = useCallback(
    async (id: string) => {
      const token = await getToken();
      if (!token) return;
      await declineInvitation(id, token);
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
    },
    [getToken],
  );

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { invitations, loading, error, accept, decline, refetch: fetch };
}
