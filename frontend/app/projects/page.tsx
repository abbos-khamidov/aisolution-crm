"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import Badge from "@/components/Badge";
import { API_URL, apiFetch, clearTokens } from "@/lib/api";

interface Project {
  id: number;
  client_id: number;
  client_name: string;
  company_name: string | null;
  contact_info: Record<string, unknown>;
  name: string;
  description: string | null;
  stage: string;
  owner_id: number | null;
  deadline: string | null;
  deadline_status: "green" | "yellow" | "red" | "none";
  budget_total: string | null;
  currency: string | null;
}

interface User {
  id: number;
  name: string;
  role: string;
  is_active: boolean;
}

interface ProjectMember {
  user_id: number;
  role_on_project: string;
}

interface ProjectFile {
  id: number;
  filename: string;
  url: string;
  status: string;
  created_at: string;
}

interface Activity {
  id: number;
  actor_name: string | null;
  event_type: string;
  payload: { text?: string; mentioned_user_ids?: number[] };
  created_at: string;
}

const ACTIVE_STAGES = new Set(["discovery", "proposal", "contract", "in_progress", "review", "paused"]);

const DEADLINE_DOT: Record<Project["deadline_status"], string> = {
  green: "bg-success",
  yellow: "bg-spark",
  red: "bg-danger animate-pulse",
  none: "bg-ink-faint",
};

const DEADLINE_LABEL: Record<Project["deadline_status"], string> = {
  green: "в графике",
  yellow: "срок близко",
  red: "просрочен",
  none: "без срока",
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [members, setMembers] = useState<Record<number, ProjectMember[]>>({});
  const [files, setFiles] = useState<Record<number, ProjectFile[]>>({});
  const [activity, setActivity] = useState<Record<number, Activity[]>>({});
  const [comment, setComment] = useState<Record<number, string>>({});
  const [mention, setMention] = useState<Record<number, string>>({});
  const [newMember, setNewMember] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  async function load() {
    const res = await apiFetch("/projects");
    if (res.status === 401) {
      clearTokens();
      router.push("/login");
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    setProjects(await res.json());
  }

  async function loadUsers() {
    const res = await apiFetch("/users");
    if (res.ok) setUsers(await res.json());
  }

  async function loadProjectDetails(projectId: number) {
    const [memberRes, fileRes, activityRes] = await Promise.all([
      apiFetch(`/projects/${projectId}/members`),
      apiFetch(`/files?project_id=${projectId}`),
      apiFetch(`/projects/${projectId}/activity`),
    ]);
    const memberData = memberRes.ok ? await memberRes.json() : [];
    const fileData = fileRes.ok ? await fileRes.json() : [];
    const activityData = activityRes.ok ? await activityRes.json() : [];
    setMembers((prev) => ({ ...prev, [projectId]: memberData }));
    setFiles((prev) => ({ ...prev, [projectId]: fileData }));
    setActivity((prev) => ({ ...prev, [projectId]: activityData }));
  }

  useEffect(() => {
    load();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = showAll ? projects : projects.filter((p) => ACTIVE_STAGES.has(p.stage));

  async function toggle(projectId: number) {
    const next = openId === projectId ? null : projectId;
    setOpenId(next);
    if (next) await loadProjectDetails(next);
  }

  async function addMember(projectId: number) {
    const userId = newMember[projectId];
    if (!userId) return;
    const res = await apiFetch(`/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify({ user_id: Number(userId), role_on_project: "contributor" }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    await loadProjectDetails(projectId);
  }

  async function addComment(projectId: number) {
    const text = comment[projectId]?.trim();
    if (!text) return;
    const mentioned = mention[projectId] ? [Number(mention[projectId])] : [];
    const res = await apiFetch(`/projects/${projectId}/comments`, {
      method: "POST",
      body: JSON.stringify({ text, mentioned_user_ids: mentioned }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    setComment((prev) => ({ ...prev, [projectId]: "" }));
    await loadProjectDetails(projectId);
  }

  async function uploadFile(projectId: number, file: File | null) {
    if (!file) return;
    const formData = new FormData();
    formData.append("project_id", String(projectId));
    formData.append("file", file);
    const res = await apiFetch("/files", { method: "POST", body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    await loadProjectDetails(projectId);
  }

  function fileUrl(url: string) {
    return url.startsWith("/uploads/") ? `${API_URL}${url}` : url;
  }

  return (
    <AppShell eyebrow="Работа в проектах" title="Проекты">
      <div className="rise-in mb-5 flex justify-end" style={{ animationDelay: "60ms" }}>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-ink-dim transition hover:text-ink"
        >
          {showAll ? "Только активные" : "Показать все"}
        </button>
      </div>

      {error && (
        <p className="rise-in mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {visible.map((p, i) => {
          const open = openId === p.id;
          const projectMembers = members[p.id] ?? [];
          const projectFiles = files[p.id] ?? [];
          const projectActivity = activity[p.id] ?? [];
          return (
            <section
              key={p.id}
              className="rise-in rounded-2xl border border-border bg-surface p-5 transition hover:border-border-bright"
              style={{ animationDelay: `${100 + i * 40}ms` }}
            >
              <button onClick={() => toggle(p.id)} className="w-full text-left">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display font-semibold leading-snug text-ink">
                      {p.company_name || p.client_name}
                    </h3>
                    <p className="mt-1 text-sm text-ink-dim">{p.name}</p>
                  </div>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DEADLINE_DOT[p.deadline_status]}`} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge label={p.stage} tone="accent" />
                  <Badge label={DEADLINE_LABEL[p.deadline_status]} tone={p.deadline_status === "red" ? "danger" : "neutral"} />
                </div>
                <div className="mt-3 space-y-1 text-xs text-ink-dim">
                  <p>{p.deadline ? `дедлайн ${p.deadline}` : "без дедлайна"}</p>
                  {p.budget_total && (
                    <p className="font-mono-num text-ink">
                      {Number(p.budget_total).toLocaleString("ru-RU")} {p.currency}
                    </p>
                  )}
                </div>
              </button>

              {open && (
                <div className="mt-5 space-y-5 border-t border-border pt-5">
                  <div>
                    <p className="mb-2 text-xs uppercase text-ink-faint">Команда</p>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {projectMembers.map((m) => (
                        <span key={m.user_id} className="rounded-full bg-bg px-2.5 py-1 text-xs text-ink-dim">
                          {userById.get(m.user_id)?.name ?? m.user_id} · {m.role_on_project}
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <select value={newMember[p.id] ?? ""} onChange={(e) => setNewMember({ ...newMember, [p.id]: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink">
                        <option value="">добавить участника</option>
                        {users.filter((u) => u.is_active && u.role !== "student").map((u) => (
                          <option key={u.id} value={u.id}>{u.name} · {u.role}</option>
                        ))}
                      </select>
                      <button onClick={() => addMember(p.id)} className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink">Добавить</button>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs uppercase text-ink-faint">КП и файлы</p>
                    <input type="file" onChange={(e) => uploadFile(p.id, e.target.files?.[0] ?? null)} className="block w-full text-sm text-ink-dim file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white" />
                    <div className="mt-3 space-y-2">
                      {projectFiles.map((file) => (
                        <a key={file.id} href={fileUrl(file.url)} target="_blank" className="block rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink transition hover:border-border-bright">
                          {file.filename} <span className="text-xs text-ink-faint">· {file.status}</span>
                        </a>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs uppercase text-ink-faint">Новости</p>
                    <textarea value={comment[p.id] ?? ""} onChange={(e) => setComment({ ...comment, [p.id]: e.target.value })} className="min-h-20 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink" placeholder="Обновление по проекту" />
                    <div className="mt-2 flex gap-2">
                      <select value={mention[p.id] ?? ""} onChange={(e) => setMention({ ...mention, [p.id]: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink">
                        <option value="">без тега</option>
                        {users.filter((u) => u.is_active).map((u) => (
                          <option key={u.id} value={u.id}>@{u.name}</option>
                        ))}
                      </select>
                      <button onClick={() => addComment(p.id)} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white">Опубликовать</button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {projectActivity.filter((a) => a.event_type === "comment").map((a) => (
                        <div key={a.id} className="rounded-lg bg-bg px-3 py-2 text-sm text-ink">
                          <div className="mb-1 text-xs text-ink-faint">{a.actor_name ?? "system"} · {new Date(a.created_at).toLocaleString("ru-RU")}</div>
                          {a.payload.text}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          );
        })}
        {visible.length === 0 && (
          <p className="col-span-full py-8 text-center text-ink-faint">
            Проектов не видно. Либо их нет, либо ты пока не в команде ни одного.
          </p>
        )}
      </div>
    </AppShell>
  );
}
