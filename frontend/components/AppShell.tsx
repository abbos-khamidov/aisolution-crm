"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";
import { decodeJwt } from "@/lib/jwt";
import Sidebar from "@/components/Sidebar";

const BACKDROP_LINES = [
  "сначала новые лиды",
  "каждый клиент под контролем",
  "команда видит главное",
  "быстро ответить",
  "закрыть сделку",
  "не теряем заявки",
  "aisolution CRM",
  "работаем спокойно",
];

const MOOD_LINES = [
  "Сегодня держим фокус: быстро ответить, аккуратно довести, не потерять ни одну заявку.",
  "CRM живая: лиды приходят, команда двигает проекты, история остается на месте.",
  "Меньше шума, больше действий: назначить, связаться, закрыть, перевести в проект.",
];

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
  const [moodIndex, setMoodIndex] = useState(0);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setRole(decodeJwt(token)?.role ?? null);
    setReady(true);
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMoodIndex((current) => (current + 1) % MOOD_LINES.length);
    }, 9000);
    return () => window.clearInterval(timer);
  }, []);

  if (!ready) return null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg">
      <div className="crm-live-backdrop" aria-hidden="true">
        <div className="crm-live-track">
          {[...BACKDROP_LINES, ...BACKDROP_LINES].map((line, index) => (
            <span key={`${line}-${index}`}>{line}</span>
          ))}
        </div>
        <div className="crm-live-track crm-live-track--slow">
          {[...BACKDROP_LINES].reverse().map((line, index) => (
            <span key={`${line}-slow-${index}`}>{line}</span>
          ))}
        </div>
      </div>
      <Sidebar role={role} />
      <main className="relative z-10 ml-60 min-h-screen px-8 py-8 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8 rise-in">
            {eyebrow && (
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink-faint">
                {eyebrow}
              </span>
            )}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
              <p className="max-w-xl rounded-full border border-border bg-surface/80 px-4 py-2 text-sm text-ink-dim shadow-sm backdrop-blur">
                {MOOD_LINES[moodIndex]}
              </p>
            </div>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
