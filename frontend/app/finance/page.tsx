"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Финансы</h1>
        <div className="flex gap-3">
          <Link href="/projects" className="text-sm text-gray-500 underline">
            Проекты
          </Link>
          <Link href="/leads" className="text-sm text-gray-500 underline">
            Лиды
          </Link>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {summary && (
        <>
          <h2 className="mb-2 text-lg font-medium">По клиентам</h2>
          <table className="mb-8 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Клиент</th>
                <th>Invoiced</th>
                <th>Paid</th>
                <th>Overdue</th>
              </tr>
            </thead>
            <tbody>
              {summary.by_client.map((row) => (
                <tr key={row.client_id} className="border-b">
                  <td className="py-2">{row.client_name}</td>
                  <td>{row.invoiced}</td>
                  <td>{row.paid}</td>
                  <td className={Number(row.overdue) > 0 ? "text-red-600" : undefined}>
                    {row.overdue}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mb-2 text-lg font-medium">По месяцам</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Месяц</th>
                <th>Invoiced</th>
                <th>Paid</th>
              </tr>
            </thead>
            <tbody>
              {summary.by_month.map((row) => (
                <tr key={row.month} className="border-b">
                  <td className="py-2">{row.month}</td>
                  <td>{row.invoiced}</td>
                  <td>{row.paid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
