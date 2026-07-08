"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

const COLOR_CLASSES: Record<Project["deadline_status"], string> = {
  green: "border-l-4 border-green-500",
  yellow: "border-l-4 border-yellow-500",
  red: "border-l-4 border-red-500",
  none: "border-l-4 border-gray-300",
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showAll, setShowAll] = useState(false);

  async function load() {
    const res = await apiFetch("/projects");
    if (res.status === 401) {
      clearTokens();
      router.push("/login");
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
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Проекты</h1>
        <div className="flex gap-3">
          <Link href="/leads" className="text-sm text-gray-500 underline">
            Лиды
          </Link>
          <button onClick={() => setShowAll((v) => !v)} className="text-sm underline">
            {showAll ? "Только активные" : "Показать все"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p) => (
          <div key={p.id} className={`rounded bg-white p-4 shadow ${COLOR_CLASSES[p.deadline_status]}`}>
            <div className="font-medium">{p.name}</div>
            <div className="text-xs text-gray-500">stage: {p.stage}</div>
            <div className="text-xs text-gray-500">
              deadline: {p.deadline ?? "—"} ({p.deadline_status})
            </div>
            {p.budget_total && (
              <div className="text-xs text-gray-500">
                budget: {p.budget_total} {p.currency}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
