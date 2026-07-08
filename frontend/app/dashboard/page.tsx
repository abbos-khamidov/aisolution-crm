"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import StatCard from "@/components/StatCard";
import { apiFetch, getToken } from "@/lib/api";
import { decodeJwt } from "@/lib/jwt";
import { getGreeting } from "@/lib/greeting";

interface Lead {
  id: number;
  owner_id: number | null;
}
interface Project {
  id: number;
  stage: string;
  deadline_status: "green" | "yellow" | "red" | "none";
}
interface Task {
  id: number;
  status: string;
}

const ACTIVE_STAGES = new Set([
  "discovery",
  "proposal",
  "contract",
  "in_progress",
  "review",
  "paused",
]);

const QUICK_ACTIONS = [
  { href: "/leads", label: "Разобрать очередь лидов", roles: ["founder", "manager"] },
  { href: "/projects", label: "Открыть проекты", roles: ["founder", "manager", "developer"] },
  { href: "/files", label: "Файлы на согласование", roles: ["founder"] },
  { href: "/analytics", label: "Посмотреть аналитику", roles: ["founder"] },
];

export default function DashboardPage() {
  const [role, setRole] = useState<string | null>(null);
  const [myId, setMyId] = useState<number | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [revenue, setRevenue] = useState<{ invoiced: number; paid: number } | null>(null);
  const greeting = useMemo(() => getGreeting(), []);

  useEffect(() => {
    const token = getToken();
    const payload = token ? decodeJwt(token) : null;
    setRole(payload?.role ?? null);
    setMyId(payload ? Number(payload.sub) : null);

    (async () => {
      if (payload?.role === "founder" || payload?.role === "manager") {
        const res = await apiFetch("/leads");
        if (res.ok) setLeads(await res.json());
      }
      const projRes = await apiFetch("/projects");
      if (projRes.ok) setProjects(await projRes.json());

      const taskRes = await apiFetch("/tasks");
      if (taskRes.ok) setTasks(await taskRes.json());

      if (payload?.role === "founder") {
        const finRes = await apiFetch("/finance/summary");
        if (finRes.ok) {
          const data = await finRes.json();
          const totals = data.by_month.reduce(
            (acc: { invoiced: number; paid: number }, row: { invoiced: string; paid: string }) => ({
              invoiced: acc.invoiced + Number(row.invoiced),
              paid: acc.paid + Number(row.paid),
            }),
            { invoiced: 0, paid: 0 }
          );
          setRevenue(totals);
        }
      }
    })();
  }, []);

  const unclaimedLeads = leads?.filter((l) => l.owner_id === null).length ?? 0;
  const myLeads = leads?.filter((l) => l.owner_id === myId).length ?? 0;
  const activeProjects = projects?.filter((p) => ACTIVE_STAGES.has(p.stage)).length ?? 0;
  const burningDeadlines = projects?.filter((p) => p.deadline_status === "red").length ?? 0;
  const openTasks = tasks?.filter((t) => t.status !== "done").length ?? 0;

  const actions = QUICK_ACTIONS.filter((a) => role && a.roles.includes(role));

  return (
    <AppShell eyebrow="Aisolutioncrm" title="Дашборд">
      <p className="rise-in mb-8 max-w-2xl text-ink-dim" style={{ animationDelay: "60ms" }}>
        {greeting}
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {(role === "founder" || role === "manager") && (
          <>
            <StatCard
              label="Лиды в очереди"
              value={unclaimedLeads}
              hint="ничьи — бери первым"
              href="/leads"
              tone={unclaimedLeads > 0 ? "spark" : "success"}
              delay={0}
            />
            <StatCard
              label="Мои лиды"
              value={myLeads}
              hint="в работе у тебя"
              href="/leads"
              tone="accent"
              delay={60}
            />
          </>
        )}
        <StatCard
          label="Активные проекты"
          value={activeProjects}
          hint="в работе прямо сейчас"
          href="/projects"
          tone="accent"
          delay={120}
        />
        <StatCard
          label="Дедлайны горят"
          value={burningDeadlines}
          hint="просрочены — глянь скорее"
          href="/projects"
          tone={burningDeadlines > 0 ? "danger" : "success"}
          delay={180}
        />
        <StatCard
          label="Открытых тасков"
          value={openTasks}
          hint="ещё не done"
          tone="neutral"
          delay={240}
        />
        {role === "founder" && revenue && (
          <StatCard
            label="Выручка за месяц"
            value={`${revenue.paid.toLocaleString("ru-RU")} / ${revenue.invoiced.toLocaleString("ru-RU")}`}
            hint="оплачено / выставлено"
            href="/finance"
            tone="success"
            delay={300}
          />
        )}
      </div>

      {actions.length > 0 && (
        <div className="rise-in mt-10" style={{ animationDelay: "360ms" }}>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-faint">
            Быстрые действия
          </h2>
          <div className="flex flex-wrap gap-3">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent-strong"
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
