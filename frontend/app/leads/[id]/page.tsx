"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Archive, Check, FolderKanban, RotateCcw, Save } from "lucide-react";
import AppShell from "@/components/AppShell";
import Badge from "@/components/Badge";
import { apiFetch, clearTokens, getToken } from "@/lib/api";
import { decodeJwt } from "@/lib/jwt";

interface Lead {
  id: number;
  source: string;
  name: string;
  company_name: string | null;
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

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const leadId = Number(params.id);
  const [lead, setLead] = useState<Lead | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    company_name: "",
    phone: "",
    email: "",
    message: "",
    status: "new",
    loss_reason: "",
    owner_id: "",
    expected_amount_min: "",
    expected_amount_mid: "",
    expected_amount_max: "",
    selected_package: "mid",
    selected_amount: "",
    currency: "USD",
  });

  const me = useMemo(() => {
    const token = getToken();
    return token ? decodeJwt(token) : null;
  }, []);

  async function load() {
    const [leadRes, usersRes] = await Promise.all([apiFetch(`/leads/${leadId}`), apiFetch("/users")]);
    if (leadRes.status === 401) {
      clearTokens();
      router.push("/login");
      return;
    }
    if (!leadRes.ok) {
      const body = await leadRes.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${leadRes.status}`);
      return;
    }
    const data: Lead = await leadRes.json();
    setLead(data);
    setForm({
      name: data.name ?? "",
      company_name: data.company_name ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      message: data.message ?? "",
      status: data.status,
      loss_reason: data.loss_reason ?? "",
      owner_id: data.owner_id ? String(data.owner_id) : "",
      expected_amount_min: data.expected_amount_min ?? "",
      expected_amount_mid: data.expected_amount_mid ?? "",
      expected_amount_max: data.expected_amount_max ?? "",
      selected_package: data.selected_package ?? "mid",
      selected_amount: data.selected_amount ?? "",
      currency: data.currency ?? "USD",
    });
    if (usersRes.ok) setUsers(await usersRes.json());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  function canEdit() {
    if (!lead || !me) return false;
    return me.role === "founder" || lead.owner_id === Number(me.sub);
  }

  function selectedAmount(): string {
    if (form.selected_package === "min") return form.expected_amount_min;
    if (form.selected_package === "mid") return form.expected_amount_mid;
    if (form.selected_package === "max") return form.expected_amount_max;
    return form.selected_amount;
  }

  async function save() {
    if (!form.name.trim()) {
      setError("Имя лида обязательно.");
      return;
    }
    if (form.status === "won" && !selectedAmount()) {
      setError("Для выигранного лида укажи финальную сумму.");
      return;
    }
    if (form.status === "lost" && !form.loss_reason.trim()) {
      setError("Для потерянного лида нужна причина.");
      return;
    }
    setError(null);
    const payload: Record<string, string | number | null> = {
      name: form.name.trim(),
      company_name: form.company_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      message: form.message.trim() || null,
      status: form.status,
      loss_reason: form.status === "lost" ? form.loss_reason.trim() : null,
      expected_amount_min: form.expected_amount_min || null,
      expected_amount_mid: form.expected_amount_mid || null,
      expected_amount_max: form.expected_amount_max || null,
      selected_package: form.selected_package,
      selected_amount: selectedAmount() || null,
      currency: form.currency,
    };
    if (me?.role === "founder") payload.owner_id = form.owner_id ? Number(form.owner_id) : null;
    const res = await apiFetch(`/leads/${leadId}`, { method: "PATCH", body: JSON.stringify(payload) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    const updated = await res.json();
    setLead(updated);
    setToast(form.status === "won" ? "Лид выигран. Проект и финансы синхронизированы." : "Изменения сохранены.");
    window.setTimeout(() => setToast(null), 3500);
  }

  async function claim() {
    const res = await apiFetch(`/leads/${leadId}/claim`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    setToast("Лид закреплен за тобой.");
    await load();
  }

  async function setArchive(archived: boolean) {
    const res = await apiFetch(`/leads/${leadId}/${archived ? "archive" : "unarchive"}`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    setToast(archived ? "Лид отправлен в архив." : "Лид возвращен в работу.");
    await load();
  }

  const owner = lead?.owner_id ? users.find((u) => u.id === lead.owner_id)?.name ?? `#${lead.owner_id}` : "Очередь";

  return (
    <AppShell eyebrow="Карточка лида" title={lead?.name ?? "Лид"}>
      <Link href="/leads" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-ink-dim hover:text-ink">
        <ArrowLeft size={16} />
        Назад к списку
      </Link>
      {error && <p className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {toast && (
        <p className="mb-4 inline-flex items-center gap-2 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm font-semibold text-success">
          <Check size={16} />
          {toast}
        </p>
      )}
      {lead && (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <section className="rounded-2xl border border-border bg-surface p-5">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <Badge label={STATUS_LABEL[lead.status] ?? lead.status} tone={STATUS_TONE[lead.status] ?? "neutral"} />
              <Badge label={owner} tone={lead.owner_id ? "accent" : "spark"} />
              <span className="text-xs text-ink-faint">{new Date(lead.created_at).toLocaleString("ru-RU")}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Лид"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" /></Field>
              <Field label="Компания"><input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="field" /></Field>
              <Field label="Телефон / Telegram"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="field" /></Field>
              <Field label="Email"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="field" /></Field>
              <div className="md:col-span-2">
                <Field label="Задача / комментарий">
                  <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="field min-h-28 py-2" />
                </Field>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="font-display text-lg font-semibold text-ink">Статус и владелец</h2>
              <div className="mt-3 grid gap-3">
                <Field label="Статус">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="field">
                    {STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
                  </select>
                </Field>
                {form.status === "lost" && (
                  <Field label="Причина отказа">
                    <input value={form.loss_reason} onChange={(e) => setForm({ ...form, loss_reason: e.target.value })} className="field" />
                  </Field>
                )}
                {me?.role === "founder" && (
                  <Field label="Ответственный">
                    <select value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })} className="field">
                      <option value="">Очередь</option>
                      {users.filter((u) => u.is_active && u.role !== "student").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </Field>
                )}
                {!lead.owner_id && <button onClick={claim} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Взять в работу</button>}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="font-display text-lg font-semibold text-ink">КП и сумма</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Мин"><input inputMode="decimal" value={form.expected_amount_min} onChange={(e) => setForm({ ...form, expected_amount_min: e.target.value })} className="field" /></Field>
                <Field label="Сред"><input inputMode="decimal" value={form.expected_amount_mid} onChange={(e) => setForm({ ...form, expected_amount_mid: e.target.value })} className="field" /></Field>
                <Field label="Макс"><input inputMode="decimal" value={form.expected_amount_max} onChange={(e) => setForm({ ...form, expected_amount_max: e.target.value })} className="field" /></Field>
                <Field label="Валюта"><input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="field" /></Field>
              </div>
              <div className="mt-3 grid gap-3">
                <Field label="Выбранный пакет">
                  <select value={form.selected_package} onChange={(e) => setForm({ ...form, selected_package: e.target.value })} className="field">
                    <option value="min">Минимальный</option>
                    <option value="mid">Средний</option>
                    <option value="max">Максимальный</option>
                    <option value="custom">Вручную</option>
                  </select>
                </Field>
                {form.selected_package === "custom" && (
                  <Field label="Финальная сумма"><input inputMode="decimal" value={form.selected_amount} onChange={(e) => setForm({ ...form, selected_amount: e.target.value })} className="field" /></Field>
                )}
              </div>
              {lead.proposal_file_id && <p className="mt-3 text-sm text-ink-dim">КП: файл #{lead.proposal_file_id}</p>}
            </section>

            <div className="grid gap-2">
              <button onClick={save} disabled={!canEdit()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                <Save size={16} />
                Сохранить
              </button>
              {lead.status === "won" && (
                <Link href="/projects" className="inline-flex items-center justify-center gap-2 rounded-lg border border-success/30 bg-success-soft px-4 py-2.5 text-sm font-semibold text-success">
                  <FolderKanban size={16} />
                  Открыть проекты
                </Link>
              )}
              <button onClick={() => setArchive(!lead.archived_at)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-ink">
                {lead.archived_at ? <RotateCcw size={16} /> : <Archive size={16} />}
                {lead.archived_at ? "Вернуть из архива" : "Архивировать"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</span>
      {children}
    </label>
  );
}
