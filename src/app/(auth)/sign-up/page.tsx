"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FieldRow, Input } from "@/components/ui/field";
import { signUp } from "@/lib/auth-client";

export default function SignUpPage() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setPending(true);
    const { error } = await signUp.email({
      name: String(data.get("name")),
      email: String(data.get("email")),
      password: String(data.get("password")),
    });
    setPending(false);
    if (error) {
      toast.error(error.message ?? "Could not create account");
      return;
    }
    router.push("/onboarding");
    router.refresh();
  }

  return (
    <Card className="p-6">
      <h1 className="text-xl font-extrabold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-muted-fg">One account, one athlete profile.</p>

      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
        <FieldRow label="Name">
          <Input name="name" required autoComplete="name" placeholder="Alex Rivera" />
        </FieldRow>
        <FieldRow label="Email">
          <Input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        </FieldRow>
        <FieldRow label="Password" hint="At least 8 characters">
          <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
        </FieldRow>
        <Button type="submit" variant="primary" disabled={pending} className="mt-1 w-full">
          {pending ? "Creating…" : "Create account"}
        </Button>
      </form>

      <p className="mt-5 text-center text-xs text-subtle">
        Already have one?{" "}
        <Link href="/sign-in" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
