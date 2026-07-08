"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { apiFetch, clearTokens } from "@/lib/api";

interface OverdueRow {
  assigned_to: number;
  assigned_to_name: string;
  overdue_count: number;
  task_ids: number[];
}

export default function TasksPage() {
  const router = useRouter();
  const [rows, setRows] = useState<OverdueRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await apiFetch("/tasks/overdue-dashboard");
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
    setRows(await res.json());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell eyebrow="Кто просрочил" title="Просроченные таски">
      {error && (
        <p className="rise-in mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="rise-in overflow-hidden rounded-2xl border border-border" style={{ animationDelay: "60ms" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-3 font-medium">Исполнитель</th>
              <th className="px-4 py-3 font-medium">Просрочено задач</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.assigned_to} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{row.assigned_to_name}</td>
                <td className="px-4 py-3 font-mono-num font-semibold text-danger">
                  {row.overdue_count}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-ink-faint">
                  Просрочек нет. Команда красавцы.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
