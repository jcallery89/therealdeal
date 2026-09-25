"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import NavTree from "./NavTree";
import SyncButton from "./SyncButton";

/** Phone/tablet navigation: sticky top bar with Sync and a slide-in drawer. */
export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change and lock background scroll while open.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-950/95 px-4 py-2.5 backdrop-blur">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          data-testid="mobile-menu-button"
          className="rounded-md border border-slate-700 px-2.5 py-1.5 text-slate-300"
        >
          ☰
        </button>
        <Link href="/" className="text-base font-bold text-slate-100">
          🏈 League HQ
        </Link>
        <div className="-mr-3">
          <SyncButton />
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div
            data-testid="mobile-drawer"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-5 overflow-y-auto border-r border-slate-800 bg-slate-950 px-4 py-5"
          >
            <div className="flex items-center justify-between px-2">
              <span className="text-lg font-bold text-slate-100">🏈 League HQ</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="text-xl text-slate-400"
              >
                ×
              </button>
            </div>
            <NavTree onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
