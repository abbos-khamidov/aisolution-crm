"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
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

function Section({
  title,
  delay,
  children,
}: {
  title: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rise-in" style={{ animationDelay: `${delay}ms` }}>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-faint">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-border">{children}</div>
    </section>
  );
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
    <AppShell eyebrow="Цифры не врут" title="Аналитика">
      {error && (
        <p className="rise-in mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!error && (
        <div className="flex flex-col gap-8">
          <Section title="Воронка" delay={40}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-3 font-medium">Статус</th>
                  <th className="px-4 py-3 font-medium">Достигло лидов</th>
                  <th className="px-4 py-3 font-medium">Среднее время (ч)</th>
                </tr>
              </thead>
              <tbody>
                {funnel.map((row) => (
                  <tr key={row.status} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{row.status}</td>
                    <td className="px-4 py-3 font-mono-num text-accent-strong">
                      {row.reached_count}
                    </td>
                    <td className="px-4 py-3 font-mono-num text-ink-dim">
                      {row.avg_hours_in_status?.toFixed(1) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="Конверсия по источникам" delay={90}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-3 font-medium">Источник</th>
                  <th className="px-4 py-3 font-medium">Всего</th>
                  <th className="px-4 py-3 font-medium">Won</th>
                  <th className="px-4 py-3 font-medium">Конверсия</th>
                </tr>
              </thead>
              <tbody>
                {conversion.map((row) => (
                  <tr key={row.source} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{row.source}</td>
                    <td className="px-4 py-3 font-mono-num text-ink-dim">{row.total}</td>
                    <td className="px-4 py-3 font-mono-num text-success">{row.won}</td>
                    <td className="px-4 py-3 font-mono-num text-accent-strong">
                      {row.conversion_pct ?? "—"}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="Причины отказа" delay={140}>
            <table className="w-full text-sm">
              <tbody>
                {lossReasons.map((row) => (
                  <tr key={row.loss_reason ?? "unknown"} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-ink">{row.loss_reason ?? "без причины"}</td>
                    <td className="px-4 py-3 font-mono-num text-danger">{row.count}</td>
                  </tr>
                ))}
                {lossReasons.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-ink-faint">Отказов пока нет.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          <Section title="Нагрузка команды" delay={190}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-3 font-medium">Сотрудник</th>
                  <th className="px-4 py-3 font-medium">Всего задач</th>
                  <th className="px-4 py-3 font-medium">Просрочено</th>
                </tr>
              </thead>
              <tbody>
                {teamLoad.map((row) => (
                  <tr key={row.user_id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{row.user_name}</td>
                    <td className="px-4 py-3 font-mono-num text-ink-dim">{row.total_tasks}</td>
                    <td
                      className={`px-4 py-3 font-mono-num ${
                        row.overdue_tasks > 0 ? "text-danger" : "text-ink-faint"
                      }`}
                    >
                      {row.overdue_tasks}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="Дыры: лиды без активности > 7 дней" delay={240}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-3 font-medium">Лид</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                  <th className="px-4 py-3 font-medium">Дней без активности</th>
                </tr>
              </thead>
              <tbody>
                {staleLeads.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                    <td className="px-4 py-3 text-ink-dim">{row.status}</td>
                    <td className="px-4 py-3 font-mono-num text-danger">
                      {row.days_since_activity}
                    </td>
                  </tr>
                ))}
                {staleLeads.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-ink-faint">
                      Зависших лидов нет — всё живое.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>
        </div>
      )}
    </AppShell>
  );
}
