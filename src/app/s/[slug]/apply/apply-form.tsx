"use client";

import { useActionState } from "react";
import Link from "next/link";
import { submitApplication } from "../actions";

export function ApplyForm({
  slug,
  classes,
  schoolSlug,
}: {
  slug: string;
  classes: string[];
  schoolSlug: string;
}) {
  const [state, action, pending] = useActionState(submitApplication, null);

  if (state?.ok) {
    return (
      <div className="paper-card p-8 sm:p-10">
        <p className="plaque text-[var(--ink-3)]">Application received</p>
        <h2 className="display mt-3 text-[28px] leading-tight">
          Your application number is {state.applicationNo}.
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-[var(--ink-2)]">
          Write it down. The school office can see it already. To check where it has reached, use
          this number and the mobile ending {state.trackingHint} — you do not need to telephone.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href={`/s/${schoolSlug}/track?no=${state.applicationNo}`}
            className="flex h-12 items-center justify-center rounded-[4px] bg-[var(--marigold)] px-6 text-[15px] font-semibold text-[#231402] hover:brightness-95"
          >
            Check my application
          </Link>
          <Link
            href={`/s/${schoolSlug}`}
            className="flex h-12 items-center justify-center rounded-[4px] border border-[var(--rule)] bg-white px-6 text-[15px] font-semibold hover:bg-[var(--paper-2)]"
          >
            Back to the school page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="paper-card p-7 sm:p-9">
      <input type="hidden" name="slug" value={slug} />

      {/* A bot fills every field it finds. A parent never sees this one. */}
      <div aria-hidden className="hidden">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset>
        <legend className="plaque text-[var(--ink-3)]">About the child</legend>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Child's full name" name="studentName" required autoFocus />
          <Field label="Date of birth" name="dob" placeholder="dd/mm/yyyy" hint="As on the birth certificate" />
          <div>
            <label htmlFor="classSought" className="mb-1.5 block text-[13.5px] font-semibold">
              Class applying for <span className="text-[var(--marigold)]">*</span>
            </label>
            <select
              id="classSought"
              name="classSought"
              required
              defaultValue=""
              className="h-11 w-full rounded-[4px] border border-[var(--rule)] bg-white px-3 text-[15px] outline-none focus:border-[var(--board)]"
            >
              <option value="" disabled>
                Choose a class
              </option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="gender" className="mb-1.5 block text-[13.5px] font-semibold">
              Gender
            </label>
            <select
              id="gender"
              name="gender"
              defaultValue=""
              className="h-11 w-full rounded-[4px] border border-[var(--rule)] bg-white px-3 text-[15px] outline-none focus:border-[var(--board)]"
            >
              <option value="">Prefer not to say</option>
              <option value="MALE">Boy</option>
              <option value="FEMALE">Girl</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Field label="Present school, if any" name="previousSchool" />
          </div>
        </div>
      </fieldset>

      <fieldset className="mt-8 border-t border-[var(--rule)] pt-7">
        <legend className="plaque text-[var(--ink-3)]">How the school reaches you</legend>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Parent or guardian's name" name="parentName" required />
          <Field
            label="Mobile number"
            name="phone"
            required
            inputMode="numeric"
            hint="The office will call this number"
          />
          <Field label="Email" name="email" type="email" hint="Optional" />
          <Field label="Where you live" name="address" hint="Locality is enough" />
        </div>
      </fieldset>

      {state?.error ? (
        <p className="mt-6 rounded-[4px] border border-[#b3261e]/30 bg-[#fdeceb] px-4 py-3 text-[14px] text-[#8a1c15]">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-8 flex h-13 w-full items-center justify-center rounded-[4px] bg-[var(--board)] py-3.5 text-[16px] font-semibold text-[#f6f3e9] transition-[filter] hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Sending your application…" : "Send my application"}
      </button>

      <p className="mt-4 text-[12.5px] leading-relaxed text-[var(--ink-3)]">
        The school uses these details only to process this admission and to contact you about it.
        Nothing is shared with anyone else. You can ask the office to delete this application at any
        time.
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  required,
  type = "text",
  placeholder,
  hint,
  inputMode,
  autoFocus,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  hint?: string;
  inputMode?: "numeric" | "text";
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-[13.5px] font-semibold">
        {label}
        {required ? <span className="text-[var(--marigold)]"> *</span> : null}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        inputMode={inputMode}
        autoFocus={autoFocus}
        className="h-11 w-full rounded-[4px] border border-[var(--rule)] bg-white px-3 text-[15px] outline-none focus:border-[var(--board)]"
      />
      {hint ? <p className="mt-1 text-[12px] text-[var(--ink-3)]">{hint}</p> : null}
    </div>
  );
}
