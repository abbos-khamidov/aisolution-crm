"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Check,
  FileText,
  FolderPlus,
  MessageSquare,
  Paperclip,
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
  proposal_file_id: number | null;
  expected_amount_min: string | null;
  expected_amount_mid: string | null;
  expected_amount_max: string | null;
  selected_package: string | null;
  selected_amount: string | null;
  currency: string;
}

interface User {
  id: number;
  name: string;
  role: string;
  is_active: boolean;
}

interface DealDraft {
  expected_amount_min: string;
  expected_amount_mid: string;
  expected_amount_max: string;
  selected_package: "min" | "mid" | "max" | "custom";
  selected_amount: string;
  currency: string;
  proposal_file_id: number | null;
  proposal_file_name: string;
  file: File | null;
}

const STATUSES = ["new", "contacted", "qualified", "proposal_sent", "won", "lost"];
const PIPELINE_STATUSES = ["new", "contacted", "qualified", "proposal_sent", "won"] as const;

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
  const [toast, setToast] = useState<string | null>(null);
  const [dealDrafts, setDealDrafts] = useState<Record<number, DealDraft>>({});
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [detailLeadId, setDetailLeadId] = useState<number | null>(null);
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
    const data: Lead[] = await res.json();
    setLeads(data);
    setDealDrafts((current) => {
      const next = { ...current };
      for (const lead of data) {
        if (next[lead.id]) continue;
        next[lead.id] = {
          expected_amount_min: lead.expected_amount_min ?? "",
          expected_amount_mid: lead.expected_amount_mid ?? "",
          expected_amount_max: lead.expected_amount_max ?? "",
          selected_package: (lead.selected_package as DealDraft["selected_package"]) ?? "mid",
          selected_amount: lead.selected_amount ?? "",
          currency: lead.currency ?? "USD",
          proposal_file_id: lead.proposal_file_id,
          proposal_file_name: lead.proposal_file_id ? `КП #${lead.proposal_file_id}` : "",
          file: null,
        };
      }
      return next;
    });
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

  const assignees = users.filter((u) => u.role !== "student" && u.is_active);
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
  const selectedLead = filteredLeads.find((lead) => lead.id === selectedLeadId) ?? null;
  const detailLead = leads.find((lead) => lead.id === detailLeadId) ?? null;

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 4200);
  }

  function updateDealDraft(leadId: number, patch: Partial<DealDraft>) {
    setDealDrafts((current) => ({
      ...current,
      [leadId]: {
        ...(current[leadId] ?? {
          expected_amount_min: "",
          expected_amount_mid: "",
          expected_amount_max: "",
          selected_package: "mid",
          selected_amount: "",
          currency: "USD",
          proposal_file_id: null,
          proposal_file_name: "",
          file: null,
        }),
        ...patch,
      },
    }));
  }

  function selectedAmountFromDraft(draft: DealDraft): string {
    if (draft.selected_package === "min") return draft.expected_amount_min;
    if (draft.selected_package === "mid") return draft.expected_amount_mid;
    if (draft.selected_package === "max") return draft.expected_amount_max;
    return draft.selected_amount;
  }

  async function uploadProposalIfNeeded(lead: Lead): Promise<number | null> {
    const draft = dealDrafts[lead.id];
    if (!draft?.file) return draft?.proposal_file_id ?? lead.proposal_file_id ?? null;
    if (draft.file.type !== "application/pdf") {
      setError("КП нужно прикрепить в PDF.");
      return null;
    }
    const formData = new FormData();
    formData.append("file", draft.file);
    formData.append("lead_id", String(lead.id));
    const res = await apiFetch("/files", { method: "POST", body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка загрузки PDF: ${res.status}`);
      return null;
    }
    const file = await res.json();
    updateDealDraft(lead.id, {
      proposal_file_id: file.id,
      proposal_file_name: file.filename,
      file: null,
    });
    return file.id;
  }

  async function claim(leadId: number) {
    setError(null);
    const res = await apiFetch(`/leads/${leadId}/claim`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    showToast("Лид закреплён за тобой. Уведомление отправлено в группу.");
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
    const draft = dealDrafts[lead.id];
    const selectedAmount = draft ? selectedAmountFromDraft(draft) : "";
    if (nextStatus === "won" && !selectedAmount) {
      setError("Для выигранного лида выбери пакет или впиши финальную сумму.");
      return;
    }
    const proposalFileId = await uploadProposalIfNeeded(lead);
    if (dealDrafts[lead.id]?.file && proposalFileId === null) return;
    const body: Record<string, string | number | null> = {
      status: nextStatus,
      proposal_file_id: proposalFileId,
    };
    if (draft) {
      body.expected_amount_min = draft.expected_amount_min || null;
      body.expected_amount_mid = draft.expected_amount_mid || null;
      body.expected_amount_max = draft.expected_amount_max || null;
      body.selected_package = draft.selected_package;
      body.selected_amount = selectedAmount || null;
      body.currency = draft.currency || "USD";
    }
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
    showToast(
      nextStatus === "won"
        ? `Выигран: ${lead.name}. Сумма ушла в финансы и аналитику.`
        : `Сохранено: ${lead.name} · стадия ${STATUS_LABEL[nextStatus]}. Группа получила уведомление.`
    );
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
    const ownerName = userById.get(Number(ownerId))?.name ?? "ответственным";
    showToast(`Лид закреплён за ${ownerName}. Уведомление отправлено в группу.`);
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
      {toast && (
        <div className="fixed right-6 top-6 z-50 w-[min(360px,calc(100vw-32px))] rounded-2xl border border-success/20 bg-white/95 p-4 text-sm text-ink shadow-glow backdrop-blur">
          <div className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
              <Check size={18} />
            </span>
            <div>
              <p className="font-semibold text-ink">Готово</p>
              <p className="mt-1 leading-5 text-ink-dim">{toast}</p>
            </div>
          </div>
        </div>
      )}
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
              const dealDraft = dealDrafts[lead.id];
              return (
                <article
                  key={lead.id}
                  onClick={() => setSelectedLeadId(lead.id)}
                  className={`cursor-pointer rounded-2xl border bg-surface p-4 shadow-sm transition hover:border-accent ${
                    selectedLeadId === lead.id ? "border-accent shadow-glow" : "border-border"
                  }`}
                >
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
                      <p className="mt-1 text-xs font-medium text-accent-strong">
                        Этап: {STATUS_LABEL[lead.status] ?? lead.status}. Кликните, чтобы узнать подробнее.
                      </p>
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
                      {canEdit(lead) && dealDraft && (
                        <div className="mt-4 rounded-xl border border-border bg-bg p-3">
                          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                            <FileText size={16} className="text-accent-strong" />
                            КП и сумма сделки
                          </div>
                          <div className="grid gap-2 sm:grid-cols-4">
                            <input
                              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-ink"
                              placeholder="Мин"
                              inputMode="decimal"
                              value={dealDraft.expected_amount_min}
                              onChange={(e) => updateDealDraft(lead.id, { expected_amount_min: e.target.value })}
                            />
                            <input
                              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-ink"
                              placeholder="Сред"
                              inputMode="decimal"
                              value={dealDraft.expected_amount_mid}
                              onChange={(e) => updateDealDraft(lead.id, { expected_amount_mid: e.target.value })}
                            />
                            <input
                              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-ink"
                              placeholder="Макс"
                              inputMode="decimal"
                              value={dealDraft.expected_amount_max}
                              onChange={(e) => updateDealDraft(lead.id, { expected_amount_max: e.target.value })}
                            />
                            <select
                              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-ink"
                              value={dealDraft.currency}
                              onChange={(e) => updateDealDraft(lead.id, { currency: e.target.value })}
                            >
                              <option value="USD">USD</option>
                              <option value="UZS">UZS</option>
                              <option value="RUB">RUB</option>
                            </select>
                          </div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                            <select
                              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-ink"
                              value={dealDraft.selected_package}
                              onChange={(e) =>
                                updateDealDraft(lead.id, {
                                  selected_package: e.target.value as DealDraft["selected_package"],
                                })
                              }
                            >
                              <option value="min">Минимальный пакет</option>
                              <option value="mid">Средний пакет</option>
                              <option value="max">Максимальный пакет</option>
                              <option value="custom">Вписать вручную</option>
                            </select>
                            <input
                              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-ink disabled:text-ink-faint"
                              placeholder="Финальная сумма"
                              inputMode="decimal"
                              disabled={dealDraft.selected_package !== "custom"}
                              value={
                                dealDraft.selected_package === "custom"
                                  ? dealDraft.selected_amount
                                  : selectedAmountFromDraft(dealDraft)
                              }
                              onChange={(e) => updateDealDraft(lead.id, { selected_amount: e.target.value })}
                            />
                            <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-ink hover:border-accent hover:text-accent-strong">
                              <Paperclip size={15} />
                              PDF КП
                              <input
                                type="file"
                                accept="application/pdf,.pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0] ?? null;
                                  updateDealDraft(lead.id, {
                                    file,
                                    proposal_file_name: file?.name ?? dealDraft.proposal_file_name,
                                  });
                                }}
                              />
                            </label>
                          </div>
                          {(dealDraft.proposal_file_name || lead.proposal_file_id) && (
                            <p className="mt-2 text-xs text-ink-faint">
                              КП: {dealDraft.proposal_file_name || `файл #${lead.proposal_file_id}`}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid shrink-0 gap-2 sm:grid-cols-2 lg:w-64 lg:grid-cols-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setSelectedLeadId(lead.id);
                          setDetailLeadId(lead.id);
                        }}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-accent/25 bg-accent-soft px-3 text-sm font-semibold text-accent-strong hover:border-accent"
                      >
                        Подробнее
                      </button>
                      {me?.role === "founder" && (
                        <select
                          value={lead.owner_id ?? ""}
                          onChange={(e) => assignLead(lead.id, e.target.value)}
                          className="h-9 rounded-lg border border-border bg-bg px-2 text-sm text-ink"
                        >
                          <option value="">Назначить ответственного</option>
                          {assignees.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
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

      {selectedLead && (
        <section className="sticky bottom-4 z-30 mt-6 rounded-2xl border border-border bg-white/95 p-5 shadow-glow backdrop-blur">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-ink-faint">Этапность лида</p>
              <h2 className="font-display text-lg font-semibold text-ink">{selectedLead.name}</h2>
            </div>
            <p className="text-sm text-ink-dim">
              Сейчас: {STATUS_LABEL[selectedLead.status] ?? selectedLead.status}
            </p>
          </div>
          <LeadTimeline status={selectedLead.status} />
        </section>
      )}

      {detailLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-white p-5 shadow-glow">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-ink-faint">Карточка лида</p>
                <h2 className="mt-1 font-display text-2xl font-semibold text-ink">{detailLead.name}</h2>
                <p className="mt-1 text-sm text-ink-dim">
                  {sourceLabel(detailLead)} · {new Date(detailLead.created_at).toLocaleString("ru-RU")}
                </p>
              </div>
              <button
                onClick={() => setDetailLeadId(null)}
                className="rounded-lg bg-bg p-2 text-ink-dim hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <div className="rounded-2xl border border-border bg-bg p-4">
              <LeadTimeline status={detailLead.status} />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border border-border bg-surface p-4">
                <h3 className="font-display text-base font-semibold text-ink">Информация</h3>
                <div className="mt-3 space-y-2 text-sm text-ink-dim">
                  <p><span className="font-semibold text-ink">Статус:</span> {STATUS_LABEL[detailLead.status] ?? detailLead.status}</p>
                  <p><span className="font-semibold text-ink">Ответственный:</span> {detailLead.owner_id ? userById.get(detailLead.owner_id)?.name ?? detailLead.owner_id : "не назначен"}</p>
                  {detailLead.phone && <p><span className="font-semibold text-ink">Телефон:</span> {detailLead.phone}</p>}
                  {detailLead.email && <p><span className="font-semibold text-ink">Email:</span> {detailLead.email}</p>}
                  {detailLead.loss_reason && <p><span className="font-semibold text-ink">Причина отказа:</span> {detailLead.loss_reason}</p>}
                </div>
                {detailLead.message && (
                  <p className="mt-4 whitespace-pre-wrap rounded-xl bg-bg px-3 py-2 text-sm leading-6 text-ink-dim">
                    {detailLead.message}
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-border bg-surface p-4">
                <h3 className="font-display text-base font-semibold text-ink">КП и деньги</h3>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <DealMetric label="Мин" value={detailLead.expected_amount_min} currency={detailLead.currency} />
                  <DealMetric label="Сред" value={detailLead.expected_amount_mid} currency={detailLead.currency} />
                  <DealMetric label="Макс" value={detailLead.expected_amount_max} currency={detailLead.currency} />
                  <DealMetric label="Финал" value={detailLead.selected_amount} currency={detailLead.currency} />
                </div>
                <p className="mt-3 text-sm text-ink-dim">
                  Пакет: <span className="font-semibold text-ink">{detailLead.selected_package ?? "не выбран"}</span>
                </p>
                <p className="mt-1 text-sm text-ink-dim">
                  PDF КП: <span className="font-semibold text-ink">{detailLead.proposal_file_id ? `файл #${detailLead.proposal_file_id}` : "не прикреплён"}</span>
                </p>
              </section>
            </div>
          </div>
        </div>
      )}

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

function DealMetric({
  label,
  value,
  currency,
}: {
  label: string;
  value: string | null;
  currency: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg p-3">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="mt-1 font-mono-num text-sm font-semibold text-ink">
        {value ? `${Number(value).toLocaleString("ru-RU")} ${currency}` : "—"}
      </p>
    </div>
  );
}

function LeadTimeline({ status }: { status: string }) {
  const isLost = status === "lost";
  const activeIndex = isLost
    ? PIPELINE_STATUSES.length - 1
    : Math.max(0, PIPELINE_STATUSES.findIndex((item) => item === status));

  return (
    <div>
      <div className="relative grid grid-cols-5 gap-2">
        <div className="absolute left-[10%] right-[10%] top-5 h-0.5 bg-border" />
        <div
          className={`absolute left-[10%] top-5 h-0.5 ${isLost ? "bg-danger" : "bg-accent"}`}
          style={{ width: `${Math.max(0, activeIndex) * 20}%` }}
        />
        {PIPELINE_STATUSES.map((item, index) => {
          const done = index <= activeIndex && !isLost;
          const current = item === status;
          return (
            <div key={item} className="relative flex min-w-0 flex-col items-center text-center">
              <span
                className={`z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold ${
                  current
                    ? "border-accent bg-accent text-white"
                    : done
                      ? "border-accent bg-accent-soft text-accent-strong"
                      : "border-border bg-white text-ink-faint"
                }`}
              >
                {index + 1}
              </span>
              <span className="mt-2 text-[11px] font-semibold leading-tight text-ink">
                {STATUS_LABEL[item]}
              </span>
            </div>
          );
        })}
      </div>
      {isLost && (
        <p className="mt-4 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
          Лид потерян. Причина отказа хранится в карточке лида.
        </p>
      )}
    </div>
  );
}
