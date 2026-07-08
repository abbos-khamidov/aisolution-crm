"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import Badge from "@/components/Badge";
import { apiFetch, clearTokens, getToken } from "@/lib/api";
import { decodeJwt } from "@/lib/jwt";

interface Lead {
  id: number;
  source: string;
  name: string;
  status: string;
  owner_id: number | null;
  loss_reason: string | null;
  created_at: string;
}

const STATUSES = ["new", "contacted", "qualified", "proposal_sent", "won", "lost"];

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
  { key: "queue", label: "Общая очередь" },
  { key: "mine", label: "Мои лиды" },
] as const;

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filter, setFilter] = useState<"all" | "queue" | "mine">("all");
  const [error, setError] = useState<string | null>(null);
  const [statusDrafts, setStatusDrafts] = useState<Record<number, string>>({});
  const [lossReasonDrafts, setLossReasonDrafts] = useState<Record<number, string>>({});

  const me = useMemo(() => {
    const token = getToken();
    return token ? decodeJwt(token) : null;
  }, []);

  async function loadLeads() {
    const res = await apiFetch("/leads");
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
  }

  useEffect(() => {
    loadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleLeads = leads.filter((lead) => {
    if (filter === "queue") return lead.owner_id === null;
    if (filter === "mine") return me && lead.owner_id === Number(me.sub);
    return true;
  });

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

  async function updateStatus(lead: Lead) {
    setError(null);
    const nextStatus = statusDrafts[lead.id] ?? lead.status;
    const lossReason = lossReasonDrafts[lead.id];

    const body: Record<string, string> = { status: nextStatus };
    if (nextStatus === "lost") {
      if (!lossReason) {
        setError("Отказ без причины не считается — заполни loss_reason.");
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

  function canEdit(lead: Lead): boolean {
    if (!me) return false;
    if (me.role === "founder") return true;
    return lead.owner_id === Number(me.sub);
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

  return (
    <AppShell eyebrow="Воронка продаж" title="Лиды">
      <div className="rise-in mb-5 flex gap-2" style={{ animationDelay: "60ms" }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              filter === f.key
                ? "bg-accent text-[#04121a]"
                : "bg-surface text-ink-dim hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rise-in mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="rise-in overflow-hidden rounded-2xl border border-border" style={{ animationDelay: "120ms" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-3 font-medium">Имя</th>
              <th className="px-4 py-3 font-medium">Источник</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {visibleLeads.map((lead) => (
              <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-surface/60">
                <td className="px-4 py-3 font-medium text-ink">{lead.name}</td>
                <td className="px-4 py-3 text-ink-dim">{lead.source}</td>
                <td className="px-4 py-3">
                  <Badge label={lead.status} tone={STATUS_TONE[lead.status] ?? "neutral"} />
                </td>
                <td className="px-4 py-3 font-mono-num text-ink-dim">{lead.owner_id ?? "—"}</td>
                <td className="flex flex-col gap-1.5 px-4 py-3">
                  {lead.owner_id === null && (
                    <button
                      onClick={() => claim(lead.id)}
                      className="w-fit rounded-full bg-accent px-3 py-1 text-xs font-semibold text-[#04121a] transition hover:bg-accent-strong"
                    >
                      Взять в работу
                    </button>
                  )}
                  {lead.status === "won" && canEdit(lead) && (
                    <button
                      onClick={() => convertToProject(lead)}
                      className="w-fit rounded-full bg-success/90 px-3 py-1 text-xs font-semibold text-[#04160f] transition hover:bg-success"
                    >
                      Создать проект
                    </button>
                  )}
                  {canEdit(lead) && (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={statusDrafts[lead.id] ?? lead.status}
                        onChange={(e) =>
                          setStatusDrafts((prev) => ({ ...prev, [lead.id]: e.target.value }))
                        }
                        className="rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-ink"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      {(statusDrafts[lead.id] ?? lead.status) === "lost" && (
                        <input
                          placeholder="причина отказа"
                          value={lossReasonDrafts[lead.id] ?? ""}
                          onChange={(e) =>
                            setLossReasonDrafts((prev) => ({
                              ...prev,
                              [lead.id]: e.target.value,
                            }))
                          }
                          className="rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-ink"
                        />
                      )}
                      <button
                        onClick={() => updateStatus(lead)}
                        className="rounded-md bg-surface-2 px-2 py-1 text-xs font-medium text-ink transition hover:bg-border-bright"
                      >
                        Сохранить
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {visibleLeads.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-faint">
                  Пусто. Либо всё разобрано, либо пора запускать рекламу.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
