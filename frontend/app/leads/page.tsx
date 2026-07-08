"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Check,
  FolderPlus,
  MessageSquare,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  UserPlus,
  X,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import Badge from "@/components/Badge";
import { apiFetch, clearTokens, getToken } from "@/lib/api";
import { decodeJwt } from "@/lib/jwt";

interface Lead {
  id: number;
  source: string;
  name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  utm: Record<string, string | number | boolean | null> | null;
  status: string;
  owner_id: number | null;
  loss_reason: string | null;
  created_at: string;
  archived_at: string | null;
}

interface User {
  id: number;
  name: string;
  role: string;
  is_active: boolean;
}

const STATUSES = ["new", "contacted", "qualified", "proposal_sent", "won", "lost"];

const STATUS_LABEL: Record<string, string> = {
  new: "Новый",
  contacted: "Связались",
  qualified: "Квалифицирован",
  proposal_sent: "КП отправлено",
  won: "Выигран",
  lost: "Потерян",
};

const STATUS_TONE: Record<string, "neutral" | "accent" | "spark" | "success" | "danger"> = {
  new: "neutral",
  contacted: "accent",
  qualified: "accent",
  proposal_sent: "spark",
  won: "success",
  lost: "danger",
};

const FILTERS = [
  { key: "all", label: "Все" },
  { key: "queue", label: "Без ответственного" },
  { key: "mine", label: "Мои" },
] as const;

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState<"all" | "queue" | "mine" | "archive">("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusDrafts, setStatusDrafts] = useState<Record<number, string>>({});
  const [lossReasonDrafts, setLossReasonDrafts] = useState<Record<number, string>>({});
  const [showManualModal, setShowManualModal] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [mentionDrafts, setMentionDrafts] = useState<Record<number, string>>({});
  const [openNoteLeadId, setOpenNoteLeadId] = useState<number | null>(null);
  const [manualLead, setManualLead] = useState({
    source: "other",
    name: "",
    phone: "",
    email: "",
    message: "",
  });

  const me = useMemo(() => {
    const token = getToken();
    return token ? decodeJwt(token) : null;
  }, []);

  async function loadLeads() {
    const res = await apiFetch(`/leads${filter === "archive" ? "?archived=true" : ""}`);
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
    setLeads(await res.json());
  }

  async function loadUsers() {
    const res = await apiFetch("/users");
    if (res.ok) setUsers(await res.json());
  }

  useEffect(() => {
    loadLeads();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const managers = users.filter((u) => u.role === "manager" && u.is_active);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  function sourceLabel(lead: Lead): string {
    const originLabel = lead.utm?.origin_label;
    if (typeof originLabel === "string") return originLabel;
    if (lead.source === "telegram") return "Telegram-бот";
    if (lead.source === "website") return "Форма сайта";
    if (lead.source === "other") return "Ручной ввод";
    return lead.source;
  }

  function sourceKey(lead: Lead): string {
    const origin = lead.utm?.origin;
    if (typeof origin === "string") return origin;
    if (lead.source === "telegram") return "telegram";
    if (lead.source === "other") return "manual";
    return lead.source;
  }

  function canEdit(lead: Lead): boolean {
    if (!me) return false;
    if (me.role === "founder") return true;
    return lead.owner_id === Number(me.sub);
  }

  const filteredLeads = leads.filter((lead) => {
    if (filter === "archive" && !lead.archived_at) return false;
    if (filter !== "archive" && lead.archived_at) return false;
    if (filter === "queue" && lead.owner_id !== null) return false;
    if (filter === "mine" && (!me || lead.owner_id !== Number(me.sub))) return false;
    if (["won", "lost"].includes(lead.status) && filter !== "all") return false;
    const haystack = [lead.name, lead.phone, lead.email, lead.message, sourceLabel(lead)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const queueCount = leads.filter((lead) => lead.owner_id === null).length;
  const activeCount = leads.filter((lead) => !["won", "lost"].includes(lead.status)).length;

  async function claim(leadId: number) {
    setError(null);
    const res = await apiFetch(`/leads/${leadId}/claim`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    await loadLeads();
  }

  async function createManualLead() {
    if (!manualLead.name.trim()) {
      setError("Имя лида обязательно.");
      return;
    }
    setError(null);
    const res = await apiFetch("/leads", {
      method: "POST",
      body: JSON.stringify({
        source: manualLead.source,
        name: manualLead.name.trim(),
        phone: manualLead.phone.trim() || null,
        email: manualLead.email.trim() || null,
        message: manualLead.message.trim() || null,
        utm: { origin: "manual", origin_label: "Ручной ввод" },
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    setManualLead({ source: "other", name: "", phone: "", email: "", message: "" });
    setShowManualModal(false);
    await loadLeads();
  }

  async function updateStatus(lead: Lead) {
    setError(null);
    const nextStatus = statusDrafts[lead.id] ?? lead.status;
    const lossReason = lossReasonDrafts[lead.id];
    const body: Record<string, string> = { status: nextStatus };
    if (nextStatus === "lost") {
      if (!lossReason) {
        setError("Для статуса Потерян нужна причина отказа.");
        return;
      }
      body.loss_reason = lossReason;
    }
    const res = await apiFetch(`/leads/${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const respBody = await res.json().catch(() => ({}));
      setError(respBody.detail ?? `Ошибка ${res.status}`);
      return;
    }
    await loadLeads();
  }

  async function assignLead(leadId: number, ownerId: string) {
    if (!ownerId) return;
    setError(null);
    const res = await apiFetch(`/leads/${leadId}`, {
      method: "PATCH",
      body: JSON.stringify({ owner_id: Number(ownerId) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    await loadLeads();
  }

  async function convertToProject(lead: Lead) {
    const projectName = window.prompt(`Название проекта для "${lead.name}"`);
    if (!projectName) return;
    setError(null);
    const res = await apiFetch(`/leads/${lead.id}/convert`, {
      method: "POST",
      body: JSON.stringify({ project_name: projectName }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    router.push("/projects");
  }

  async function addNote(lead: Lead) {
    const text = noteDrafts[lead.id]?.trim();
    if (!text) {
      setError("Примечание пустое.");
      return;
    }
    setError(null);
    const mentionedUserId = mentionDrafts[lead.id] ? Number(mentionDrafts[lead.id]) : null;
    const res = await apiFetch(`/leads/${lead.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ text, mentioned_user_id: mentionedUserId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    setNoteDrafts((prev) => ({ ...prev, [lead.id]: "" }));
    setMentionDrafts((prev) => ({ ...prev, [lead.id]: "" }));
    setOpenNoteLeadId(null);
  }

  async function setArchive(lead: Lead, archived: boolean) {
    setError(null);
    const res = await apiFetch(`/leads/${lead.id}/${archived ? "archive" : "unarchive"}`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    await loadLeads();
  }

  return (
    <AppShell eyebrow="Воронка продаж" title="Лиды">
      {error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mb-4 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-display text-lg font-semibold text-ink">
              {filter === "archive" ? "Архив лидов" : "Рабочая очередь"}
            </p>
            <p className="text-sm text-ink-dim">
              {filter === "archive"
                ? `${leads.length} в архиве · сначала новые`
                : `${activeCount} в работе · ${queueCount} без ответственного · сначала новые`}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск"
                className="h-10 w-full rounded-lg border border-border bg-bg pl-9 pr-3 text-sm text-ink outline-none focus:border-accent"
              />
            </div>
            <button
              onClick={() => setShowManualModal(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white"
            >
              <Plus size={16} />
              Добавить вручную
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`h-10 rounded-lg px-4 text-sm font-semibold transition ${
                filter === item.key ? "bg-accent text-white" : "bg-bg text-ink-dim hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            onClick={() => setFilter("archive")}
            className={`h-10 rounded-lg px-4 text-sm font-semibold transition ${
              filter === "archive" ? "bg-accent text-white" : "bg-bg text-ink-dim hover:text-ink"
            }`}
          >
            Архив
          </button>
        </div>
      </div>

      <div className="grid gap-4">
        <section className="space-y-3">
          <div className="space-y-3">
            {filteredLeads.map((lead) => {
              const owner = lead.owner_id
                ? userById.get(lead.owner_id)?.name ?? lead.owner_id
                : "Ответственный не назначен";
              const nextStatus = statusDrafts[lead.id] ?? lead.status;
              return (
                <article key={lead.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge
                          label={sourceLabel(lead)}
                          tone={sourceKey(lead).includes("popup") ? "spark" : "neutral"}
                        />
                        <Badge label={STATUS_LABEL[lead.status] ?? lead.status} tone={STATUS_TONE[lead.status] ?? "neutral"} />
                        <span className="text-xs text-ink-faint">
                          {new Date(lead.created_at).toLocaleString("ru-RU")}
                        </span>
                      </div>
                      <h3 className="truncate font-display text-lg font-semibold text-ink">
                        {lead.name}
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-2 text-sm text-ink-dim">
                        {lead.phone && (
                          <a
                            href={`tel:${lead.phone}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-bg px-2.5 py-1 hover:text-accent"
                          >
                            <Phone size={14} />
                            {lead.phone}
                          </a>
                        )}
                        {lead.email && (
                          <a href={`mailto:${lead.email}`} className="rounded-lg bg-bg px-2.5 py-1 hover:text-accent">
                            {lead.email}
                          </a>
                        )}
                        <span className="rounded-lg bg-bg px-2.5 py-1">{owner}</span>
                      </div>
                      {lead.message && (
                        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-bg px-3 py-2 text-sm leading-relaxed text-ink-dim">
                          {lead.message}
                        </p>
                      )}
                    </div>

                    <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:w-64 lg:grid-cols-1">
                      {me?.role === "founder" && (
                        <select
                          value={lead.owner_id ?? ""}
                          onChange={(e) => assignLead(lead.id, e.target.value)}
                          className="h-9 rounded-lg border border-border bg-bg px-2 text-sm text-ink"
                        >
                          <option value="">Назначить ответственного</option>
                          {managers.map((manager) => (
                            <option key={manager.id} value={manager.id}>
                              {manager.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {lead.owner_id === null && (
                        <button
                          onClick={() => claim(lead.id)}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-white"
                        >
                          <UserPlus size={16} />
                          Взять
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setOpenNoteLeadId(openNoteLeadId === lead.id ? null : lead.id)
                        }
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-bg px-3 text-sm font-semibold text-ink hover:bg-surface-2"
                      >
                        <MessageSquare size={16} />
                        Примечание
                      </button>
                      {canEdit(lead) && (
                        <div className="grid gap-2">
                          <select
                            value={nextStatus}
                            onChange={(e) =>
                              setStatusDrafts((prev) => ({ ...prev, [lead.id]: e.target.value }))
                            }
                            className="h-9 rounded-lg border border-border bg-bg px-2 text-sm text-ink"
                          >
                            {STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {STATUS_LABEL[status]}
                              </option>
                            ))}
                          </select>
                          {nextStatus === "lost" && (
                            <input
                              placeholder="Причина отказа"
                              value={lossReasonDrafts[lead.id] ?? ""}
                              onChange={(e) =>
                                setLossReasonDrafts((prev) => ({
                                  ...prev,
                                  [lead.id]: e.target.value,
                                }))
                              }
                              className="h-9 rounded-lg border border-border bg-bg px-2 text-sm text-ink"
                            />
                          )}
                          <button
                            onClick={() => updateStatus(lead)}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-surface-2 px-3 text-sm font-semibold text-ink hover:bg-border-bright"
                          >
                            <Save size={15} />
                            Сохранить
                          </button>
                        </div>
                      )}
                      {lead.status === "won" && canEdit(lead) && (
                        <button
                          onClick={() => convertToProject(lead)}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-success px-3 text-sm font-semibold text-white"
                        >
                          <FolderPlus size={16} />
                          В проект
                        </button>
                      )}
                      {filter === "archive" ? (
                        <button
                          onClick={() => setArchive(lead, false)}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-surface-2 px-3 text-sm font-semibold text-ink hover:bg-border-bright"
                        >
                          <RotateCcw size={16} />
                          Вернуть
                        </button>
                      ) : (
                        <button
                          onClick={() => setArchive(lead, true)}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-surface-2 px-3 text-sm font-semibold text-ink hover:bg-border-bright"
                        >
                          <Archive size={16} />
                          Архивировать
                        </button>
                      )}
                    </div>
                  </div>
                  {openNoteLeadId === lead.id && (
                    <div className="mt-4 rounded-xl border border-border bg-bg p-3">
                      <textarea
                        value={noteDrafts[lead.id] ?? ""}
                        onChange={(e) =>
                          setNoteDrafts((prev) => ({ ...prev, [lead.id]: e.target.value }))
                        }
                        placeholder="Примечание по лиду"
                        className="min-h-20 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                      />
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <select
                          value={mentionDrafts[lead.id] ?? ""}
                          onChange={(e) =>
                            setMentionDrafts((prev) => ({ ...prev, [lead.id]: e.target.value }))
                          }
                          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-sm text-ink"
                        >
                          <option value="">Никого не отмечать</option>
                          {users
                            .filter((user) => user.is_active)
                            .map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name}
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={() => addNote(lead)}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-white"
                        >
                          <Save size={15} />
                          Сохранить примечание
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
            {filteredLeads.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-12 text-center text-sm text-ink-faint">
                По этим фильтрам заявок нет.
              </div>
            )}
          </div>
        </section>
      </div>

      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-glow">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">Добавить лид вручную</h2>
                <p className="text-sm text-ink-dim">Звонок, встреча, рекомендация</p>
              </div>
              <button
                onClick={() => setShowManualModal(false)}
                className="rounded-lg bg-bg p-2 text-ink-dim hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2">
              <input
                className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-ink"
                placeholder="Имя"
                value={manualLead.name}
                onChange={(e) => setManualLead({ ...manualLead, name: e.target.value })}
              />
              <input
                className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-ink"
                placeholder="Телефон / Telegram"
                value={manualLead.phone}
                onChange={(e) => setManualLead({ ...manualLead, phone: e.target.value })}
              />
              <input
                className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-ink"
                placeholder="Email"
                value={manualLead.email}
                onChange={(e) => setManualLead({ ...manualLead, email: e.target.value })}
              />
              <select
                className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-ink"
                value={manualLead.source}
                onChange={(e) => setManualLead({ ...manualLead, source: e.target.value })}
              >
                <option value="other">Ручной ввод</option>
                <option value="telegram">Telegram</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="referral">Рекомендация</option>
              </select>
              <textarea
                className="min-h-28 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink"
                placeholder="Комментарий, ниша, задача"
                value={manualLead.message}
                onChange={(e) => setManualLead({ ...manualLead, message: e.target.value })}
              />
              <button
                onClick={createManualLead}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white"
              >
                <Check size={16} />
                Добавить лид
              </button>
            </div>
            <div className="mt-4 rounded-xl bg-bg p-3 text-xs leading-relaxed text-ink-dim">
              <div className="mb-1 flex items-center gap-2 font-semibold text-ink">
                <Send size={14} />
                Живой поток
              </div>
              <p>Сайт, попап и Telegram уже приходят сюда.</p>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
