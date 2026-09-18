import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Financial Document OS" },
      {
        name: "description",
        content:
          "Sign in to issue invoices, quotations, credit notes, receipts and reconcile payments.",
      },
      { property: "og:title", content: "Sign in — Financial Document OS" },
      {
        property: "og:description",
        content: "Secure access to your invoicing and payment ledger.",
      },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function resendConfirmation() {
    if (!email) {
      toast.error("Enter your email address first");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) throw error;
      toast.success("New confirmation link sent. Check your inbox.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the email");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        setNeedsConfirmation(true);
        setMode("signin");
        toast.success("Account created. Confirm your email address, then sign in.");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (
          (error as { code?: string }).code === "email_not_confirmed" ||
          /not confirmed/i.test(error.message)
        ) {
          setNeedsConfirmation(true);
          toast.error("Your email address isn't confirmed yet.");
          return;
        }
        throw error;
      }
      setNeedsConfirmation(false);
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign you in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="text-[11px] uppercase tracking-[0.28em] text-primary">Financial Document OS</p>
        <h1 className="mt-3 text-3xl">
          {mode === "signin" ? "Sign in to your ledger" : "Create your workspace"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Invoices, quotations, credit notes, receipts and payment reconciliation in one place.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === "signup" ? (
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={8}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        {needsConfirmation ? (
          <div className="mt-4 rounded-md border border-border bg-card p-4 text-sm">
            <p className="text-foreground">Confirm your email address to continue</p>
            <p className="mt-1 text-muted-foreground">
              We sent a link to {email || "your inbox"}. Confirmation links expire, so request a
              fresh one if yours no longer works.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full"
              disabled={busy}
              onClick={resendConfirmation}
            >
              Resend confirmation email
            </Button>
          </div>
        ) : null}


        <button
          type="button"
          className="mt-6 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "No account yet? Create one" : "Already registered? Sign in"}
        </button>
      </div>
    </main>
  );
}
