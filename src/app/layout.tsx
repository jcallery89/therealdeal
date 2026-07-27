import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/nav/Sidebar";

export const metadata: Metadata = {
  title: "League HQ — Sleeper Manager",
  description:
    "Roster analytics, trade evaluation, and dynasty strategy for The Real Deal and Dynasty leagues, synced live from Sleeper.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
