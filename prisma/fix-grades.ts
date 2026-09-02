import { PrismaClient } from "@prisma/client";
import { CBSE_8_POINT, gradeFor, percentBp } from "../src/lib/core/grading-core";

const db = new PrismaClient();

/** One-off repair: grades written before the band-gap fix could be null. */
async function main() {
  const cards = await db.reportCard.findMany({ where: { grade: null, percentage: { not: null } } });
  for (const c of cards) {
    const g = gradeFor(c.percentage!, CBSE_8_POINT)?.grade ?? null;
    if (g) await db.reportCard.update({ where: { id: c.id }, data: { grade: g } });
  }
  console.log(`report cards repaired: ${cards.length}`);

  const results = await db.examResult.findMany({
    where: { grade: null, marks: { not: null }, isAbsent: false },
    include: { exam: { select: { maxMarks: true } } },
  });
  for (const r of results) {
    const g = gradeFor(percentBp(r.marks!, r.exam.maxMarks), CBSE_8_POINT)?.grade ?? null;
    if (g) await db.examResult.update({ where: { id: r.id }, data: { grade: g } });
  }
  console.log(`exam results repaired: ${results.length}`);
  await db.$disconnect();
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
