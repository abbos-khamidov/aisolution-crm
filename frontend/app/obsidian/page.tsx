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
}

interface Lead {
  id: number;
  owner_id: number | null;
  selected_amount: string | null;
  currency: string;
}

interface Project {
  id: number;
  owner_id: number | null;
  budget_total: string | null;
  currency: string | null;
}

function point(index: number, total: number) {
  const angle = (index / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
  const radius = 34 + (index % 3) * 6;
  return {
    x: 50 + Math.cos(angle) * radius,
    y: 50 + Math.sin(angle) * radius * 0.72,
  };
}

export default function ObsidianPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeUserId, setActiveUserId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const [usersRes, leadsRes, projectsRes] = await Promise.all([
        apiFetch("/users"),
        apiFetch("/leads"),
        apiFetch("/projects"),
      ]);
      if (usersRes.ok) setUsers(await usersRes.json());
      if (leadsRes.ok) setLeads(await leadsRes.json());
      if (projectsRes.ok) setProjects(await projectsRes.json());
    })();
  }, []);

  const activeUsers = users.filter((user) => user.is_active);
  const stats = useMemo(() => {
    return new Map(
      activeUsers.map((user) => {
        const ownedLeads = leads.filter((lead) => lead.owner_id === user.id);
        const ownedProjects = projects.filter((project) => project.owner_id === user.id);
        const amount =
          ownedLeads.reduce((sum, lead) => sum + Number(lead.selected_amount ?? 0), 0) +
          ownedProjects.reduce((sum, project) => sum + Number(project.budget_total ?? 0), 0);
        return [user.id, { leads: ownedLeads.length, projects: ownedProjects.length, amount }];
      })
    );
  }, [activeUsers, leads, projects]);

  return (
    <AppShell eyebrow="Graph view" title="Obsidian CRM">
      <section className="obsidian-workbench">
        <aside className="obsidian-panel">
          <p className="obsidian-panel-title">Filters</p>
          {["Лиды", "Проекты", "Команда", "Суммы"].map((item) => (
            <label key={item} className="obsidian-toggle">
              <span>{item}</span>
              <input type="checkbox" checked readOnly />
            </label>
          ))}
          <p className="obsidian-panel-title mt-5">Display</p>
          <div className="obsidian-slider" />
          <div className="obsidian-slider obsidian-slider--short" />
        </aside>

        <div className="obsidian-graph" onMouseLeave={() => setActiveUserId(null)}>
          <svg viewBox="0 0 100 100" className="obsidian-graph-lines" preserveAspectRatio="none">
            {activeUsers.map((user, index) => {
              const p = point(index, activeUsers.length);
              const active = activeUserId === null || activeUserId === user.id;
              return <line key={user.id} x1="50" y1="50" x2={p.x} y2={p.y} className={active ? "active" : "muted"} />;
            })}
          </svg>
          <div className="obsidian-root-node">CRM</div>
          {activeUsers.map((user, index) => {
            const p = point(index, activeUsers.length);
            const s = stats.get(user.id) ?? { leads: 0, projects: 0, amount: 0 };
            const active = activeUserId === null || activeUserId === user.id;
            return (
              <button
                key={user.id}
                onMouseEnter={() => setActiveUserId(user.id)}
                onFocus={() => setActiveUserId(user.id)}
                className={`obsidian-note-node ${active ? "active" : "muted"}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              >
                <span>{user.name}</span>
                <small>{s.leads} лидов · {s.projects} проектов · {s.amount.toLocaleString("ru-RU")}</small>
              </button>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
