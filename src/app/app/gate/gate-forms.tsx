"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, Loader2, LogOut, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { issueGatePass, logVisitor, signVisitorOut } from "./actions";

export function VisitorForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [whomToMeet, setWhomToMeet] = useState("");
  const [idProof, setIdProof] = useState("Aadhaar");

  function submit() {
    setError(null);
    setDone(null);
    start(async () => {
      const r = await logVisitor({ name, phone, purpose, whomToMeet, idProof });
      if (r.error) {
        setError(r.error);
        return;
      }
      setDone(`Pass ${r.passNo} issued`);
      setName("");
      setPhone("");
      setPurpose("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Visitor's name"
          className="h-9.5 rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
          placeholder="Mobile"
          className="h-9.5 rounded-md border border-line-2 bg-white px-2.5 font-mono text-[13px] outline-none focus:border-brand"
        />
        <input
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="Purpose"
          className="h-9.5 rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
        />
        <input
          value={whomToMeet}
          onChange={(e) => setWhomToMeet(e.target.value)}
          placeholder="Whom to meet"
          className="h-9.5 rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
        />
        <select
          value={idProof}
          onChange={(e) => setIdProof(e.target.value)}
          className="h-9.5 rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
        >
          {["Aadhaar", "Driving Licence", "Voter ID", "Employee ID", "None shown"].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <Button onClick={submit} disabled={pending || !name.trim()}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          Sign in
        </Button>
      </div>
      {error ? <p className="text-[12.5px] text-overdue">{error}</p> : null}
      {done ? <p className="text-[12.5px] text-good">{done}</p> : null}
    </div>
  );
}

export function SignOutButton({ visitorId }: { visitorId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await signVisitorOut(visitorId);
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
      Sign out
    </button>
  );
}

export function GatePassForm({ students }: { students: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [studentId, setStudentId] = useState("");
  const [reason, setReason] = useState("");
  const [releasedTo, setReleasedTo] = useState("");
  const [relation, setRelation] = useState("Father");

  function submit() {
    setError(null);
    setDone(null);
    start(async () => {
      const r = await issueGatePass({ studentId, reason, releasedTo, relation });
      if (r.error) {
        setError(r.error);
        return;
      }
      setDone(`Gate pass ${r.passNo} issued`);
      setReason("");
      setReleasedTo("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 px-5 py-4">
      <select
        value={studentId}
        onChange={(e) => setStudentId(e.target.value)}
        className="h-9.5 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
      >
        <option value="">Choose the student…</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={releasedTo}
          onChange={(e) => setReleasedTo(e.target.value)}
          placeholder="Released to (name)"
          className="h-9.5 rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
        />
        <select
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
          className="h-9.5 rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
        >
          {["Father", "Mother", "Guardian", "Authorised relative", "School staff"].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>

      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for early release"
        className="h-9.5 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
      />

      {error ? <p className="text-[12.5px] text-overdue">{error}</p> : null}
      {done ? <p className="text-[12.5px] text-good">{done}</p> : null}

      <Button onClick={submit} disabled={pending || !studentId} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <DoorOpen className="size-4" />}
        Issue gate pass
      </Button>
      <p className="text-[11.5px] leading-snug text-ink-3">
        This is a safety record: who took the child, on whose approval, with a serial. It is the page a
        school gets asked for when something goes wrong.
      </p>
    </div>
  );
}
