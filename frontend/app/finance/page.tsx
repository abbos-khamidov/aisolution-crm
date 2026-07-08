"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { apiFetch, clearTokens } from "@/lib/api";

interface ByClient {
  client_id: number;
  client_name: string;
  invoiced: string;
  paid: string;
  overdue: string;
}

interface ByMonth {
  month: string;
  invoiced: string;
  paid: string;
}

interface Summary {
  by_client: ByClient[];
  by_month: ByMonth[];
}

function money(v: string): string {
  return Number(v).toLocaleString("ru-RU");
}

export default function FinancePage() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await apiFetch("/finance/summary");
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
      setSummary(await res.json());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell eyebrow="Деньги любят счёт" title="Финансы">
      {error && (
        <p className="rise-in mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {summary && (
        <div className="flex flex-col gap-8">
          <section className="rise-in" style={{ animationDelay: "60ms" }}>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-faint">
              По клиентам
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th className="px-4 py-3 font-medium">Клиент</th>
                    <th className="px-4 py-3 font-medium">Выставлено</th>
                    <th className="px-4 py-3 font-medium">Оплачено</th>
                    <th className="px-4 py-3 font-medium">Просрочено</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.by_client.map((row) => (
                    <tr key={row.client_id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-ink">{row.client_name}</td>
                      <td className="px-4 py-3 font-mono-num text-ink-dim">{money(row.invoiced)}</td>
                      <td className="px-4 py-3 font-mono-num text-success">{money(row.paid)}</td>
                      <td
                        className={`px-4 py-3 font-mono-num ${
                          Number(row.overdue) > 0 ? "text-danger" : "text-ink-faint"
                        }`}
                      >
                        {money(row.overdue)}
                      </td>
                    </tr>
                  ))}
                  {summary.by_client.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-ink-faint">
                        Пока считать нечего.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rise-in" style={{ animationDelay: "120ms" }}>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-faint">
              По месяцам
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th className="px-4 py-3 font-medium">Месяц</th>
                    <th className="px-4 py-3 font-medium">Выставлено</th>
                    <th className="px-4 py-3 font-medium">Оплачено</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.by_month.map((row) => (
                    <tr key={row.month} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-ink">{row.month}</td>
                      <td className="px-4 py-3 font-mono-num text-ink-dim">{money(row.invoiced)}</td>
                      <td className="px-4 py-3 font-mono-num text-success">{money(row.paid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
