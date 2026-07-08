import type { Metadata } from "next";
import { Unbounded, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Unbounded({
  subsets: ["latin", "cyrillic"],
  variable: "--font-display",
  weight: ["500", "600", "700", "800"],
});
const body = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});
const mono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://crm.aisolution.uz"),
  title: {
    default: "AI Solution CRM | Внутренняя CRM aisolution.uz",
    template: "%s | AI Solution CRM",
  },
  description:
    "AI Solution CRM — закрытая рабочая система для лидов, проектов, команды и задач AI Solution. Доступ только по приглашению founder.",
  applicationName: "AI Solution CRM",
  keywords: [
    "AI Solution CRM",
    "aisolution crm",
    "crm.aisolution.uz",
    "CRM AI Solution",
    "AI Solution",
  ],
  alternates: {
    canonical: "/login",
  },
  openGraph: {
    title: "AI Solution CRM",
    description:
      "Закрытая CRM AI Solution для лидов, проектов, команды и задач. Вход только для приглашённых участников.",
    url: "https://crm.aisolution.uz/login",
    siteName: "AI Solution CRM",
    locale: "ru_RU",
    type: "website",
    images: [
      {
        url: "/crm-og.png",
        width: 1200,
        height: 630,
        alt: "AI Solution CRM",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Solution CRM",
    description:
      "Закрытая CRM AI Solution для лидов, проектов, команды и задач.",
    images: ["/crm-og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": 160,
      "max-image-preview": "large",
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${display.variable} ${body.variable} ${mono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
