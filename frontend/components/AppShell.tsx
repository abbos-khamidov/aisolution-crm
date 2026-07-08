"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";
import { decodeJwt } from "@/lib/jwt";
import Sidebar from "@/components/Sidebar";

export default function AppShell({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setRole(decodeJwt(token)?.role ?? null);
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-bg">
      <Sidebar role={role} />
      <main className="ml-60 min-h-screen px-8 py-8 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8 rise-in">
            {eyebrow && (
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink-faint">
                {eyebrow}
              </span>
            )}
            <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
