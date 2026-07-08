"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import Badge from "@/components/Badge";
import { apiFetch, clearTokens } from "@/lib/api";

interface Project {
  id: number;
  client_id: number;
  name: string;
  stage: string;
  owner_id: number | null;
  deadline: string | null;
  deadline_status: "green" | "yellow" | "red" | "none";
  budget_total: string | null;
  currency: string | null;
}

const ACTIVE_STAGES = new Set([
  "discovery",
  "proposal",
  "contract",
  "in_progress",
  "review",
  "paused",
]);

const DEADLINE_DOT: Record<Project["deadline_status"], string> = {
  green: "bg-success",
  yellow: "bg-spark",
  red: "bg-danger animate-pulse",
  none: "bg-ink-faint",
};

const DEADLINE_LABEL: Record<Project["deadline_status"], string> = {
  green: "в графике",
  yellow: "срок близко",
  red: "просрочен",
  none: "без срока",
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await apiFetch("/projects");
    if (res.status === 401) {
      clearTokens();
      router.push("/login");
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    setProjects(await res.json());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = showAll ? projects : projects.filter((p) => ACTIVE_STAGES.has(p.stage));

  return (
    <AppShell eyebrow="Работа в проектах" title="Проекты">
      <div className="rise-in mb-5 flex justify-end" style={{ animationDelay: "60ms" }}>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-ink-dim transition hover:text-ink"
        >
          {showAll ? "Только активные" : "Показать все"}
        </button>
      </div>

      {error && (
        <p className="rise-in mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p, i) => (
          <div
            key={p.id}
            className="rise-in rounded-2xl border border-border bg-surface p-5 transition hover:border-border-bright"
            style={{ animationDelay: `${100 + i * 40}ms` }}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3 className="font-display font-semibold leading-snug text-ink">{p.name}</h3>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DEADLINE_DOT[p.deadline_status]}`} />
            </div>
            <Badge label={p.stage} tone="accent" />
            <div className="mt-3 space-y-1 text-xs text-ink-dim">
              <p>
                {p.deadline ? `дедлайн ${p.deadline}` : "без дедлайна"} ·{" "}
                <span className="text-ink-faint">{DEADLINE_LABEL[p.deadline_status]}</span>
              </p>
              {p.budget_total && (
                <p className="font-mono-num text-ink">
                  {Number(p.budget_total).toLocaleString("ru-RU")} {p.currency}
                </p>
              )}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="col-span-full py-8 text-center text-ink-faint">
            Проектов не видно. Либо их нет, либо ты пока не в команде ни одного.
          </p>
        )}
      </div>
    </AppShell>
  );
}
