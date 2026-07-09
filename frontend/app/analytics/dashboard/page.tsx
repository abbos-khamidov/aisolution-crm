"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  LineChart,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { GroupedBarChart, HorizontalBars, type ChartColor } from "@/components/Charts";
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
interface StaleLeadRow {
  id: number;
  name: string;
  status: string;
  days_since_activity: number;
}
interface TeamLoadRow {
  user_id: number;
  user_name: string;
  total_tasks: number;
  overdue_tasks: number;
}
interface CashFlowMonth {
  month: string;
  invoiced: string;
  paid: string;
  expenses: string;
  net: string;
}
interface CashFlow {
  by_month: CashFlowMonth[];
  overdue_aging: {
    days_0_7: string;
    days_8_30: string;
    days_31_60: string;
    days_60_plus: string;
  };
}
interface ExpenseCategory {
  category: string;
  entry_count: number;
  total: string;
}
interface FinanceSummary {
  by_client: {
    client_id: number;
    client_name: string;
    invoiced: string;
    paid: string;
    overdue: string;
  }[];
  by_month: { month: string; invoiced: string; paid: string }[];
}

const STATUS_LABEL: Record<string, string> = {
  new: "Новые",
  contacted: "Связались",
  qualified: "Квалификация",
  proposal_sent: "КП",
  won: "Won",
  lost: "Lost",
};

const CHANNEL_COLORS: ChartColor[] = ["accent", "success", "spark", "danger"];

function money(value: string | number): string {
  return Number(value).toLocaleString("ru-RU");
}

function pct(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

function sum(values: (string | number)[]): number {
  return values.reduce<number>((acc, value) => acc + Number(value), 0);
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "accent",
}: {
  icon: typeof Target;
  label: string;
  value: string | number;
  hint: string;
  tone?: "accent" | "success" | "spark" | "danger" | "neutral";
}) {
  const toneClasses = {
    accent: "bg-accent-soft text-accent-strong",
    success: "bg-success-soft text-success",
    spark: "bg-spark/12 text-spark",
    danger: "bg-danger-soft text-danger",
    neutral: "bg-bg text-ink-dim",
  }[tone];

  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-ink-faint">{label}</p>
          <p className="mt-2 font-mono-num text-2xl font-semibold text-ink">{value}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneClasses}`}>
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-ink-dim">{hint}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-4">
        <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-1 text-xs leading-5 text-ink-dim">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function FunnelView({ rows }: { rows: FunnelRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.reached_count));
  return (
    <div className="grid gap-2">
      {rows.map((row) => {
        const width = Math.max(6, (row.reached_count / max) * 100);
        return (
          <div key={row.status} className="rounded-xl bg-bg p-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-ink">{STATUS_LABEL[row.status] ?? row.status}</span>
              <span className="font-mono-num text-ink-dim">
                {row.reached_count} · {row.avg_hours_in_status?.toFixed(1) ?? "0"} ч
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InsightList({ items }: { items: { tone: "success" | "danger" | "accent"; text: string }[] }) {
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div key={item.text} className="flex gap-3 rounded-xl border border-border bg-bg p-3">
          <span
            className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
              item.tone === "success"
                ? "bg-success"
                : item.tone === "danger"
                  ? "bg-danger"
                  : "bg-accent"
            }`}
          />
          <p className="text-sm leading-5 text-ink-dim">{item.text}</p>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsDashboardPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [conversion, setConversion] = useState<ConversionRow[]>([]);
  const [managerPerf, setManagerPerf] = useState<ManagerPerfRow[]>([]);
  const [channelOverTime, setChannelOverTime] = useState<ChannelOverTimeRow[]>([]);
  const [staleLeads, setStaleLeads] = useState<StaleLeadRow[]>([]);
  const [teamLoad, setTeamLoad] = useState<TeamLoadRow[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);
  const [expenses, setExpenses] = useState<ExpenseCategory[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);

  useEffect(() => {
    (async () => {
      const paths = [
        "/analytics/funnel",
        "/analytics/conversion-by-source",
        "/analytics/manager-performance",
        "/analytics/leads-by-channel-over-time",
        "/analytics/stale-leads",
        "/analytics/team-load",
        "/finance/cash-flow",
        "/finance/expenses-by-category",
        "/finance/summary",
      ];
      const results = await Promise.all(paths.map((path) => apiFetch(path)));
      if (results.some((response) => response.status === 401)) {
        clearTokens();
        router.push("/login");
        return;
      }
      if (results.some((response) => !response.ok)) {
        setError("Дашбоард доступен только founder'у.");
        return;
      }
      const [
        funnelData,
        conversionData,
        perfData,
        channelData,
        staleData,
        teamData,
        cashData,
        expensesData,
        summaryData,
      ] = await Promise.all(results.map((response) => response.json()));

      setFunnel(funnelData.funnel);
      setConversion(conversionData);
      setManagerPerf(perfData);
      setChannelOverTime(channelData);
      setStaleLeads(staleData);
      setTeamLoad(teamData);
      setCashFlow(cashData);
      setExpenses(expensesData);
      setSummary(summaryData);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metrics = useMemo(() => {
    const totalLeads = sum(conversion.map((row) => row.total));
    const wonLeads = sum(conversion.map((row) => row.won));
    const conversionRate = totalLeads ? (wonLeads / totalLeads) * 100 : 0;
    const latestMonth = cashFlow?.by_month.at(-1);
    const totalPaid = sum(summary?.by_month.map((row) => row.paid) ?? []);
    const totalInvoiced = sum(summary?.by_month.map((row) => row.invoiced) ?? []);
    const overdue = sum(summary?.by_client.map((row) => row.overdue) ?? []);
    const openFunnel = funnel
      .filter((row) => !["won", "lost"].includes(row.status))
      .reduce((acc, row) => acc + row.reached_count, 0);
    const overdueTasks = sum(teamLoad.map((row) => row.overdue_tasks));
    const bestSource = [...conversion].sort((a, b) => b.total - a.total)[0];
    const bestManager = [...managerPerf].sort((a, b) => b.leads_owned - a.leads_owned)[0];

    return {
      totalLeads,
      wonLeads,
      conversionRate,
      latestMonth,
      totalPaid,
      totalInvoiced,
      overdue,
      openFunnel,
      overdueTasks,
      bestSource,
      bestManager,
    };
  }, [cashFlow, conversion, funnel, managerPerf, summary, teamLoad]);

  const channelMonths = Array.from(new Set(channelOverTime.map((row) => row.month))).sort();
  const channelSources = Array.from(new Set(channelOverTime.map((row) => row.source))).sort();
  const channelSeries = channelSources.map((source, index) => ({
    name: source,
    color: CHANNEL_COLORS[index % CHANNEL_COLORS.length],
    values: channelMonths.map(
      (month) =>
        channelOverTime.find((row) => row.month === month && row.source === source)?.count ?? 0
    ),
  }));

  const cashMonths = cashFlow?.by_month.map((row) => row.month) ?? [];
  const cashSeries = [
    {
      name: "Выставлено",
      color: "accent" as ChartColor,
      values: cashFlow?.by_month.map((row) => Number(row.invoiced)) ?? [],
    },
    {
      name: "Оплачено",
      color: "success" as ChartColor,
      values: cashFlow?.by_month.map((row) => Number(row.paid)) ?? [],
    },
    {
      name: "Расходы",
      color: "danger" as ChartColor,
      values: cashFlow?.by_month.map((row) => Number(row.expenses)) ?? [],
    },
  ];

  const insights = [
    {
      tone: metrics.totalLeads > 0 ? "accent" : "danger",
      text:
        metrics.totalLeads > 0
          ? `В CRM сейчас ${metrics.totalLeads} лидов; ${metrics.wonLeads} дошли до won.`
          : "Лидов нет: сначала проверь website/telegram/manual intake.",
    },
    {
      tone: metrics.overdue > 0 ? "danger" : "success",
      text:
        metrics.overdue > 0
          ? `Просрочка по клиентам: ${money(metrics.overdue)}. Это первый финансовый риск.`
          : "Финансовой просрочки по клиентам нет.",
    },
    {
      tone: staleLeads.length > 0 ? "danger" : "success",
      text:
        staleLeads.length > 0
          ? `${staleLeads.length} лидов без активности больше 7 дней. Нужен follow-up.`
          : "Зависших лидов старше 7 дней нет.",
    },
    {
      tone: "accent",
      text: metrics.bestSource
        ? `Главный канал по объёму: ${metrics.bestSource.source} (${metrics.bestSource.total}).`
        : "Канальный разрез появится после первого лида.",
    },
  ] as const;

  return (
    <AppShell eyebrow="Power BI" title="Дашбоард">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm leading-6 text-ink-dim">
            Управленческий экран: воронка, каналы, менеджеры, деньги и риски в одном виде.
          </p>
        </div>
        <Link
          href="/analytics"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-ink hover:border-accent hover:text-accent-strong"
        >
          <ArrowLeft size={16} />
          Назад к аналитике
        </Link>
      </div>

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!error && (
        <div className="grid gap-4">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              icon={Target}
              label="Лидов всего"
              value={metrics.totalLeads}
              hint={`${metrics.openFunnel} касаний в открытой воронке`}
              tone="accent"
            />
            <KpiCard
              icon={CheckCircle2}
              label="Won"
              value={metrics.wonLeads}
              hint={`Конверсия ${pct(metrics.conversionRate)}`}
              tone="success"
            />
            <KpiCard
              icon={CircleDollarSign}
              label="Оплачено"
              value={money(metrics.totalPaid)}
              hint={`Выставлено ${money(metrics.totalInvoiced)}`}
              tone="success"
            />
            <KpiCard
              icon={AlertTriangle}
              label="Просрочка"
              value={money(metrics.overdue)}
              hint="Неоплаченные просроченные счета"
              tone={metrics.overdue > 0 ? "danger" : "neutral"}
            />
            <KpiCard
              icon={Clock3}
              label="Overdue tasks"
              value={metrics.overdueTasks}
              hint="Просроченные задачи команды"
              tone={metrics.overdueTasks > 0 ? "danger" : "neutral"}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Panel
              title="Cash-flow"
              subtitle={`Последний месяц: ${metrics.latestMonth?.month ?? "нет данных"} · net ${money(metrics.latestMonth?.net ?? 0)}`}
            >
              <GroupedBarChart
                categories={cashMonths}
                series={cashSeries}
                height={210}
                formatValue={money}
              />
            </Panel>
            <Panel title="Выводы" subtitle="Что видно из текущих данных">
              <InsightList items={[...insights]} />
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <Panel title="Воронка" subtitle="Сколько лидов достигло каждого этапа">
              <FunnelView rows={funnel} />
            </Panel>
            <Panel title="Каналы по месяцам" subtitle="Динамика источников лидов">
              <GroupedBarChart
                categories={channelMonths}
                series={channelSeries}
                height={210}
                formatValue={(value) => value.toLocaleString("ru-RU")}
              />
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <Panel title="Источники" subtitle="Объём и win-rate по каналам">
              <HorizontalBars
                items={conversion.map((row) => ({
                  label: `${row.source} · ${row.conversion_pct ?? "0"}%`,
                  value: row.total,
                }))}
              />
            </Panel>
            <Panel title="Менеджеры" subtitle="Лиды в работе и закрытия">
              <HorizontalBars
                color="success"
                items={managerPerf.map((row) => ({
                  label: `${row.user_name} · won ${row.leads_won}`,
                  value: row.leads_owned,
                }))}
              />
            </Panel>
            <Panel title="Расходы" subtitle="Категории затрат">
              <HorizontalBars
                color="spark"
                formatValue={money}
                items={expenses.map((expense) => ({
                  label: `${expense.category} · ${expense.entry_count}`,
                  value: Number(expense.total),
                }))}
              />
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Panel title="Менеджеры подробно" subtitle="Performance table">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-ink-faint">
                      <th className="py-2 pr-3 font-medium">Менеджер</th>
                      <th className="py-2 pr-3 font-medium">Лиды</th>
                      <th className="py-2 pr-3 font-medium">Won</th>
                      <th className="py-2 pr-3 font-medium">Conv.</th>
                      <th className="py-2 pr-3 font-medium">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managerPerf.map((row) => (
                      <tr key={row.user_id} className="border-b border-border last:border-0">
                        <td className="py-2 pr-3 font-medium text-ink">{row.user_name}</td>
                        <td className="py-2 pr-3 font-mono-num text-ink-dim">{row.leads_owned}</td>
                        <td className="py-2 pr-3 font-mono-num text-success">{row.leads_won}</td>
                        <td className="py-2 pr-3 font-mono-num text-accent-strong">
                          {row.conversion_pct ?? "0"}%
                        </td>
                        <td className="py-2 pr-3 font-mono-num text-success">
                          {money(row.revenue_paid)}
                        </td>
                      </tr>
                    ))}
                    {managerPerf.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-sm text-ink-faint">
                          Нет менеджерских данных.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="Риски и контроль" subtitle="Что требует внимания">
              <div className="grid gap-3">
                <div className="rounded-xl border border-border bg-bg p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                    <AlertTriangle size={16} className="text-danger" />
                    Лиды без активности
                  </div>
                  {staleLeads.slice(0, 5).map((lead) => (
                    <div key={lead.id} className="flex justify-between gap-3 border-t border-border py-2 text-sm">
                      <span className="truncate text-ink-dim">{lead.name}</span>
                      <span className="font-mono-num text-danger">{lead.days_since_activity} дн.</span>
                    </div>
                  ))}
                  {staleLeads.length === 0 && (
                    <p className="text-sm text-ink-faint">Нет зависших лидов старше 7 дней.</p>
                  )}
                </div>
                <div className="rounded-xl border border-border bg-bg p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                    <Users size={16} className="text-accent-strong" />
                    Нагрузка команды
                  </div>
                  {teamLoad.slice(0, 5).map((row) => (
                    <div key={row.user_id} className="flex justify-between gap-3 border-t border-border py-2 text-sm">
                      <span className="truncate text-ink-dim">{row.user_name}</span>
                      <span className="font-mono-num text-ink">
                        {row.total_tasks} / {row.overdue_tasks} overdue
                      </span>
                    </div>
                  ))}
                  {teamLoad.length === 0 && (
                    <p className="text-sm text-ink-faint">Задач пока нет.</p>
                  )}
                </div>
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <Panel title="Фокус продаж">
              <div className="flex items-center gap-3 text-sm text-ink-dim">
                <TrendingUp className="text-accent-strong" size={20} />
                <p>
                  {metrics.bestSource
                    ? `Усилить канал ${metrics.bestSource.source}: он даёт основной объём.`
                    : "Нужен первый источник лидов для анализа."}
                </p>
              </div>
            </Panel>
            <Panel title="Фокус денег">
              <div className="flex items-center gap-3 text-sm text-ink-dim">
                <Banknote className="text-success" size={20} />
                <p>
                  {metrics.totalInvoiced > 0
                    ? `Собрано ${pct((metrics.totalPaid / metrics.totalInvoiced) * 100)} от выставленного.`
                    : "Пока нет выставленных счетов."}
                </p>
              </div>
            </Panel>
            <Panel title="Фокус команды">
              <div className="flex items-center gap-3 text-sm text-ink-dim">
                <BarChart3 className="text-spark" size={20} />
                <p>
                  {metrics.bestManager
                    ? `${metrics.bestManager.user_name} ведёт ${metrics.bestManager.leads_owned} лидов.`
                    : "Менеджерская нагрузка появится после назначения лидов."}
                </p>
              </div>
            </Panel>
          </section>

          <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-xs text-ink-faint">
            <LineChart size={15} />
            Данные считаются напрямую из CRM, finance_entries и events. Отдельных ручных таблиц аналитики нет.
          </div>
        </div>
      )}
    </AppShell>
  );
}
