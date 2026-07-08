"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  is_active: boolean;
}

const ROLES = ["manager", "developer", "student"] as const;

export default function TeamPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    telegram_id: "",
    role: "manager",
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
    setUsers(await res.json());
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
    };
    const res = await apiFetch("/users", { method: "POST", body: JSON.stringify(payload) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    setForm({ name: "", email: "", password: "", phone: "", telegram_id: "", role: "manager" });
    await load();
  }

  async function patchUser(userId: number, body: Record<string, string | boolean>) {
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

  return (
    <AppShell eyebrow="Доступы и роли" title="Команда">
      {error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mb-6 grid gap-3 rounded-2xl border border-border bg-surface p-4 md:grid-cols-6">
        <input className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink" placeholder="Имя" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink" placeholder="Пароль" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink" placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <select className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
        <button onClick={createUser} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white">Добавить</button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase text-ink-faint">
            <tr>
              <th className="px-4 py-3">Имя</th>
              <th className="px-4 py-3">Контакты</th>
              <th className="px-4 py-3">Роль</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium text-ink">{u.name}</td>
                <td className="px-4 py-3 text-ink-dim">{u.email}{u.phone ? ` · ${u.phone}` : ""}</td>
                <td className="px-4 py-3">
                  <select className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink" value={u.role} onChange={(e) => patchUser(u.id, { role: e.target.value })}>
                    {["founder", ...ROLES].map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3"><Badge label={u.is_active ? "active" : "off"} tone={u.is_active ? "success" : "danger"} /></td>
                <td className="px-4 py-3">
                  <button onClick={() => patchUser(u.id, { is_active: !u.is_active })} className="rounded-md bg-surface-2 px-2 py-1 text-xs text-ink">
                    {u.is_active ? "Отключить" : "Включить"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
