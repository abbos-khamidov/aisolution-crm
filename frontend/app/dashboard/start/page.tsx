"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleDot, FolderKanban, UserPlus } from "lucide-react";
import AppShell from "@/components/AppShell";

const STEPS = [
  {
    icon: CircleDot,
    title: "Открой очередь",
    text: "Начинай с фильтра «Без ответственного». Новый лид не должен висеть без owner.",
  },
  {
    icon: UserPlus,
    title: "Назначь владельца",
    text: "Founder назначает менеджера, либо менеджер берет свободный лид в работу.",
  },
  {
    icon: CheckCircle2,
    title: "Двигай статус",
    text: "new -> contacted -> qualified -> proposal_sent. Для lost нужна причина, для won нужна сумма.",
  },
  {
    icon: FolderKanban,
    title: "Выигранный лид становится проектом",
    text: "После won CRM создает проект и финансовую запись автоматически. Проверь проект в разделе «Проекты».",
  },
];

export default function DashboardStartPage() {
  return (
    <AppShell eyebrow="Инструкция" title="Как работать с лидами">
      <Link href="/dashboard" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-ink-dim hover:text-ink">
        <ArrowLeft size={16} />
        Назад в дашборд
      </Link>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          {STEPS.map(({ icon: Icon, title, text }, index) => (
            <article key={title} className="rounded-xl border border-border bg-bg p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
                  <Icon size={18} />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Шаг {index + 1}</p>
                  <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-ink-dim">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/leads" className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white">
          Открыть лиды
        </Link>
        <Link href="/projects" className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-ink">
          Проверить проекты
        </Link>
      </div>
    </AppShell>
  );
}
