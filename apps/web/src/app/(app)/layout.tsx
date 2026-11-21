import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { TopbarActionsProvider } from "@/components/layout/TopbarActionsProvider";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const user = {
    name: session.user.name ?? "",
    email: session.user.email ?? "",
  };

  return (
    <div className="min-h-screen bg-bg">
      <Sidebar user={user} />
      <TopbarActionsProvider>
        <div className="flex flex-col min-h-screen" style={{ marginLeft: "var(--sidebar-w)" }}>
          <Topbar />
          <main className="flex-1 overflow-hidden flex flex-col">
            {children}
          </main>
        </div>
      </TopbarActionsProvider>
    </div>
  );
}
