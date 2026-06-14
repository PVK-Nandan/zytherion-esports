"use client";

import { motion } from "framer-motion";

export function AnimatedHero() {
  return (
    <div className="relative overflow-hidden">
      {/* Cyber grid background */}
      <div className="absolute inset-0 cyber-grid-bg opacity-60" />

      {/* Radial gradient orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-neon-violet/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-neon-blue/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-4"
        >
          <span className="status-badge bg-neon-violet/20 text-violet-300 border border-violet-500/40 neon-border-violet">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse-slow" />
            BGMI Esports Platform
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-5xl sm:text-7xl font-black tracking-tight mb-4"
        >
          <span className="text-gradient-cyber">ZYTHERION</span>
          <br />
          <span className="text-white/90 text-4xl sm:text-5xl font-bold">ESPORTS</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-slate-400 text-lg max-w-xl mx-auto"
        >
          India&apos;s most trusted BGMI esports &amp; scrim platform.
          Compete. Dominate. Rise.
        </motion.p>

        {/* Decorative scan line */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.3, 0] }}
          transition={{ duration: 3, repeat: Infinity, delay: 1 }}
          className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-neon-blue to-transparent top-1/2 pointer-events-none"
        />
      </div>
    </div>
  );
}
