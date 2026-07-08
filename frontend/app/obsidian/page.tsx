"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

interface User {
  id: number;
  name: string;
  role: string;
  role_title: string | null;
  is_active: boolean;
  quote: string | null;
}

interface Lead {
  id: number;
  name: string;
  status: string;
  owner_id: number | null;
  selected_amount: string | null;
  currency: string;
}

interface Project {
  id: number;
  name: string;
  stage: string;
  owner_id: number | null;
  budget_total: string | null;
}

interface Task {
  id: number;
  status: string;
  assigned_to: number;
}

const STATUS_LABEL: Record<string, string> = {
  new: "новые",
  contacted: "связались",
  qualified: "квалификация",
  proposal_sent: "КП",
  won: "выиграно",
  lost: "потеряно",
};

const ROLE_LABEL: Record<string, string> = {
  founder: "Founder",
  manager: "Sales",
  developer: "Delivery",
  student: "Student",
};

export default function ObsidianPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [hoveredUserId, setHoveredUserId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const [usersRes, leadsRes, projectsRes, tasksRes] = await Promise.all([
        apiFetch("/users"),
        apiFetch("/leads"),
        apiFetch("/projects"),
        apiFetch("/tasks"),
      ]);
      if (usersRes.ok) setUsers(await usersRes.json());
      if (leadsRes.ok) setLeads(await leadsRes.json());
      if (projectsRes.ok) setProjects(await projectsRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
    })();
  }, []);

  const activeUsers = users.filter((user) => user.is_active);
  const statsByUser = useMemo(() => {
    return new Map(
      activeUsers.map((user) => {
        const userLeads = leads.filter((lead) => lead.owner_id === user.id);
        const userProjects = projects.filter((project) => project.owner_id === user.id);
        const userTasks = tasks.filter((task) => task.assigned_to === user.id);
        const won = userLeads.filter((lead) => lead.status === "won");
        const proposal = userLeads.filter((lead) => lead.status === "proposal_sent");
        const pipelineValue = won.reduce(
          (sum, lead) => sum + Number(lead.selected_amount ?? 0),
          0
        );
        return [
          user.id,
          {
            leads: userLeads,
            projects: userProjects,
            tasks: userTasks,
            won,
            proposal,
            pipelineValue,
          },
        ];
      })
    );
  }, [activeUsers, leads, projects, tasks]);

  const hoveredStats = hoveredUserId ? statsByUser.get(hoveredUserId) : null;
  const hoveredUser = hoveredUserId ? activeUsers.find((u) => u.id === hoveredUserId) : null;

  return (
    <AppShell eyebrow="Obsidian?" title="Виртуальный мозг AI Solution">
      <section className="obsidian-brain-shell rise-in">
        <div className="obsidian-brain-header">
          <div>
            <p className="text-xs font-semibold uppercase text-white/50">живой граф процессов</p>
            <h2 className="font-display text-3xl font-bold text-white">Все связи ведут к aisolution</h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-white/66">
            Наведи на сотрудника: подсветятся связи, лиды, КП, проекты, задачи и вклад в общий мозг команды.
          </p>
        </div>

        <div className="obsidian-brain-stage">
          <div className="obsidian-center-core">
            <span className="obsidian-center-pulse" />
            <p>aisolution</p>
            <small>central brain</small>
          </div>

          {activeUsers.map((user, index) => {
            const angle = (index / Math.max(activeUsers.length, 1)) * Math.PI * 2 - Math.PI / 2;
            const radius = 39;
            const x = 50 + Math.cos(angle) * radius;
            const y = 50 + Math.sin(angle) * radius * 0.72;
            const stats = statsByUser.get(user.id);
            const active = hoveredUserId === null || hoveredUserId === user.id;
            return (
              <button
                key={user.id}
                onMouseEnter={() => setHoveredUserId(user.id)}
                onMouseLeave={() => setHoveredUserId(null)}
                onFocus={() => setHoveredUserId(user.id)}
                onBlur={() => setHoveredUserId(null)}
                className={`obsidian-user-node ${active ? "is-active" : "is-muted"}`}
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <span className="obsidian-node-dot" />
                <strong>{user.name}</strong>
                <small>{user.role_title || ROLE_LABEL[user.role] || user.role}</small>
                <em>{stats?.leads.length ?? 0} лидов · {stats?.projects.length ?? 0} проектов</em>
              </button>
            );
          })}

          <svg className="obsidian-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
            {activeUsers.map((user, index) => {
              const angle = (index / Math.max(activeUsers.length, 1)) * Math.PI * 2 - Math.PI / 2;
              const radius = 39;
              const x = 50 + Math.cos(angle) * radius;
              const y = 50 + Math.sin(angle) * radius * 0.72;
              const active = hoveredUserId === null || hoveredUserId === user.id;
              return (
                <line
                  key={user.id}
                  x1="50"
                  y1="50"
                  x2={x}
                  y2={y}
                  className={active ? "active" : "muted"}
                />
              );
            })}
          </svg>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-ink-faint">Фокус</p>
          <h3 className="mt-2 font-display text-xl font-semibold text-ink">
            {hoveredUser ? hoveredUser.name : "Наведи на узел"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-ink-dim">
            {hoveredUser?.quote ||
              "Граф покажет, какие лиды обработаны, где КП, сколько проектов и что сейчас держит команда."}
          </p>
          {hoveredStats && (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Metric label="Лиды" value={hoveredStats.leads.length} />
              <Metric label="КП" value={hoveredStats.proposal.length} />
              <Metric label="Выиграно" value={hoveredStats.won.length} />
              <Metric label="Задачи" value={hoveredStats.tasks.length} />
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-ink-faint">Связанные лиды</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(hoveredStats?.leads ?? leads).slice(0, 8).map((lead) => (
              <div key={lead.id} className="rounded-xl border border-border bg-bg px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-ink">{lead.name}</p>
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-strong">
                    {STATUS_LABEL[lead.status] ?? lead.status}
                  </span>
                </div>
                {lead.selected_amount && (
                  <p className="mt-1 font-mono-num text-xs text-success">
                    {Number(lead.selected_amount).toLocaleString("ru-RU")} {lead.currency}
                  </p>
                )}
              </div>
            ))}
            {(hoveredStats?.leads ?? leads).length === 0 && (
              <p className="rounded-xl border border-dashed border-border bg-bg px-3 py-8 text-center text-sm text-ink-faint">
                Пока нет связанных лидов.
              </p>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-bg p-3">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="mt-1 font-mono-num text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}
