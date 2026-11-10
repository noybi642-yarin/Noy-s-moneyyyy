import type { Metadata, Viewport } from "next";
import "@fontsource-variable/heebo";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/opsz-italic.css";
import "./globals.css";
import { Toaster } from "sonner";
import { ServiceWorkerRegistrar } from "@/components/app/sw-registrar";

export const metadata: Metadata = {
  title: "Noy's moneyyyyyy",
  description: "My money. My rules.",
  applicationName: "Noy's moneyyyyyy",
  appleWebApp: { capable: true, title: "Noy's money", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#FAF6EF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster
          dir="rtl"
          position="top-center"
          toastOptions={{
            className: "!rounded-2xl !border-line !bg-card !text-ink !font-sans !shadow-[var(--shadow-lift)]",
          }}
        />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
