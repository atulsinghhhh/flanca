"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export function PrintButton({ label = "Print receipt" }: { label?: string }) {
  return (
    <Button onClick={() => window.print()} size="sm">
      <Printer className="size-4" /> {label}
    </Button>
  );
}
