"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Flame,
  Inbox,
  Rocket,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
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
  { href: "/leads", label: "Разобрать лиды", hint: "самые свежие сверху", roles: ["founder", "manager"] },
  { href: "/projects", label: "Открыть проекты", hint: "КП, новости, команда", roles: ["founder", "manager", "developer"] },
  { href: "/files", label: "Согласовать файлы", hint: "то, что ждёт founder", roles: ["founder"] },
  { href: "/analytics", label: "Посмотреть цифры", hint: "воронка и команда", roles: ["founder"] },
];

const ROLE_LABELS: Record<string, string> = {
  founder: "Founder",
  manager: "Sales",
  developer: "Delivery",
  student: "Student",
};

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
  const teamOnline = users.filter((user) => user.is_active).length;
  const inboxMood =
    unclaimedLeads > 0
      ? "Есть свежие заявки. Лучше взять в работу сейчас."
      : "Очередь чистая. Можно двигать проекты и задачи.";
  const deadlineMood =
    burningDeadlines > 0
      ? "Есть красные дедлайны. Сначала тушим их."
      : "Критичных дедлайнов нет. Темп нормальный.";
  const taskMood =
    openTasks > 0
      ? "Открытые задачи ждут владельца и следующий шаг."
      : "Задачи закрыты. Хороший момент обновить проекты.";

  return (
    <AppShell eyebrow="Aisolution CRM" title="Рабочий центр">
      <section className="rise-in mb-6 overflow-hidden rounded-2xl border border-border bg-white/84 shadow-glow backdrop-blur-xl" style={{ animationDelay: "60ms" }}>
        <div className="relative grid gap-6 p-6 lg:grid-cols-[1.25fr_0.75fr] lg:p-7">
          <div className="dashboard-hero-glow" aria-hidden="true" />
          <div className="relative">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-strong">
                <Sparkles size={14} />
                {greeting}
              </span>
              <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-dim">
                сегодня работаем без потерянных заявок
              </span>
            </div>
            <h2 className="max-w-2xl font-display text-3xl font-bold leading-tight text-ink lg:text-4xl">
              Видим очередь, владельцев, дедлайны и деньги в одном ритме.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-ink-dim">
              Это главный экран для быстрых решений: что взять первым, кому назначить,
              где проект буксует и что сегодня должно сдвинуться.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={(role === "founder" || role === "manager") ? "/leads" : "/projects"}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-strong active:scale-[0.98]"
              >
                Открыть главное
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent-strong"
              >
                Проекты
              </Link>
            </div>
          </div>
          <div className="relative grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <PriorityCard icon={Inbox} label="Входящие" value={unclaimedLeads} text={inboxMood} tone={unclaimedLeads > 0 ? "spark" : "success"} href="/leads" />
            <PriorityCard icon={Flame} label="Дедлайны" value={burningDeadlines} text={deadlineMood} tone={burningDeadlines > 0 ? "danger" : "success"} href="/projects" />
            <PriorityCard icon={Clock3} label="Задачи" value={openTasks} text={taskMood} tone="accent" href="/tasks" />
          </div>
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
        <section className="rise-in mt-8 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]" style={{ animationDelay: "360ms" }}>
          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2 text-accent-strong">
              <Rocket size={18} />
              <h2 className="font-display text-lg font-semibold text-ink">Быстрый старт</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-ink-dim">
              Самые частые действия без лишних переходов. Открывай нужный контур и сразу работай.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="group rounded-2xl border border-border bg-white p-4 text-sm transition hover:-translate-y-0.5 hover:border-accent hover:shadow-glow"
              >
                <span className="flex items-center justify-between gap-3 font-semibold text-ink">
                  {action.label}
                  <ArrowRight className="text-ink-faint transition group-hover:translate-x-1 group-hover:text-accent-strong" size={16} />
                </span>
                <span className="mt-1 block text-xs text-ink-dim">{action.hint}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="rise-in mt-8 grid gap-4 lg:grid-cols-3" style={{ animationDelay: "390ms" }}>
        <SignalCard icon={ShieldCheck} title="Контроль" text="У каждого лида должен быть владелец, следующее действие и понятная стадия." />
        <SignalCard icon={BriefcaseBusiness} title="Проекты" text="КП, новости, файлы и участники живут в карточке компании, а не в чатах." />
        <SignalCard icon={BellRing} title="Ритм" text="Система подсказывает, где нужна реакция: лиды, дедлайны, задачи, согласования." />
      </section>

      {users.length > 0 && (
        <section className="rise-in mt-10" style={{ animationDelay: "420ms" }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">Команда в CRM</h2>
              <p className="mt-1 text-sm text-ink-dim">{teamOnline} активных участников. Клик по карточке открывает профиль.</p>
            </div>
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
                  className="group rounded-2xl border border-border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-glow"
                >
                  <div className="flex items-center gap-3">
                    <Avatar user={user} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{user.name}</p>
                      <p className="text-xs text-ink-faint">{ROLE_LABELS[user.role] ?? user.role}</p>
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

function PriorityCard({
  icon: Icon,
  label,
  value,
  text,
  tone,
  href,
}: {
  icon: typeof Inbox;
  label: string;
  value: number;
  text: string;
  tone: "accent" | "spark" | "success" | "danger";
  href: string;
}) {
  const toneClass = {
    accent: "bg-accent-soft text-accent-strong",
    spark: "bg-spark-soft text-spark",
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-danger",
  }[tone];

  return (
    <Link href={href} className="group rounded-2xl border border-border bg-white/82 p-4 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-accent hover:shadow-glow">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClass}`}>
          <Icon size={18} />
        </span>
        <span className="font-mono-num text-2xl font-semibold text-ink">{value}</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-ink">{label}</p>
      <p className="mt-1 text-xs leading-5 text-ink-dim">{text}</p>
    </Link>
  );
}

function SignalCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof CheckCircle2;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
          <Icon size={18} />
        </span>
        <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink-dim">{text}</p>
    </div>
  );
}
