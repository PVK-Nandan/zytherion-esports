"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import type {
  Notification,
  NotificationsResponse,
} from "@/types/notification";

const POLL_INTERVAL_MS = 30_000;

export function useNotifications() {
  const { getToken } = useAuth();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const data = await apiRequest<NotificationsResponse>(
        "/notifications/me?limit=20",
        { token },
      );

      setNotifications(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
      // silently ignore
    }
  }, [getToken]);

  const markRead = useCallback(
    async (id: string) => {
      const token = await getToken();
      if (!token) return;

      await apiRequest(`/notifications/${id}/read`, {
        method: "PATCH",
        token,
      });

      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, read: true } : n,
        ),
      );

      setUnreadCount((c) => Math.max(0, c - 1));
    },
    [getToken],
  );

  const markAllRead = useCallback(async () => {
    const token = await getToken();
    if (!token) return;

    await apiRequest("/notifications/me/read-all", {
      method: "POST",
      token,
    });

    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true })),
    );

    setUnreadCount(0);
  }, [getToken]);

  useEffect(() => {
    setLoading(true);

    void fetchNotifications().finally(() => {
      setLoading(false);
    });

    timerRef.current = setInterval(() => {
      void fetchNotifications();
    }, POLL_INTERVAL_MS);

    const handleFocus = () => {
      void fetchNotifications();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchNotifications();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener(
      "visibilitychange",
      handleVisibility,
    );

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      window.removeEventListener("focus", handleFocus);
      document.removeEventListener(
        "visibilitychange",
        handleVisibility,
      );
    };
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    refetch: fetchNotifications,
  };
}