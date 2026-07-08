"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setTokens } from "@/lib/api";
import { decodeJwt } from "@/lib/jwt";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function redirectForRole(role: string): string {
  return role === "student" ? "/my-tasks" : "/leads";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

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

    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      setError("Неверный email или пароль");
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
        setError("Ссылка для входа устарела, попробуйте снова");
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
        setError("Telegram-аккаунт не зарегистрирован в CRM. Обратитесь к founder'у.");
        setDeepLink(null);
      }
    }, 2000);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">aisolutioncrm — вход</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border px-3 py-2"
          required
        />
        <input
          type="password"
          placeholder="пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border px-3 py-2"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Войти
        </button>
      </form>

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <div className="h-px flex-1 bg-gray-200" />
        или
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {!deepLink ? (
        <button
          onClick={startTelegramLogin}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          Войти через Telegram (для студентов)
        </button>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <a
            href={deepLink}
            target="_blank"
            rel="noreferrer"
            className="rounded bg-blue-600 px-3 py-2 text-center text-white"
          >
            Открыть Telegram и подтвердить
          </a>
          <p className="text-xs text-gray-500">Ждём подтверждения в боте…</p>
        </div>
      )}
    </main>
  );
}
