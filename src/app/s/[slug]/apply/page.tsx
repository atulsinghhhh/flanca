import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicSchool } from "@/lib/queries/public-school";
import { ApplyForm } from "./apply-form";
import "../../public.css";

export const metadata = { title: "Apply for admission" };

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicSchool(slug);
  if (!data) notFound();

  return (
    <div className="school-page min-h-dvh">
      <header className="board px-6 py-7">
        <div className="mx-auto max-w-3xl">
          <Link
            href={`/s/${slug}`}
            className="plaque text-[#c9a227] hover:text-[#e0b83c]"
          >
            ← {data.school.name}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <p className="plaque text-[var(--ink-3)]">Admissions {data.year?.name ?? ""}</p>
        <h1 className="display mt-3 text-[32px] leading-tight sm:text-[40px]">
          Apply for admission
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--ink-2)]">
          It takes about two minutes. You get an application number straight away and can check its
          progress yourself. Fields marked <span className="text-[var(--marigold)]">*</span> are
          needed; the rest help the office place your child correctly.
        </p>

        <div className="mt-9">
          <ApplyForm
            slug={slug}
            schoolSlug={slug}
            classes={data.classes.map((c) => c.name)}
          />
        </div>
      </main>
    </div>
  );
}
