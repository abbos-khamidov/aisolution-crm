"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import AppShell from "@/components/AppShell";
import Badge from "@/components/Badge";
import { apiFetch, clearTokens } from "@/lib/api";

interface Task {
  id: number;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
}

const STATUS_TONE: Record<string, "neutral" | "accent" | "success" | "danger"> = {
  todo: "neutral",
  in_progress: "accent",
  done: "success",
  blocked: "danger",
};

export default function MyTasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    (async () => {
      const res = await apiFetch("/tasks");
      if (res.status === 401) {
        clearTokens();
        router.push("/login");
        return;
      }
      setTasks(await res.json());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell eyebrow="Твоя очередь" title="Мои таски">
      <p className="rise-in mb-6 flex items-center gap-2 text-sm text-ink-dim" style={{ animationDelay: "60ms" }}>
        <Send size={14} className="text-accent" />
        Отмечать выполненным — кнопкой «Готово» в Telegram-боте, не здесь.
      </p>

      <ul className="flex flex-col gap-2">
        {tasks.map((t, i) => (
          <li
            key={t.id}
            className="rise-in rounded-xl border border-border bg-surface p-4"
            style={{ animationDelay: `${100 + i * 50}ms` }}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium text-ink">{t.title}</span>
              <Badge label={t.status} tone={STATUS_TONE[t.status] ?? "neutral"} />
            </div>
            {t.description && <p className="text-sm text-ink-dim">{t.description}</p>}
            {t.due_date && <p className="mt-1 text-xs text-ink-faint">срок: {t.due_date}</p>}
          </li>
        ))}
        {tasks.length === 0 && (
          <p className="rise-in py-8 text-center text-ink-faint">
            Задач нет. Заслуженный перерыв.
          </p>
        )}
      </ul>
    </AppShell>
  );
}
