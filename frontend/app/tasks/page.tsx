"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

  async function load() {
    const res = await apiFetch("/tasks/overdue-dashboard");
    if (res.status === 401) {
      clearTokens();
      router.push("/login");
      return;
    }
    setRows(await res.json());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Просроченные таски</h1>
        <Link href="/projects" className="text-sm text-gray-500 underline">
          Проекты
        </Link>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Исполнитель</th>
            <th>Просрочено задач</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.assigned_to} className="border-b">
              <td className="py-2">{row.assigned_to_name}</td>
              <td className="text-red-600">{row.overdue_count}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="py-4 text-gray-500">
                Просроченных задач нет.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
