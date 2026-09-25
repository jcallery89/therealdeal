import Link from "next/link";
import NavTree from "./NavTree";
import SyncButton from "./SyncButton";

export default function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-slate-800 bg-slate-950/80 px-4 py-6 md:flex">
      <Link href="/" className="px-2">
        <div className="text-lg font-bold tracking-tight text-slate-100">🏈 League HQ</div>
        <div className="text-xs text-slate-500">Sleeper manager</div>
      </Link>

      <SyncButton />

      <NavTree />

      <div className="mt-auto px-3 text-[11px] leading-relaxed text-slate-600">
        Values: FantasyCalc &amp; KeepTradeCut.
        <br />
        Rosters sync from the Sleeper API.
      </div>
    </aside>
  );
}
