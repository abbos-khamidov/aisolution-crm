"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Radar, Sparkles } from "lucide-react";
import { setTokens } from "@/lib/api";
import { decodeJwt } from "@/lib/jwt";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const STAT_CHIPS = [
  { label: "01", value: "заявка попадает в радар" },
  { label: "02", value: "CRM назначает владельца" },
  { label: "03", value: "сумма летит в прогноз" },
];

const INTRO_STEPS = ["Сайт", "Лид", "КП", "Проект", "Финансы"];

// Deterministic swarm (no Math.random — must render identically on server
// and client, or hydration breaks event handlers on the whole overlay,
// including the skip button). Phyllotaxis spacing (golden angle) gives an
// organic, non-overlapping scatter for a few dozen points cheaply.
const INTRO_PARTICLE_COUNT = 34;
const GOLDEN_ANGLE = 137.508;
const INTRO_TONES = ["11,127,232", "5,150,105", "245,158,11"];
const INTRO_PARTICLES = Array.from({ length: INTRO_PARTICLE_COUNT }, (_, i) => {
  const angle = (i * GOLDEN_ANGLE * Math.PI) / 180;
  const radius = 14 + ((i * 7) % 28);
  return {
    id: i,
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius * 0.6,
    tone: INTRO_TONES[i % INTRO_TONES.length],
    delay: (i * 0.11) % 3.4,
    dur: 3.2 + (i % 5) * 0.24,
  };
});

function redirectForRole(role: string): string {
  return role === "student" ? "/my-tasks" : "/dashboard";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [deepLink, setDeepLink] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const introTimerRef = useRef<number | null>(null);

  function dismissIntro() {
    if (introTimerRef.current) {
      window.clearTimeout(introTimerRef.current);
      introTimerRef.current = null;
    }
    setShowIntro(false);
  }

  useEffect(() => {
    introTimerRef.current = window.setTimeout(() => {
      introTimerRef.current = null;
      setShowIntro(false);
    }, 10000);
    return () => {
      if (introTimerRef.current) window.clearTimeout(introTimerRef.current);
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
    <main className={`relative min-h-screen overflow-hidden ${showIntro ? "login-has-intro" : ""}`}>
      {showIntro && <LoginIntro onDone={dismissIntro} />}
      <div className="atmosphere" />
      <div className="grain" />
      <div className="login-route-bg" aria-hidden="true" />

      <div className="relative z-10 mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-[1fr_390px] lg:gap-20">
        <div className="rise-in max-w-xl" style={{ animationDelay: "0ms" }}>
          <div className="mb-6 flex items-center gap-4">
            <Image
              src="/logo-light.png"
              alt="AI Solution"
              width={72}
              height={72}
              className="h-16 w-16 rounded-2xl object-contain"
              priority
            />
            <Image
              src="/motto-light.png"
              alt="AI Solution — умные решения. реальный рост."
              width={260}
              height={174}
              className="h-auto w-[230px] object-contain"
              priority
            />
          </div>
          <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-accent/20 bg-white/70 px-3 py-1.5 text-xs font-semibold text-accent-strong shadow-sm backdrop-blur">
            <Sparkles size={14} />
            Закрытая диспетчерская AI Solution
          </div>
          <h1 className="font-display text-4xl font-bold leading-[1.05] text-ink sm:text-5xl">
            Лид прилетел.
            <br />
            <span className="text-accent-strong">Команда уже на полосе.</span>
          </h1>
          <p className="mt-5 max-w-sm text-balance text-base leading-relaxed text-ink-dim">
            AI Solution CRM показывает маршрут от заявки до проекта: кто отвечает,
            где КП, какая сумма в прогнозе и что должно случиться дальше.
          </p>
          <p className="mt-4 flex max-w-sm gap-2 text-sm leading-relaxed text-ink-faint">
            <LockKeyhole className="mt-0.5 shrink-0 text-accent-strong" size={16} />
            <span>
            Регистрации здесь нет: доступ выдаётся только по запросу founder, чтобы
            данные клиентов и команды оставались внутри AI Solution.
            </span>
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

        <div
          className="rise-in w-full max-w-sm shrink-0 self-center rounded-2xl border border-border bg-bg-elevated/88 p-8 shadow-glow backdrop-blur-xl"
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
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 pr-10 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-soft"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink"
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
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

function LoginIntro({ onDone }: { onDone: () => void }) {
  function handleSkip(e: React.MouseEvent<HTMLButtonElement> | React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    onDone();
  }

  return (
    <section className="login-intro">
      <div className="intro-map" aria-hidden="true">
        <span className="intro-line intro-line--one" />
        <span className="intro-line intro-line--two" />
        <span className="intro-line intro-line--three" />
        {INTRO_PARTICLES.map((p) => (
          <span
            key={p.id}
            className="intro-particle"
            style={
              {
                "--x": `${p.x}vw`,
                "--y": `${p.y}vh`,
                "--tone": p.tone,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.dur}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="intro-core">
        <Image src="/logo-light.png" alt="AI Solution" width={96} height={96} className="h-20 w-20 object-contain" priority />
        <p className="intro-kicker">
          <Radar size={16} />
          live route
        </p>
        <h2>
          Заявка заходит.
          <br />
          CRM собирает маршрут.
        </h2>
        <p className="intro-copy">
          Лид, владелец, КП, проект и деньги сходятся в один рабочий центр.
        </p>
      </div>
      <div className="intro-steps">
        {INTRO_STEPS.map((label, i) => (
          <Fragment key={label}>
            <span>{label}</span>
            {i < INTRO_STEPS.length - 1 && (
              <ArrowRight
                size={16}
                className="intro-steps-arrow"
                style={{ animationDelay: `${i * 0.18}s` }}
              />
            )}
          </Fragment>
        ))}
      </div>
      <button
        type="button"
        onPointerDown={handleSkip}
        onClick={handleSkip}
        className="intro-skip"
      >
        Пропустить
      </button>
      <div className="intro-progress" />
    </section>
  );
}
