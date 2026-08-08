"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteResultAction } from "@/lib/actions/training";

export function DeleteResultButton({ resultId }: { resultId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function remove() {
    setPending(true);
    try {
      await deleteResultAction(resultId);
      toast.success("Result deleted");
      router.push("/history");
    } catch {
      setPending(false);
      toast.error("Could not delete the result");
    }
  }

  if (!confirming) {
    return (
      <Button size="sm" onClick={() => setConfirming(true)}>
        <Trash2 size={14} /> Delete
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <span className="text-xs text-subtle">Delete this result?</span>
      <Button size="sm" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </Button>
      <Button size="sm" variant="danger" onClick={remove} disabled={pending}>
        {pending ? "Deleting…" : "Delete"}
      </Button>
    </span>
  );
}
