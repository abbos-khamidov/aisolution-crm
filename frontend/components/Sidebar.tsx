"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Wallet,
  FileStack,
  ListChecks,
  BarChart3,
  ClipboardCheck,
  LogOut,
  MessageCircle,
  UserCog,
  UserCircle,
  Network,
  type LucideIcon,
} from "lucide-react";
import { clearTokens } from "@/lib/api";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: string[];
}

const STAFF_ROLES = ["founder", "manager", "developer"];

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Дашборд", icon: LayoutDashboard, roles: STAFF_ROLES },
  { href: "/obsidian", label: "Obsidian?", icon: Network, roles: STAFF_ROLES },
  { href: "/leads", label: "Лиды", icon: Users, roles: ["founder", "manager"] },
  { href: "/projects", label: "Проекты", icon: FolderKanban, roles: STAFF_ROLES },
  { href: "/finance", label: "Финансы", icon: Wallet, roles: ["founder"] },
  { href: "/files", label: "Файлы", icon: FileStack, roles: STAFF_ROLES },
  { href: "/team", label: "Команда", icon: UserCog, roles: ["founder"] },
  { href: "/profile", label: "Профиль", icon: UserCircle, roles: STAFF_ROLES },
  { href: "/tasks", label: "Просрочки", icon: ListChecks, roles: ["founder"] },
  { href: "/analytics", label: "Аналитика", icon: BarChart3, roles: ["founder"] },
  { href: "/my-tasks", label: "Мои таски", icon: ClipboardCheck, roles: ["student"] },
];

export default function Sidebar({ role }: { role: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const chatUrl = process.env.NEXT_PUBLIC_TEAM_CHAT_URL;

  const items = NAV_ITEMS.filter((item) => !item.roles || (role && item.roles.includes(role)));
  const mobileItems = items
    .filter((item) =>
      ["/dashboard", "/leads", "/projects", "/obsidian", "/profile", "/my-tasks"].includes(item.href)
    )
    .slice(0, 5);

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-border bg-bg-elevated/90 backdrop-blur-xl lg:flex">
        <div className="px-3 py-4">
        <div className="nav-brand-signal flex items-center gap-2 rounded-2xl px-3 py-3">
          <Image src="/logo.png" alt="AI Solution" width={32} height={32} className="rounded-lg bg-white/80" />
          <div className="leading-tight">
            <Link
              href="/dashboard"
              className="font-display text-sm font-semibold tracking-tight text-ink hover:text-accent-strong"
            >
              aisolution
            </Link>
            <Link
              href="/dashboard"
              className="text-xs font-semibold uppercase tracking-wide text-accent-strong hover:text-accent"
            >
              CRM
            </Link>
          </div>
        </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {role && STAFF_ROLES.includes(role) && (
            <Link
              href="/obsidian"
              className="obsidian-launch group mb-3 block overflow-hidden rounded-2xl border border-[#7c3aed]/30 bg-[#1c1430] p-3 text-white shadow-glow"
            >
              <div className="flex items-center gap-3">
                <Image src="/obsidian-app.svg" alt="Obsidian" width={42} height={42} className="rounded-xl shadow-sm" />
                <div>
                  <p className="font-display text-sm font-semibold">Obsidian?</p>
                  <p className="text-[11px] text-white/68">виртуальный мозг CRM</p>
                </div>
              </div>
              <div className="obsidian-arrows" aria-hidden="true">
                <span>↘</span><span>↙</span><span>↗</span><span>↖</span>
              </div>
            </Link>
          )}
          {items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent-soft text-accent-strong"
                    : "text-ink-dim hover:bg-surface hover:text-ink"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
                )}
                <Icon size={17} className={active ? "text-accent-strong" : "text-ink-faint group-hover:text-ink-dim"} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-border px-3 py-4">
          <a
            href={chatUrl || "#"}
            target={chatUrl ? "_blank" : undefined}
            aria-disabled={!chatUrl}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
              chatUrl
                ? "bg-accent text-white hover:bg-accent-strong"
                : "cursor-not-allowed bg-surface-2 text-ink-faint"
            }`}
          >
            <MessageCircle size={17} />
            Перейти в чат
          </a>
          <button
            onClick={() => {
              clearTokens();
              router.push("/login");
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-dim transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <LogOut size={17} />
            Выйти
          </button>
        </div>
      </aside>

      <nav className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-border bg-white/92 px-2 py-2 shadow-glow backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5 gap-1">
          {mobileItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold transition ${
                  active ? "bg-accent-soft text-accent-strong" : "text-ink-faint"
                } ${item.href === "/obsidian" ? "obsidian-mobile-tab" : ""}`}
              >
                <Icon size={18} />
                <span className="w-full truncate text-center">{item.label.replace("?", "")}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
