"use server";

import { db } from "@/lib/db";
import { nextNumber } from "@/lib/sequence";
import { parseIndianDate } from "@/lib/core/import-core";

/**
 * A public admission application.
 *
 * This form is open to the internet, so it validates hard and stores only what
 * a school actually needs to process an admission. The honeypot catches the
 * commonest bot; a real parent never sees it.
 */
export async function submitApplication(_prev: unknown, formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const honeypot = String(formData.get("website") ?? "");

  // A bot fills every field it finds. A human never sees this one.
  if (honeypot.trim() !== "") return { error: "Something went wrong. Please try again." };

  const school = await db.school.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!school) return { error: "That school page no longer exists." };

  const studentName = String(formData.get("studentName") ?? "").trim();
  const parentName = String(formData.get("parentName") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "");
  const phone = phoneRaw.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  const classSought = String(formData.get("classSought") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const previousSchool = String(formData.get("previousSchool") ?? "").trim();
  const dobRaw = String(formData.get("dob") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();

  if (studentName.length < 2) return { error: "Enter the child's full name." };
  if (parentName.length < 2) return { error: "Enter the parent's or guardian's name." };
  if (phone.length !== 10) return { error: "Enter a 10-digit mobile number so the school can call you." };
  if (!classSought) return { error: "Choose the class you are applying for." };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "That email address does not look right." };
  }

  const dob = dobRaw ? parseIndianDate(dobRaw) : null;
  if (dobRaw && !dob) return { error: "Enter the date of birth as dd/mm/yyyy." };

  // One family should not be able to flood the school with applications.
  const recent = await db.application.count({
    where: {
      schoolId: school.id,
      phone,
      submittedAt: { gte: new Date(Date.now() - 24 * 3600_000) },
    },
  });
  if (recent >= 5) {
    return { error: "Several applications have already been submitted from this number today. Please call the school office." };
  }

  const duplicate = await db.application.findFirst({
    where: { schoolId: school.id, phone, studentName: { equals: studentName, mode: "insensitive" } },
    select: { applicationNo: true },
  });
  if (duplicate) {
    return {
      error: `An application for ${studentName} already exists (${duplicate.applicationNo}). Use "Check my application" to see where it has reached.`,
    };
  }

  const applicationNo = await db.$transaction((tx) =>
    nextNumber(tx, school.id, "APPLICATION", "APP/26-27/"),
  );

  const application = await db.application.create({
    data: {
      schoolId: school.id,
      applicationNo,
      studentName,
      dob,
      gender: (gender === "MALE" || gender === "FEMALE" || gender === "OTHER" ? gender : null) as never,
      classSought,
      parentName,
      phone,
      email: email || null,
      address: address || null,
      previousSchool: previousSchool || null,
      status: "SUBMITTED",
    },
  });

  // The office should see this on its admissions screen straight away.
  await db.enquiry.create({
    data: {
      schoolId: school.id,
      studentName,
      classSought,
      parentName,
      phone,
      email: email || null,
      source: "WEBSITE",
      status: "NEW",
      message: `Online application ${applicationNo}`,
    },
  });

  return {
    ok: true,
    applicationNo: application.applicationNo,
    trackingHint: phone.slice(-4),
  };
}
