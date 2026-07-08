"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Check, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import { apiFetch, clearTokens, getToken } from "@/lib/api";
import { decodeJwt } from "@/lib/jwt";

interface FileEntry {
  id: number;
  project_id: number | null;
  lead_id: number | null;
  url: string;
  filename: string;
  status: string;
  comment: string | null;
}

export default function FilesPage() {
  const router = useRouter();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const me = useMemo(() => {
    const token = getToken();
    return token ? decodeJwt(token) : null;
  }, []);

  async function load() {
    const res = await apiFetch("/files?status=pending_review");
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
    setFiles(await res.json());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function review(fileId: number, action: "approve" | "reject") {
    setError(null);
    const comment = window.prompt("Комментарий (необязательно)") ?? undefined;
    const res = await apiFetch(`/files/${fileId}/${action}`, {
      method: "POST",
      body: JSON.stringify({ comment }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? `Ошибка ${res.status}`);
      return;
    }
    await load();
  }

  return (
    <AppShell eyebrow="На подпись founder'у" title="Файлы на согласование">
      {error && (
        <p className="rise-in mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {files.map((f, i) => (
          <li
            key={f.id}
            className="rise-in flex items-center justify-between rounded-xl border border-border bg-surface p-4"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <a
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm font-medium text-ink transition hover:text-accent-strong"
            >
              <FileText size={16} className="text-ink-faint" />
              {f.filename}
            </a>
            {me?.role === "founder" && (
              <div className="flex gap-2">
                <button
                  onClick={() => review(f.id, "approve")}
                  className="flex items-center gap-1 rounded-full bg-success/90 px-3 py-1 text-xs font-semibold text-[#04160f] transition hover:bg-success"
                >
                  <Check size={13} /> Принять
                </button>
                <button
                  onClick={() => review(f.id, "reject")}
                  className="flex items-center gap-1 rounded-full bg-danger/90 px-3 py-1 text-xs font-semibold text-[#210608] transition hover:bg-danger"
                >
                  <X size={13} /> Отклонить
                </button>
              </div>
            )}
          </li>
        ))}
        {files.length === 0 && (
          <p className="rise-in py-8 text-center text-ink-faint">
            Очередь пуста. Всё согласовано — можно выдохнуть.
          </p>
        )}
      </ul>
    </AppShell>
  );
}
