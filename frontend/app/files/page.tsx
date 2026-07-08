"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Файлы на согласование</h1>
        <Link href="/projects" className="text-sm text-gray-500 underline">
          Проекты
        </Link>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <ul className="flex flex-col gap-2">
        {files.map((f) => (
          <li key={f.id} className="flex items-center justify-between rounded bg-white p-3 shadow">
            <a href={f.url} target="_blank" rel="noreferrer" className="underline">
              {f.filename}
            </a>
            {me?.role === "founder" && (
              <div className="flex gap-2">
                <button
                  onClick={() => review(f.id, "approve")}
                  className="rounded bg-green-700 px-2 py-1 text-xs text-white"
                >
                  Approve
                </button>
                <button
                  onClick={() => review(f.id, "reject")}
                  className="rounded bg-red-700 px-2 py-1 text-xs text-white"
                >
                  Reject
                </button>
              </div>
            )}
          </li>
        ))}
        {files.length === 0 && <p className="text-sm text-gray-500">Нет файлов на согласование.</p>}
      </ul>
    </main>
  );
}
