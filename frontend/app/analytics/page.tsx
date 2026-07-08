"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, clearTokens } from "@/lib/api";

interface FunnelRow {
  status: string;
  reached_count: number;
  avg_hours_in_status: number | null;
}
interface ConversionRow {
  source: string;
  total: number;
  won: number;
  conversion_pct: string | null;
}
interface LossReasonRow {
  loss_reason: string | null;
  count: number;
}
interface TeamLoadRow {
  user_id: number;
  user_name: string;
  total_tasks: number;
  overdue_tasks: number;
}
interface StaleLeadRow {
  id: number;
  name: string;
  status: string;
  days_since_activity: number;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [conversion, setConversion] = useState<ConversionRow[]>([]);
  const [lossReasons, setLossReasons] = useState<LossReasonRow[]>([]);
  const [teamLoad, setTeamLoad] = useState<TeamLoadRow[]>([]);
  const [staleLeads, setStaleLeads] = useState<StaleLeadRow[]>([]);

  useEffect(() => {
    (async () => {
      const paths = [
        "/analytics/funnel",
        "/analytics/conversion-by-source",
        "/analytics/loss-reasons",
        "/analytics/team-load",
        "/analytics/stale-leads",
      ];
      const results = await Promise.all(paths.map((p) => apiFetch(p)));

      if (results.some((r) => r.status === 401)) {
        clearTokens();
        router.push("/login");
        return;
      }
      if (results.some((r) => !r.ok)) {
        setError("Аналитика доступна только founder'у.");
        return;
      }

      const [funnelData, conversionData, lossData, loadData, staleData] = await Promise.all(
        results.map((r) => r.json())
      );
      setFunnel(funnelData.funnel);
      setConversion(conversionData);
      setLossReasons(lossData);
      setTeamLoad(loadData);
      setStaleLeads(staleData);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Аналитика</h1>
        <Link href="/projects" className="text-sm text-gray-500 underline">
          Проекты
        </Link>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {!error && (
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="mb-2 text-lg font-medium">Воронка</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Статус</th>
                  <th>Достигло лидов</th>
                  <th>Среднее время в статусе (ч)</th>
                </tr>
              </thead>
              <tbody>
                {funnel.map((row) => (
                  <tr key={row.status} className="border-b">
                    <td className="py-2">{row.status}</td>
                    <td>{row.reached_count}</td>
                    <td>{row.avg_hours_in_status?.toFixed(1) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">Конверсия по источникам</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Источник</th>
                  <th>Всего</th>
                  <th>Won</th>
                  <th>Конверсия %</th>
                </tr>
              </thead>
              <tbody>
                {conversion.map((row) => (
                  <tr key={row.source} className="border-b">
                    <td className="py-2">{row.source}</td>
                    <td>{row.total}</td>
                    <td>{row.won}</td>
                    <td>{row.conversion_pct ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">Причины отказа</h2>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {lossReasons.map((row) => (
                  <tr key={row.loss_reason ?? "unknown"} className="border-b">
                    <td className="py-2">{row.loss_reason ?? "—"}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
                {lossReasons.length === 0 && (
                  <tr>
                    <td className="py-2 text-gray-500">Отказов пока нет.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">Нагрузка команды</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Сотрудник</th>
                  <th>Всего задач</th>
                  <th>Просрочено</th>
                </tr>
              </thead>
              <tbody>
                {teamLoad.map((row) => (
                  <tr key={row.user_id} className="border-b">
                    <td className="py-2">{row.user_name}</td>
                    <td>{row.total_tasks}</td>
                    <td className={row.overdue_tasks > 0 ? "text-red-600" : undefined}>
                      {row.overdue_tasks}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">Дыры: лиды без активности &gt; 7 дней</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Лид</th>
                  <th>Статус</th>
                  <th>Дней без активности</th>
                </tr>
              </thead>
              <tbody>
                {staleLeads.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="py-2">{row.name}</td>
                    <td>{row.status}</td>
                    <td className="text-red-600">{row.days_since_activity}</td>
                  </tr>
                ))}
                {staleLeads.length === 0 && (
                  <tr>
                    <td className="py-2 text-gray-500">Зависших лидов нет.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </main>
  );
}
