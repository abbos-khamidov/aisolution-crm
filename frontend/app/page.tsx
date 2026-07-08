"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";
import { decodeJwt } from "@/lib/jwt";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    const payload = decodeJwt(token);
    router.replace(payload?.role === "student" ? "/my-tasks" : "/leads");
  }, [router]);

  return null;
}
