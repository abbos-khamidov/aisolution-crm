"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { GroupedBarChart, type ChartColor } from "@/components/Charts";
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
interface ManagerPerfRow {
  user_id: number;
  user_name: string;
  leads_owned: number;
  leads_won: number;
  conversion_pct: string | null;
  avg_first_response_hours: string | null;
  revenue_paid: string;
}
interface ChannelOverTimeRow {
  month: string;
  source: string;
  count: number;
}

const CHANNEL_COLORS: ChartColor[] = ["accent", "success", "spark", "danger"];

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
  const [managerPerf, setManagerPerf] = useState<ManagerPerfRow[]>([]);
  const [channelOverTime, setChannelOverTime] = useState<ChannelOverTimeRow[]>([]);

  useEffect(() => {
    (async () => {
      const paths = [
        "/analytics/funnel",
        "/analytics/conversion-by-source",
        "/analytics/loss-reasons",
        "/analytics/team-load",
        "/analytics/stale-leads",
        "/analytics/manager-performance",
        "/analytics/leads-by-channel-over-time",
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

      const [funnelData, conversionData, lossData, loadData, staleData, perfData, channelData] =
        await Promise.all(results.map((r) => r.json()));
      setFunnel(funnelData.funnel);
      setConversion(conversionData);
      setLossReasons(lossData);
      setTeamLoad(loadData);
      setStaleLeads(staleData);
      setManagerPerf(perfData);
      setChannelOverTime(channelData);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const channelMonths = Array.from(new Set(channelOverTime.map((r) => r.month))).sort();
  const channelSources = Array.from(new Set(channelOverTime.map((r) => r.source))).sort();
  const channelSeries = channelSources.map((source, i) => ({
    name: source,
    color: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
    values: channelMonths.map(
      (month) => channelOverTime.find((r) => r.month === month && r.source === source)?.count ?? 0
    ),
  }));

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

          <Section title="Лидерборд менеджеров" delay={165}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-3 font-medium">Менеджер</th>
                  <th className="px-4 py-3 font-medium">Лидов</th>
                  <th className="px-4 py-3 font-medium">Won</th>
                  <th className="px-4 py-3 font-medium">Конверсия</th>
                  <th className="px-4 py-3 font-medium">Ср. время ответа (ч)</th>
                  <th className="px-4 py-3 font-medium">Выручка (оплачено)</th>
                </tr>
              </thead>
              <tbody>
                {managerPerf.map((row) => (
                  <tr key={row.user_id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{row.user_name}</td>
                    <td className="px-4 py-3 font-mono-num text-ink-dim">{row.leads_owned}</td>
                    <td className="px-4 py-3 font-mono-num text-success">{row.leads_won}</td>
                    <td className="px-4 py-3 font-mono-num text-accent-strong">
                      {row.conversion_pct ?? "—"}%
                    </td>
                    <td className="px-4 py-3 font-mono-num text-ink-dim">
                      {row.avg_first_response_hours
                        ? Number(row.avg_first_response_hours).toFixed(1)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono-num text-success">
                      {Number(row.revenue_paid).toLocaleString("ru-RU")}
                    </td>
                  </tr>
                ))}
                {managerPerf.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-ink-faint">
                      Активных менеджеров пока нет.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          <section className="rise-in" style={{ animationDelay: "185ms" }}>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-faint">
              Каналы лидов по месяцам
            </h2>
            <GroupedBarChart categories={channelMonths} series={channelSeries} />
          </section>

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
