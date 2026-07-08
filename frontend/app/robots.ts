import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/icon.png", "/logo.png", "/logo-wordmark.png"],
        disallow: [
          "/analytics",
          "/dashboard",
          "/files",
          "/finance",
          "/leads",
          "/my-tasks",
          "/profile",
          "/projects",
          "/tasks",
          "/team",
          "/auth",
          "/clients",
          "/internal",
          "/users",
          "/uploads",
        ],
      },
    ],
    sitemap: "https://crm.aisolution.uz/sitemap.xml",
    host: "https://crm.aisolution.uz",
  };
}
