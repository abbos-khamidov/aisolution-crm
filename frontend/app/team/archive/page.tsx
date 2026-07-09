"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";
import AppShell from "@/components/AppShell";
import Badge from "@/components/Badge";
import { apiFetch, clearTokens } from "@/lib/api";

interface ArchivedUser {
  id: number;
  name: string;
  phone: string | null;
  email: string;
  telegram_id: number | null;
  role: string;
  role_title: string | null;
  archived_at: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  founder: "Founder",
  manager: "Менеджер",
  developer: "Разработчик",
  student: "Ученик",
};
const ALL_POSITIONS = "__all__";

function positionOf(user: Pick<ArchivedUser, "role" | "role_title">): string {
  return user.role_title?.trim() || ROLE_LABELS[user.role] || user.role;
}

export default function TeamArchivePage() {
  const router = useRouter();
  const [users, setUsers] = useState<ArchivedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [positionFilter, setPositionFilter] = useState(ALL_POSITIONS);

  async function load() {
    const res = await apiFetch("/users?archived=true");
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
    setUsers(await res.json());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const positions = useMemo(
    () => Array.from(new Set(users.map(positionOf))).sort((a, b) => a.localeCompare(b, "ru")),
    [users]
  );

  const visibleUsers = useMemo(
    () =>
      positionFilter === ALL_POSITIONS
        ? users
        : users.filter((u) => positionOf(u) === positionFilter),
    [users, positionFilter]
  );

  async function unarchiveUser(userId: number) {
    setError(null);
    const res = await apiFetch(`/users/${userId}/unarchive`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.detail ?? `Ошибка ${res.status}`);
      return;
    }
    await load();
  }

  return (
    <AppShell eyebrow="Доступы и роли" title="Архив сотрудников">
      <Link
        href="/team"
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-ink-dim hover:text-ink"
      >
        <ArrowLeft size={16} />
        Назад к команде
      </Link>

      {error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {users.length === 0 && !error && (
        <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-ink-dim">
          Архив пуст — никто из сотрудников ещё не архивирован.
        </p>
      )}

      {users.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">Должность</span>
          <button
            onClick={() => setPositionFilter(ALL_POSITIONS)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              positionFilter === ALL_POSITIONS
                ? "border-accent bg-accent text-white"
                : "border-border bg-surface text-ink-dim hover:border-border-bright"
            }`}
          >
            Все ({users.length})
          </button>
          {positions.map((position) => {
            const count = users.filter((u) => positionOf(u) === position).length;
            return (
              <button
                key={position}
                onClick={() => setPositionFilter(position)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  positionFilter === position
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-surface text-ink-dim hover:border-border-bright"
                }`}
              >
                {position} ({count})
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibleUsers.map((u) => (
          <article key={u.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 opacity-80">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-base font-semibold text-ink-faint">
                  {(u.name || "?").slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className="font-display text-sm font-semibold text-ink">{u.name || "Без имени"}</p>
                  <p className="text-xs text-ink-faint">{positionOf(u)}</p>
                </div>
              </div>
              <Badge label="в архиве" tone="neutral" />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-ink-dim">
              <div className="col-span-2">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-faint">Email</span>
                {u.email || "—"}
              </div>
              <div>
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-faint">Телефон</span>
                {u.phone || "—"}
              </div>
              <div>
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-faint">Telegram ID</span>
                {u.telegram_id ?? "—"}
              </div>
              <div className="col-span-2">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-faint">В архиве с</span>
                {u.archived_at ? new Date(u.archived_at).toLocaleDateString("ru-RU") : "—"}
              </div>
            </div>

            <button
              onClick={() => unarchiveUser(u.id)}
              className="flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white"
            >
              <RotateCcw size={14} />
              Восстановить
            </button>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
