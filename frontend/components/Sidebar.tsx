"use client";

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
  { href: "/leads", label: "Лиды", icon: Users, roles: ["founder", "manager"] },
  { href: "/projects", label: "Проекты", icon: FolderKanban, roles: STAFF_ROLES },
  { href: "/finance", label: "Финансы", icon: Wallet, roles: ["founder"] },
  { href: "/files", label: "Файлы", icon: FileStack, roles: STAFF_ROLES },
  { href: "/tasks", label: "Просрочки", icon: ListChecks, roles: ["founder"] },
  { href: "/analytics", label: "Аналитика", icon: BarChart3, roles: ["founder"] },
  { href: "/my-tasks", label: "Мои таски", icon: ClipboardCheck, roles: ["student"] },
];

export default function Sidebar({ role }: { role: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  const items = NAV_ITEMS.filter((item) => !item.roles || (role && item.roles.includes(role)));

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col border-r border-border bg-bg-elevated/90 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-5 py-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-display text-sm font-bold text-[#04121a]">
          ai
        </span>
        <span className="font-display text-sm font-semibold tracking-tight text-ink">
          aisolutioncrm
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
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

      <div className="border-t border-border px-3 py-4">
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
  );
}
