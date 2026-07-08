"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { GroupedBarChart, HorizontalBars } from "@/components/Charts";
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

interface CashFlowMonth {
  month: string;
  invoiced: string;
  paid: string;
  expenses: string;
  net: string;
}

interface OverdueAging {
  days_0_7: string;
  days_8_30: string;
  days_31_60: string;
  days_60_plus: string;
}

interface CashFlow {
  by_month: CashFlowMonth[];
  overdue_aging: OverdueAging;
}

interface ExpenseCategory {
  category: string;
  entry_count: number;
  total: string;
}

function money(v: string | number): string {
  return Number(v).toLocaleString("ru-RU");
}

export default function FinancePage() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);
  const [expenses, setExpenses] = useState<ExpenseCategory[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const paths = ["/finance/summary", "/finance/cash-flow", "/finance/expenses-by-category"];
      const results = await Promise.all(paths.map((p) => apiFetch(p)));

      if (results.some((r) => r.status === 401)) {
        clearTokens();
        router.push("/login");
        return;
      }
      if (results.some((r) => !r.ok)) {
        const body = await results[0].json().catch(() => ({}));
        setError(body.detail ?? "Финансы доступны только founder'у.");
        return;
      }

      const [summaryData, cashFlowData, expensesData] = await Promise.all(
        results.map((r) => r.json())
      );
      setSummary(summaryData);
      setCashFlow(cashFlowData);
      setExpenses(expensesData);
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

      {summary && cashFlow && (
        <div className="flex flex-col gap-8">
          <section className="rise-in" style={{ animationDelay: "40ms" }}>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-faint">
              Cash flow по месяцам
            </h2>
            <GroupedBarChart
              categories={cashFlow.by_month.map((r) => r.month)}
              series={[
                { name: "Выставлено", color: "accent", values: cashFlow.by_month.map((r) => Number(r.invoiced)) },
                { name: "Оплачено", color: "success", values: cashFlow.by_month.map((r) => Number(r.paid)) },
                { name: "Расходы", color: "danger", values: cashFlow.by_month.map((r) => Number(r.expenses)) },
              ]}
              formatValue={money}
            />
          </section>

          <section className="rise-in grid gap-6 md:grid-cols-2" style={{ animationDelay: "80ms" }}>
            <div>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-faint">
                Просрочка по возрасту
              </h2>
              <HorizontalBars
                color="danger"
                formatValue={money}
                items={[
                  { label: "0–7 дней", value: Number(cashFlow.overdue_aging.days_0_7) },
                  { label: "8–30 дней", value: Number(cashFlow.overdue_aging.days_8_30) },
                  { label: "31–60 дней", value: Number(cashFlow.overdue_aging.days_31_60) },
                  { label: "60+ дней", value: Number(cashFlow.overdue_aging.days_60_plus) },
                ]}
              />
            </div>
            <div>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-faint">
                Расходы по категориям
              </h2>
              <HorizontalBars
                color="spark"
                formatValue={money}
                items={expenses.map((e) => ({ label: e.category, value: Number(e.total) }))}
              />
            </div>
          </section>

          <section className="rise-in" style={{ animationDelay: "120ms" }}>
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

          <section className="rise-in" style={{ animationDelay: "160ms" }}>
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
