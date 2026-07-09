"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Eye, EyeOff } from "lucide-react";
import AppShell from "@/components/AppShell";
import Badge from "@/components/Badge";
import { apiFetch, clearTokens } from "@/lib/api";

interface User {
  id: number;
  name: string;
  phone: string | null;
  email: string;
  telegram_id: number | null;
  role: string;
  role_title: string | null;
  is_active: boolean;
  can_view_all_leads: boolean;
  can_view_analytics: boolean;
  can_view_finance: boolean;
}

interface UserDraft {
  name: string;
  email: string;
  phone: string;
  telegram_id: string;
  role: string;
  role_title: string;
  password: string;
  can_view_all_leads: boolean;
  can_view_analytics: boolean;
  can_view_finance: boolean;
}

const ROLES = ["manager", "developer", "student"] as const;
const ROLE_LABELS: Record<string, string> = {
  founder: "Founder",
  manager: "Менеджер",
  developer: "Разработчик",
  student: "Ученик",
};
const ALL_POSITIONS = "__all__";

function positionOf(user: Pick<User, "role" | "role_title">): string {
  return user.role_title?.trim() || ROLE_LABELS[user.role] || user.role;
}

export default function TeamPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [drafts, setDrafts] = useState<Record<number, UserDraft>>({});
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [positionFilter, setPositionFilter] = useState(ALL_POSITIONS);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    telegram_id: "",
    role: "manager",
    role_title: "",
  });

  async function load() {
    const res = await apiFetch("/users");
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
    const data: User[] = await res.json();
    setUsers(data);
    setDrafts(
      Object.fromEntries(
        data.map((user) => [
          user.id,
          {
            name: user.name,
            email: user.email,
            phone: user.phone ?? "",
            telegram_id: user.telegram_id ? String(user.telegram_id) : "",
            role: user.role,
            role_title: user.role_title ?? "",
            password: "",
            can_view_all_leads: user.can_view_all_leads,
            can_view_analytics: user.can_view_analytics,
            can_view_finance: user.can_view_finance,
          },
        ])
      )
    );
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

  async function createUser() {
    setError(null);
    const payload = {
      ...form,
      telegram_id: form.telegram_id ? Number(form.telegram_id) : null,
      phone: form.phone || null,
      password: form.password || null,
      role_title: form.role_title || null,
    };
    const res = await apiFetch("/users", { method: "POST", body: JSON.stringify(payload) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    setForm({ name: "", email: "", password: "", phone: "", telegram_id: "", role: "manager", role_title: "" });
    showToast("Сотрудник добавлен.");
    await load();
  }

  async function patchUser(userId: number, body: Record<string, string | number | boolean | null>) {
    const res = await apiFetch(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.detail ?? `Ошибка ${res.status}`);
      return;
    }
    showToast("Изменения сотрудника сохранены.");
    await load();
  }

  async function archiveUser(userId: number) {
    setError(null);
    const res = await apiFetch(`/users/${userId}/archive`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.detail ?? `Ошибка ${res.status}`);
      return;
    }
    showToast("Сотрудник отправлен в архив.");
    await load();
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3600);
  }

  function updateDraft(userId: number, patch: Partial<UserDraft>) {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        ...patch,
      },
    }));
  }

  async function saveUser(userId: number) {
    const draft = drafts[userId];
    if (!draft) return;
    await patchUser(userId, {
      name: draft.name,
      email: draft.email,
      phone: draft.phone || null,
      telegram_id: draft.telegram_id ? Number(draft.telegram_id) : null,
      role: draft.role,
      role_title: draft.role_title || null,
      can_view_all_leads: draft.can_view_all_leads,
      can_view_analytics: draft.can_view_analytics,
      can_view_finance: draft.can_view_finance,
      ...(draft.password ? { password: draft.password } : {}),
    });
  }

  return (
    <AppShell eyebrow="Доступы и роли" title="Команда">
      {toast && (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border border-success/20 bg-white/95 px-4 py-3 text-sm font-semibold text-success shadow-glow">
          {toast}
        </div>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mb-6 grid gap-3 rounded-2xl border border-border bg-surface p-4 md:grid-cols-7">
        <input className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink" placeholder="Имя" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <div className="relative">
          <input
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 pr-10 text-sm text-ink"
            placeholder="Пароль"
            type={showCreatePassword ? "text" : "password"}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <button
            type="button"
            onClick={() => setShowCreatePassword((value) => !value)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-faint hover:bg-surface-2 hover:text-ink"
            aria-label={showCreatePassword ? "Скрыть пароль" : "Показать пароль"}
          >
            {showCreatePassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <input className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink" placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <select className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
        </select>
        <input className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink" placeholder="Должность: Head of Sales" value={form.role_title} onChange={(e) => setForm({ ...form, role_title: e.target.value })} />
        <button onClick={createUser} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white">Добавить</button>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
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
        <Link
          href="/team/archive"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink-dim transition hover:border-border-bright hover:text-ink"
        >
          <Archive size={14} />
          Архив сотрудников
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibleUsers.map((u) => {
          const draft = drafts[u.id];
          if (!draft) return null;
          const isFounder = u.role === "founder";
          return (
            <article key={u.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-base font-semibold text-accent-strong">
                    {(draft.name || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-display text-sm font-semibold text-ink">{draft.name || "Без имени"}</p>
                    <p className="text-xs text-ink-faint">{positionOf(u)}</p>
                  </div>
                </div>
                <Badge label={u.is_active ? "active" : "off"} tone={u.is_active ? "success" : "danger"} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2 block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-faint">Имя</span>
                  <input
                    className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-ink"
                    value={draft.name}
                    onChange={(e) => updateDraft(u.id, { name: e.target.value })}
                  />
                </label>
                <label className="col-span-2 block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-faint">Email</span>
                  <input
                    className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-ink"
                    value={draft.email}
                    onChange={(e) => updateDraft(u.id, { email: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-faint">Телефон</span>
                  <input
                    className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-ink"
                    placeholder="+998"
                    value={draft.phone}
                    onChange={(e) => updateDraft(u.id, { phone: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-faint">Telegram ID</span>
                  <input
                    className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-ink"
                    inputMode="numeric"
                    value={draft.telegram_id}
                    onChange={(e) => updateDraft(u.id, { telegram_id: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-faint">Роль</span>
                  <select
                    className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-ink"
                    value={draft.role}
                    onChange={(e) => updateDraft(u.id, { role: e.target.value })}
                  >
                    {["founder", ...ROLES].map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-faint">Должность</span>
                  <input
                    className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-ink"
                    placeholder="Head of Sales"
                    value={draft.role_title}
                    onChange={(e) => updateDraft(u.id, { role_title: e.target.value })}
                  />
                </label>
                <label className="col-span-2 block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-faint">Новый пароль</span>
                  <div className="relative">
                    <input
                      className="w-full rounded-md border border-border bg-bg px-2 py-1.5 pr-8 text-xs text-ink"
                      value={draft.password}
                      placeholder="не менять"
                      type={visiblePasswords[u.id] ? "text" : "password"}
                      onChange={(e) => updateDraft(u.id, { password: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setVisiblePasswords((current) => ({
                          ...current,
                          [u.id]: !current[u.id],
                        }))
                      }
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-ink-faint hover:bg-surface-2 hover:text-ink"
                      aria-label={visiblePasswords[u.id] ? "Скрыть пароль" : "Показать пароль"}
                    >
                      {visiblePasswords[u.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </label>
              </div>

              <div className="rounded-xl border border-border bg-bg p-3">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint">Доступ</p>
                {isFounder ? (
                  <p className="text-xs text-ink-dim">Founder видит всё по умолчанию</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <PermissionCheckbox
                      label="Видит все лиды"
                      checked={draft.can_view_all_leads}
                      onChange={(value) => updateDraft(u.id, { can_view_all_leads: value })}
                    />
                    <PermissionCheckbox
                      label="Аналитика"
                      checked={draft.can_view_analytics}
                      onChange={(value) => updateDraft(u.id, { can_view_analytics: value })}
                    />
                    <PermissionCheckbox
                      label="Финансы"
                      checked={draft.can_view_finance}
                      onChange={(value) => updateDraft(u.id, { can_view_finance: value })}
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={() => saveUser(u.id)} className="flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white">
                  Сохранить
                </button>
                <button onClick={() => patchUser(u.id, { is_active: !u.is_active })} className="flex-1 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink">
                  {u.is_active ? "Отключить" : "Включить"}
                </button>
              </div>
              {!isFounder && (
                <button
                  onClick={() => archiveUser(u.id)}
                  className="flex items-center justify-center gap-2 rounded-lg border border-danger/30 px-3 py-2 text-xs font-semibold text-danger hover:bg-danger-soft"
                >
                  <Archive size={14} />
                  Архивировать
                </button>
              )}
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}

function PermissionCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
      />
      {label}
    </label>
  );
}
