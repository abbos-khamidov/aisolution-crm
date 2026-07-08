"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { setTokens } from "@/lib/api";
import { decodeJwt } from "@/lib/jwt";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const STAT_CHIPS = [
  { label: "лидов в очереди", value: "не потеряно ни одного" },
  { label: "КП отправлено", value: "с трекингом до копейки" },
  { label: "дедлайнов", value: "видно за 7 дней" },
];

function redirectForRole(role: string): string {
  return role === "student" ? "/my-tasks" : "/dashboard";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [deepLink, setDeepLink] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      setLoading(false);
      setError("Хм, не сходится. Проверь email и пароль ещё раз.");
      return;
    }

    const data = await res.json();
    setTokens(data.access_token, data.refresh_token);
    const payload = decodeJwt(data.access_token);
    router.push(redirectForRole(payload?.role ?? ""));
  }

  async function startTelegramLogin() {
    setError(null);
    const res = await fetch(`${API_URL}/auth/telegram/start`, { method: "POST" });
    const data = await res.json();
    setDeepLink(data.deep_link);

    pollRef.current = setInterval(async () => {
      const pollRes = await fetch(`${API_URL}/auth/telegram/${data.token}/poll`);
      if (pollRes.status === 410) {
        clearInterval(pollRef.current!);
        setError("Ссылка протухла. Давай ещё раз?");
        setDeepLink(null);
        return;
      }
      const pollData = await pollRes.json();
      if (pollData.status === "confirmed") {
        clearInterval(pollRef.current!);
        setTokens(pollData.access_token, pollData.refresh_token);
        const payload = decodeJwt(pollData.access_token);
        router.push(redirectForRole(payload?.role ?? ""));
      } else if (pollData.status === "rejected") {
        clearInterval(pollRef.current!);
        setError("Такого Telegram-аккаунта в CRM нет. Спроси founder'а.");
        setDeepLink(null);
      }
    }, 2000);
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="atmosphere" />
      <div className="grain" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-10 px-6 py-16 lg:flex-row lg:items-stretch lg:gap-16">
        {/* Left: brand / pitch panel */}
        <div className="flex max-w-md flex-1 flex-col justify-center rise-in" style={{ animationDelay: "0ms" }}>
          <Image
            src="/logo-wordmark.png"
            alt="AI Solution"
            width={220}
            height={49}
            className="mb-6 h-auto w-[220px]"
            priority
          />
          <h1 className="font-display text-4xl font-bold leading-[1.05] text-ink sm:text-5xl">
            Лиды не ждут.
            <br />
            <span className="text-accent-strong">Ты тоже не жди.</span>
          </h1>
          <p className="mt-5 max-w-sm text-balance text-base leading-relaxed text-ink-dim">
            AI Solution CRM — закрытая рабочая система aisolution.uz. Один вход — и вся
            воронка, все проекты и все дедлайны на расстоянии клика.
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-faint">
            Регистрации здесь нет: доступ выдаётся только по запросу founder, чтобы
            данные клиентов и команды оставались внутри AI Solution.
          </p>

          <div className="mt-10 flex flex-col gap-3">
            {STAT_CHIPS.map((chip, i) => (
              <div
                key={chip.label}
                className="rise-in flex items-center justify-between rounded-xl border border-border bg-surface/50 px-4 py-3"
                style={{ animationDelay: `${120 + i * 90}ms` }}
              >
                <span className="text-sm text-ink-dim">{chip.label}</span>
                <span className="font-mono-num text-sm font-medium text-accent-strong">
                  {chip.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: auth card */}
        <div
          className="rise-in w-full max-w-sm shrink-0 self-center rounded-2xl border border-border bg-bg-elevated/80 p-8 shadow-glow backdrop-blur-xl"
          style={{ animationDelay: "80ms" }}
        >
          <h2 className="font-display text-xl font-semibold text-ink">С возвращением</h2>
          <p className="mt-1 text-sm text-ink-dim">Заходи — очередь лидов сама себя не разберёт.</p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink-faint">Email</label>
              <input
                type="email"
                placeholder="you@aisolution.uz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-soft"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink-faint">Пароль</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-soft"
                required
              />
            </div>

            {error && (
              <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? "Секунду…" : "Войти"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-wider text-ink-faint">
            <div className="h-px flex-1 bg-border" />
            или для студентов
            <div className="h-px flex-1 bg-border" />
          </div>

          {!deepLink ? (
            <button
              onClick={startTelegramLogin}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink transition hover:border-border-bright hover:bg-surface-2"
            >
              <span className="text-base">✈️</span>
              Войти через Telegram
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg bg-[#229ED9] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
              >
                Открыть Telegram
              </a>
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-faint">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                </span>
                Ждём, пока подтвердишь в боте…
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
