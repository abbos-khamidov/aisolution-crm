"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, clearTokens } from "@/lib/api";

interface Task {
  id: number;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
}

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
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Мои таски</h1>
        <button
          onClick={() => {
            clearTokens();
            router.push("/login");
          }}
          className="text-sm text-gray-500 underline"
        >
          Выйти
        </button>
      </div>

      <p className="mb-4 text-xs text-gray-500">
        Отмечать задачи выполненными — через кнопку «Готово» в Telegram-боте.
      </p>

      <ul className="flex flex-col gap-2">
        {tasks.map((t) => (
          <li key={t.id} className="rounded bg-white p-3 shadow">
            <div className="font-medium">{t.title}</div>
            {t.description && <div className="text-sm text-gray-600">{t.description}</div>}
            <div className="text-xs text-gray-500">
              статус: {t.status} {t.due_date && `· срок: ${t.due_date}`}
            </div>
          </li>
        ))}
        {tasks.length === 0 && <p className="text-sm text-gray-500">Задач нет.</p>}
      </ul>
    </main>
  );
}
