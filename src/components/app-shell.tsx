import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";
import {
  BookOpenCheck,
  FileText,
  LayoutDashboard,
  Menu,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCIES } from "@/lib/format";
import { useActiveBusiness, useCreateBusiness, useSession, type Business } from "@/lib/db";

type Workspace = {
  business: Business;
  businessId: string;
  businesses: Business[];
  select: (id: string) => void;
};

const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside AppShell");
  return value;
}

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/payments", label: "Payments", icon: Wallet },
  { to: "/receipts", label: "Receipts", icon: Receipt },
  { to: "/reports", label: "Reports", icon: BookOpenCheck },
  { to: "/audit", label: "Audit trail", icon: ShieldCheck },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const workspace = useActiveBusiness();
  const session = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (workspace.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading your workspace…
      </div>
    );
  }

  if (workspace.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-destructive">
          {workspace.error instanceof Error ? workspace.error.message : "Could not load workspace"}
        </p>
        <Button variant="outline" onClick={() => workspace.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!workspace.business) return <Onboarding onSignOut={signOut} />;

  const nav = (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            }`}
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const switcher =
    workspace.businesses.length > 1 ? (
      <Select value={workspace.businessId ?? undefined} onValueChange={workspace.select}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {workspace.businesses.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <p className="truncate text-sm font-medium">{workspace.business.name}</p>
    );

  const sidebarBody = (
    <div className="flex h-full flex-col gap-6 p-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.28em] text-primary">Document OS</p>
        <div className="mt-3">{switcher}</div>
      </div>
      {nav}
      <div className="mt-auto space-y-2 border-t border-sidebar-border pt-4">
        <p className="truncate text-xs text-muted-foreground">{session.email ?? "Signed in"}</p>
        <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <WorkspaceContext.Provider
      value={{
        business: workspace.business,
        businessId: workspace.business.id,
        businesses: workspace.businesses,
        select: workspace.select,
      }}
    >
      <div className="flex min-h-screen bg-background">
        <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block print:hidden">
          {sidebarBody}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden print:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Open navigation">
                  <Menu className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-sidebar p-0">
                {sidebarBody}
              </SheetContent>
            </Sheet>
            <p className="truncate text-sm font-medium">{workspace.business.name}</p>
          </header>

          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}

function Onboarding({ onSignOut }: { onSignOut: () => void }) {
  const create = useCreateBusiness();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("KES");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <p className="text-[11px] uppercase tracking-[0.28em] text-primary">First step</p>
        <h1 className="mt-3 text-3xl">Name your business</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every document, payment and receipt belongs to a business. You can add more later.
        </p>
        <form
          className="mt-8 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate(
              { name: name.trim(), base_currency: currency },
              {
                onError: (error) =>
                  toast.error(error instanceof Error ? error.message : "Could not create business"),
              },
            );
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="businessName">Business name</Label>
            <Input
              id="businessName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Base currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending || !name.trim()}>
            {create.isPending ? "Creating…" : "Create business"}
          </Button>
        </form>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-6 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
