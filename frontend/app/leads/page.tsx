"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
    let path = "/leads";
    if (filter === "queue") path += "?owner_id=";
    const res = await apiFetch(path);
    if (res.status === 401) {
      clearTokens();
      router.push("/login");
      return;
    }
    const data: Lead[] = await res.json();
    setLeads(data);
  }

  useEffect(() => {
    loadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

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
        setError("Для отказа нужен loss_reason");
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

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Лиды</h1>
        <button
          onClick={() => {
            clearTokens();
            router.push("/login");
          }}
          className="text-sm text-gray-500 underline"
        >
          Выйти
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        {(["all", "queue", "mine"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded px-3 py-1 text-sm ${
              filter === f ? "bg-black text-white" : "bg-gray-100"
            }`}
          >
            {f === "all" ? "Все" : f === "queue" ? "Общая очередь" : "Мои лиды"}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">ID</th>
            <th>Имя</th>
            <th>Источник</th>
            <th>Статус</th>
            <th>Owner</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {visibleLeads.map((lead) => (
            <tr key={lead.id} className="border-b">
              <td className="py-2">{lead.id}</td>
              <td>{lead.name}</td>
              <td>{lead.source}</td>
              <td>{lead.status}</td>
              <td>{lead.owner_id ?? "—"}</td>
              <td className="flex flex-col gap-1 py-2">
                {lead.owner_id === null && (
                  <button
                    onClick={() => claim(lead.id)}
                    className="w-fit rounded bg-black px-2 py-1 text-xs text-white"
                  >
                    Взять в работу
                  </button>
                )}
                {canEdit(lead) && (
                  <div className="flex items-center gap-1">
                    <select
                      value={statusDrafts[lead.id] ?? lead.status}
                      onChange={(e) =>
                        setStatusDrafts((prev) => ({ ...prev, [lead.id]: e.target.value }))
                      }
                      className="rounded border px-1 py-0.5 text-xs"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    {(statusDrafts[lead.id] ?? lead.status) === "lost" && (
                      <input
                        placeholder="loss_reason"
                        value={lossReasonDrafts[lead.id] ?? ""}
                        onChange={(e) =>
                          setLossReasonDrafts((prev) => ({
                            ...prev,
                            [lead.id]: e.target.value,
                          }))
                        }
                        className="rounded border px-1 py-0.5 text-xs"
                      />
                    )}
                    <button
                      onClick={() => updateStatus(lead)}
                      className="rounded bg-gray-800 px-2 py-1 text-xs text-white"
                    >
                      Сохранить
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
