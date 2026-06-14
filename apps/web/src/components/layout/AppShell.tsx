"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { SignedIn, SignedOut, UserButton, SignInButton } from "@clerk/nextjs";
import { useNotifications } from "@/hooks/useNotifications";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "⚡" },
  { href: "/teams", label: "Teams", icon: "🛡️" },
  { href: "/scrims", label: "Scrims", icon: "🎮" },
  { href: "/leaderboards", label: "Leaderboards", icon: "🏆" },
  { href: "/wallet", label: "Wallet", icon: "💎" },
  { href: "/notifications", label: "Notifications", icon: "🔔" },
  { href: "/activity", label: "Activity", icon: "📊" },
  { href: "/profile", label: "Profile", icon: "👤" },
];

function NavLink({ href, label, icon, onClick }: { href: string; label: string; icon: string; onClick: () => void }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
        isActive
          ? "bg-violet-600/20 text-violet-300 neon-border-violet border"
          : "text-slate-400 hover:text-white hover:bg-white/5"
      }`}
    >
      <span className="text-base w-5 text-center">{icon}</span>
      <span>{label}</span>
      {isActive && (
        <motion.div
          layoutId="nav-indicator"
          className="ml-auto w-1 h-4 rounded-full bg-violet-400"
        />
      )}
    </Link>
  );
}

function Sidebar({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-white/10">
        <Link href="/" onClick={onClose} className="block">
          <span className="text-xl font-black text-gradient-cyber">ZYTHERION</span>
          <p className="text-xs text-slate-500 mt-0.5">BGMI Esports Platform</p>
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} onClick={onClose} />
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <p className="text-xs text-slate-600 text-center">© 2026 Zytherion</p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { unreadCount } = useNotifications();

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-cyber-bg flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-56 xl:w-64 fixed inset-y-0 left-0 z-30 border-r border-white/10 bg-cyber-surface/80 backdrop-blur-md">
        <Sidebar onClose={() => undefined} />
      </aside>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 z-50 w-64 bg-cyber-surface border-r border-white/10 lg:hidden"
            >
              <Sidebar onClose={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main area */}
      <div className="flex-1 flex flex-col lg:ml-56 xl:ml-64">
        {/* Top Navbar */}
        <header className="sticky top-0 z-20 h-14 flex items-center px-4 gap-4 border-b border-white/10 bg-cyber-bg/90 backdrop-blur-md">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="lg:hidden flex-1">
            <span className="text-sm font-bold text-gradient-cyber">ZYTHERION</span>
          </div>

          <div className="hidden lg:block flex-1" />

          <div className="flex items-center gap-3">
            <SignedIn>
              <Link href="/notifications" className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-violet-600 text-white text-[10px] font-bold">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <button className="text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors px-3 py-1.5 rounded-lg border border-violet-600/40 hover:border-violet-500/60">
                  Sign In
                </button>
              </SignInButton>
            </SignedOut>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
