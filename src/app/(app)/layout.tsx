import { AppRoot } from "@/components/app/app-root";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppRoot>{children}</AppRoot>;
}
