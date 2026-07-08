"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import Badge from "@/components/Badge";
import { apiFetch, clearTokens } from "@/lib/api";

interface Profile {
  id: number;
  name: string;
  phone: string | null;
  email: string;
  telegram_username: string | null;
  photo_url: string | null;
  quote: string | null;
  role: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    telegram_username: "",
    photo_url: "",
    quote: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    const res = await apiFetch("/users/me");
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
    const data: Profile = await res.json();
    setProfile(data);
    setForm({
      name: data.name ?? "",
      phone: data.phone ?? "",
      telegram_username: data.telegram_username ?? "",
      photo_url: data.photo_url ?? "",
      quote: data.quote ?? "",
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setError(null);
    setSaved(false);
    const res = await apiFetch("/users/me", {
      method: "PATCH",
      body: JSON.stringify({
        name: form.name || null,
        phone: form.phone || null,
        telegram_username: form.telegram_username || null,
        photo_url: form.photo_url || null,
        quote: form.quote || null,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    setProfile(await res.json());
    setSaved(true);
  }

  return (
    <AppShell eyebrow="Настройки" title="Профиль">
      {error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {saved && (
        <p className="mb-4 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
          Сохранено
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <section className="h-fit rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-accent-soft text-3xl font-semibold text-accent-strong">
              {form.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.photo_url} alt={form.name} className="h-full w-full object-cover" />
              ) : (
                form.name.slice(0, 1).toUpperCase() || "A"
              )}
            </div>
            <h2 className="mt-4 font-display text-xl font-semibold text-ink">
              {form.name || "Профиль"}
            </h2>
            {profile && <Badge label={profile.role} tone="accent" />}
            {form.quote && (
              <p className="mt-4 rounded-xl bg-bg px-3 py-2 text-sm leading-relaxed text-ink-dim">
                {form.quote}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Имя">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-ink"
              />
            </Field>
            <Field label="Телефон">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-ink"
              />
            </Field>
            <Field label="Telegram username">
              <input
                value={form.telegram_username}
                onChange={(e) => setForm({ ...form, telegram_username: e.target.value })}
                placeholder="@username"
                className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-ink"
              />
            </Field>
            <Field label="Фото URL">
              <input
                value={form.photo_url}
                onChange={(e) => setForm({ ...form, photo_url: e.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-ink"
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Цитата">
                <textarea
                  value={form.quote}
                  onChange={(e) => setForm({ ...form, quote: e.target.value })}
                  className="min-h-24 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink"
                />
              </Field>
            </div>
          </div>
          <button
            onClick={save}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Сохранить
          </button>
        </section>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      {children}
    </label>
  );
}
