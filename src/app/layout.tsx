import type { Metadata } from "next";
import { Suspense } from "react";
import { Baloo_2, Quicksand } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import CommandPalette from "@/components/CommandPalette";
import { getProfileNav } from "@/lib/profileNav";

const baloo = Baloo_2({ variable: "--font-baloo", subsets: ["latin"] });
const quicksand = Quicksand({ variable: "--font-quicksand", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bink",
  description: "Bink, your personal content strategist: personal-brand content for technical people who build a lot but never post about it.",
};

// The sidebar and command palette read live profile data on every request.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const profiles = await getProfileNav();

  return (
    <html lang="en" className={`${baloo.variable} ${quicksand.variable} h-full antialiased`}>
      <body className="min-h-full">
        <div className="flex min-h-screen flex-col lg:flex-row">
          <Suspense
            fallback={
              <div className="h-12 border-b border-sand bg-white/90 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r lg:bg-white/70" />
            }
          >
            <Sidebar profiles={profiles} />
          </Suspense>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
        <Suspense fallback={null}>
          <CommandPalette profiles={profiles} />
        </Suspense>
      </body>
    </html>
  );
}
