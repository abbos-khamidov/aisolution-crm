"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getToken } from "@/lib/api";
import { decodeJwt } from "@/lib/jwt";
import MoneyRain from "@/components/MoneyRain";
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

interface GoalState {
  year: number;
  currency: string;
  target_amount: string;
  current_amount: string;
  remaining_amount: string;
  percent: number;
}

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
  const [goal, setGoal] = useState<GoalState | null>(null);
  const [goalDraft, setGoalDraft] = useState("");
  const [goalSaving, setGoalSaving] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    const payload = decodeJwt(token);
    setRole(payload?.role ?? null);
    setReady(true);
    if (payload?.role === "founder") {
      apiFetch("/crm-goal")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          setGoal(data);
          setGoalDraft(data.target_amount === "0" ? "" : data.target_amount);
        })
        .catch(() => null);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMoodIndex((current) => (current + 1) % MOOD_LINES.length);
    }, 9000);
    return () => window.clearInterval(timer);
  }, []);

  if (!ready) return null;

  async function saveGoal() {
    if (!goalDraft.trim()) return;
    setGoalSaving(true);
    const res = await apiFetch("/crm-goal", {
      method: "PATCH",
      body: JSON.stringify({
        year: 2026,
        currency: goal?.currency ?? "USD",
        target_amount: goalDraft,
      }),
    });
    setGoalSaving(false);
    if (!res.ok) return;
    const data = await res.json();
    setGoal(data);
    setGoalDraft(data.target_amount);
  }

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
      <MoneyRain />
      <Sidebar role={role} />
      <main className="relative z-10 min-h-screen px-4 py-5 pb-28 sm:px-6 lg:ml-60 lg:px-12 lg:py-8 lg:pb-8">
        <div className="mx-auto max-w-6xl">
          <header className="mb-6 rise-in lg:mb-8">
            {role === "founder" && (
              <GoalBar
                goal={goal}
                draft={goalDraft}
                saving={goalSaving}
                onDraft={setGoalDraft}
                onSave={saveGoal}
              />
            )}
            <div className="mb-4 flex justify-end lg:mb-5">
              <Link href="/obsidian" className="obsidian-top-pulse inline-flex items-center gap-3 rounded-2xl border border-[#7c3aed]/30 bg-[#1b1231] px-3 py-2.5 text-white shadow-glow sm:px-4 sm:py-3">
                <span className="obsidian-gem obsidian-gem--small" />
                <span>
                  <span className="block font-display text-sm font-semibold">Obsidian?</span>
                  <span className="block text-[11px] text-white/65">мозг процессов</span>
                </span>
              </Link>
            </div>
            {eyebrow && (
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink-faint">
                {eyebrow}
              </span>
            )}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <h1 className="font-display text-xl font-bold text-ink sm:text-2xl">{title}</h1>
              <p className="max-w-xl rounded-2xl border border-border bg-surface/80 px-3 py-2 text-sm leading-5 text-ink-dim shadow-sm backdrop-blur sm:rounded-full sm:px-4">
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

function GoalBar({
  goal,
  draft,
  saving,
  onDraft,
  onSave,
}: {
  goal: GoalState | null;
  draft: string;
  saving: boolean;
  onDraft: (value: string) => void;
  onSave: () => void;
}) {
  const target = Number(goal?.target_amount ?? 0);
  const current = Number(goal?.current_amount ?? 0);
  const remaining = Number(goal?.remaining_amount ?? 0);
  const percent = goal?.percent ?? 0;
  const currency = goal?.currency ?? "USD";

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-accent/20 bg-white/88 p-4 shadow-glow backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-display text-lg font-semibold text-ink">Цель 2026 год</p>
          <p className="mt-1 text-sm text-ink-dim">
            Загружаем прогресс: {current.toLocaleString("ru-RU")} / {target.toLocaleString("ru-RU")} {currency}. Осталось {remaining.toLocaleString("ru-RU")} {currency}.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            placeholder="Поставь цель"
            inputMode="decimal"
            className="h-10 rounded-lg border border-border bg-bg px-3 text-sm text-ink outline-none focus:border-accent"
          />
          <button
            onClick={onSave}
            disabled={saving}
            className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Сохраняю" : "Изменить цель"}
          </button>
        </div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-surface-2">
        <div
          className="goal-progress-fill h-full rounded-full"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <p className="mt-2 text-right font-mono-num text-xs font-semibold text-accent-strong">
        {percent}% загружено
      </p>
    </section>
  );
}
