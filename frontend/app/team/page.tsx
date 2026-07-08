"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
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
}

interface UserDraft {
  name: string;
  email: string;
  phone: string;
  telegram_id: string;
  role: string;
  role_title: string;
  password: string;
}

const ROLES = ["manager", "developer", "student"] as const;
const ROLE_LABELS: Record<string, string> = {
  founder: "Founder",
  manager: "Менеджер",
  developer: "Разработчик",
  student: "Ученик",
};

export default function TeamPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [drafts, setDrafts] = useState<Record<number, UserDraft>>({});
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
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
          },
        ])
      )
    );
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    await load();
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
      ...(draft.password ? { password: draft.password } : {}),
    });
  }

  return (
    <AppShell eyebrow="Доступы и роли" title="Команда">
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

      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="min-w-[1180px] w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase text-ink-faint">
            <tr>
              <th className="px-4 py-3">Имя</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Телефон</th>
              <th className="px-4 py-3">Telegram ID</th>
              <th className="px-4 py-3">Доступ</th>
              <th className="px-4 py-3">Должность</th>
              <th className="px-4 py-3">Новый пароль</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const draft = drafts[u.id];
              return (
              <tr key={u.id} className="border-t border-border align-top">
                <td className="px-4 py-3">
                  <input
                    className="w-40 rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-medium text-ink"
                    value={draft?.name ?? ""}
                    onChange={(e) => updateDraft(u.id, { name: e.target.value })}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    className="w-48 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink"
                    value={draft?.email ?? ""}
                    onChange={(e) => updateDraft(u.id, { email: e.target.value })}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    className="w-36 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink"
                    value={draft?.phone ?? ""}
                    placeholder="+998"
                    onChange={(e) => updateDraft(u.id, { phone: e.target.value })}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    className="w-32 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink"
                    value={draft?.telegram_id ?? ""}
                    inputMode="numeric"
                    onChange={(e) => updateDraft(u.id, { telegram_id: e.target.value })}
                  />
                </td>
                <td className="px-4 py-3">
                  <select
                    className="w-32 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink"
                    value={draft?.role ?? u.role}
                    onChange={(e) => updateDraft(u.id, { role: e.target.value })}
                  >
                    {["founder", ...ROLES].map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <input
                    className="w-44 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink"
                    value={draft?.role_title ?? ""}
                    placeholder="Например: Head of Sales"
                    onChange={(e) => updateDraft(u.id, { role_title: e.target.value })}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="relative w-36">
                    <input
                      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 pr-8 text-xs text-ink"
                      value={draft?.password ?? ""}
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
                </td>
                <td className="px-4 py-3"><Badge label={u.is_active ? "active" : "off"} tone={u.is_active ? "success" : "danger"} /></td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-2">
                    <button onClick={() => saveUser(u.id)} className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white">
                      Сохранить
                    </button>
                    <button onClick={() => patchUser(u.id, { is_active: !u.is_active })} className="rounded-md bg-surface-2 px-3 py-1.5 text-xs text-ink">
                    {u.is_active ? "Отключить" : "Включить"}
                    </button>
                  </div>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
