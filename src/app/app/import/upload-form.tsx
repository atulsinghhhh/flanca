"use client";

import { useActionState } from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/primitives";

type UploadAction = (
  prev: { error?: string } | null | undefined,
  formData: FormData,
) => Promise<{ error?: string } | null | undefined>;

export function UploadForm({ action: uploadAction, label = "Choose your Excel or CSV file" }: { action: UploadAction; label?: string }) {
  const [state, action, pending] = useActionState(uploadAction, null);

  return (
    <form action={action} className="space-y-3">
      <label
        htmlFor="file"
        className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line-2 bg-paper-2/50 px-6 py-9 text-center transition-colors hover:border-brand hover:bg-brand-light/40"
      >
        <FileSpreadsheet className="size-7 text-ink-3" />
        <span className="text-[14.5px] font-semibold">{label}</span>
        <span className="text-[12.5px] text-ink-3">
          .xlsx, .xls or .csv · up to 5,000 rows · your existing register is fine as-is
        </span>
        <input
          id="file"
          name="file"
          type="file"
          accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="mt-1 block w-full max-w-xs cursor-pointer rounded-md border border-line-2 bg-white p-1.5 text-[13px] file:mr-2 file:rounded file:border-0 file:bg-brand file:px-2.5 file:py-1 file:text-[12.5px] file:font-semibold file:text-white"
        />
      </label>

      {state?.error ? (
        <p className="rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13px] text-overdue">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {pending ? "Reading your file…" : "Check my file"}
      </Button>

      <p className="text-center text-[12.5px] text-ink-3">
        Nothing is saved yet. You will see every row and can approve or cancel.
      </p>
    </form>
  );
}
