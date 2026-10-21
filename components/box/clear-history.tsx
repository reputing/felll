"use client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { toast } from "@/lib/store";

export function ClearHistory() {
  const router = useRouter();
  return (
    <Confirm title="Clear your watch history?" body="Resume points go too. Your lists and ratings stay." action="Clear it"
      onConfirm={async () => { await fetch("/api/progress", { method: "DELETE" }); toast("History cleared"); router.refresh(); }}>
      <Button variant="outline"><Trash2 className="size-4" />Clear</Button>
    </Confirm>
  );
}
