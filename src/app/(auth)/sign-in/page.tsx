"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FieldRow, Input } from "@/components/ui/field";
import { signIn } from "@/lib/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setPending(true);
    const { error } = await signIn.email({
      email: String(data.get("email")),
      password: String(data.get("password")),
    });
    setPending(false);
    if (error) {
      toast.error(error.message ?? "Could not sign in");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <Card className="p-6">
      <h1 className="text-xl font-extrabold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-muted-fg">Pick up where your training left off.</p>

      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
        <FieldRow label="Email">
          <Input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        </FieldRow>
        <FieldRow label="Password">
          <Input name="password" type="password" required autoComplete="current-password" />
        </FieldRow>
        <Button type="submit" variant="primary" disabled={pending} className="mt-1 w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-5 text-center text-xs text-subtle">
        No account?{" "}
        <Link href="/sign-up" className="text-primary hover:underline">
          Create one
        </Link>
      </p>
    </Card>
  );
}
