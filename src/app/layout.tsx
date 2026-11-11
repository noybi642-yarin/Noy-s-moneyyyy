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
  // Personal finance app: keep every deployment out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#FAF6EF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The palette is designed for light mode; stop browsers (e.g. Samsung Internet) from force-darkening it.
  colorScheme: "only light",
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
