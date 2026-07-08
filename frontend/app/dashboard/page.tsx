"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
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
interface User {
  id: number;
  name: string;
  phone: string | null;
  email: string;
  telegram_username: string | null;
  photo_url: string | null;
  quote: string | null;
  role: string;
  is_active: boolean;
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
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
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

      const usersRes = await apiFetch("/users");
      if (usersRes.ok) setUsers(await usersRes.json());

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
      <section className="rise-in mb-6 rounded-2xl border border-border bg-surface p-5" style={{ animationDelay: "60ms" }}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-display text-xl font-semibold text-ink">{greeting}</p>
            <p className="mt-1 text-sm text-ink-dim">
              {unclaimedLeads} новых лидов · {activeProjects} активных проектов · {openTasks} открытых задач
            </p>
          </div>
          <Link
            href="/leads"
            className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Открыть очередь
          </Link>
        </div>
      </section>

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

      {users.length > 0 && (
        <section className="rise-in mt-10" style={{ animationDelay: "420ms" }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-ink-faint">
              Команда
            </h2>
            <Link href="/team" className="text-sm font-semibold text-accent-strong">
              Управлять
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {users
              .filter((user) => user.is_active)
              .map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  className="rounded-2xl border border-border bg-surface p-4 text-left transition hover:border-accent"
                >
                  <div className="flex items-center gap-3">
                    <Avatar user={user} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{user.name}</p>
                      <p className="text-xs text-ink-faint">{user.role}</p>
                    </div>
                  </div>
                  {user.quote && (
                    <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-dim">
                      {user.quote}
                    </p>
                  )}
                </button>
              ))}
          </div>
        </section>
      )}

      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-glow">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar user={selectedUser} size="lg" />
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">{selectedUser.name}</h2>
                  <p className="text-sm text-ink-dim">{selectedUser.role}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="rounded-lg bg-bg p-2 text-ink-dim hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2 text-sm text-ink-dim">
              <p>{selectedUser.email}</p>
              {selectedUser.phone && <p>{selectedUser.phone}</p>}
              {selectedUser.telegram_username && <p>{selectedUser.telegram_username}</p>}
              {selectedUser.quote && (
                <p className="rounded-xl bg-bg px-3 py-2 leading-relaxed">{selectedUser.quote}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Avatar({ user, size = "md" }: { user: User; size?: "md" | "lg" }) {
  const className =
    size === "lg"
      ? "h-14 w-14 rounded-2xl text-xl"
      : "h-11 w-11 rounded-xl text-base";
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden bg-accent-soft font-semibold text-accent-strong ${className}`}
    >
      {user.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.photo_url} alt={user.name} className="h-full w-full object-cover" />
      ) : (
        user.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
