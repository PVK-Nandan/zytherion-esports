"use client";

import { useEffect, useRef } from "react";
import type { Notification } from "@/types/notification";
import { NotificationItem } from "./NotificationItem";

interface Props {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  open: boolean;
  onClose: () => void;
  onRead: (id: string) => void;
  onReadAll: () => void;
}

export function NotificationPanel({
  notifications,
  unreadCount,
  loading,
  open,
  onClose,
  onRead,
  onReadAll,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click (desktop)
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 md:hidden ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        aria-hidden
        onClick={onClose}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-label="Notifications"
        aria-modal="true"
        className={[
          // Base
          "bg-[#111318] border border-white/10 shadow-2xl z-50 flex flex-col overflow-hidden",
          // Desktop: dropdown anchored top-right
          "md:absolute md:right-0 md:top-full md:mt-2 md:w-96 md:rounded-xl md:max-h-[32rem]",
          // Mobile: full-height slide-in drawer from bottom
          "fixed bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl md:static",
          // Transition
          "transition-transform duration-300 ease-out",
          open
            ? "translate-y-0 md:translate-y-0"
            : "translate-y-full md:translate-y-0 md:hidden",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white">Notifications</h2>
            {unreadCount > 0 && (
              <span className="text-xs bg-orange-500 text-white rounded-full px-1.5 py-0.5 font-medium leading-none">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={onReadAll}
                className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1 -mr-1"
              aria-label="Close notifications"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 overscroll-contain">
          {loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
              Loading…
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10 text-gray-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              <p className="text-gray-500 text-sm">No notifications yet</p>
            </div>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li key={n.id} className="border-b border-white/5 last:border-0">
                  <NotificationItem notification={n} onRead={onRead} onClose={onClose} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
