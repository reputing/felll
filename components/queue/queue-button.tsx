"use client";
import { Check, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addToQueue, removeFromQueue, useQueue, type QueueItem } from "@/lib/queue";

// Add / remove a show from your personal "watch next" queue.
export function QueueButton({ item }: { item: QueueItem }) {
  const q = useQueue();
  const on = q.some((x) => x.id === item.id);
  return (
    <Button size="lg" variant={on ? "soft" : "outline"} onClick={() => (on ? removeFromQueue(item.id) : addToQueue(item))} aria-pressed={on}>
      {on ? <Check className="size-4" /> : <ListPlus className="size-4" />}{on ? "Queued" : "Queue"}
    </Button>
  );
}
