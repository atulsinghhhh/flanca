import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Backfill the Half Yearly papers into an already-seeded demo school. */
async function main() {
  const school = await db.school.findUnique({ where: { slug: "nalanda-public-school" } });
  if (!school) throw new Error("seed first");

  const terms = await db.examTerm.findMany({
    where: { schoolId: school.id, name: "Half Yearly" },
    include: { class: { include: { subjects: true } }, exams: true },
  });

  let created = 0;
  for (const t of terms) {
    if (t.exams.length > 0 || !t.class) continue;
    const scholastic = t.class.subjects.filter((s) => !s.isCoScholastic);
    for (let i = 0; i < scholastic.length; i++) {
      await db.exam.create({
        data: {
          schoolId: school.id, examTermId: t.id, classId: t.classId, subjectId: scholastic[i].id,
          name: `${scholastic[i].name} — Half Yearly`,
          examDate: new Date(Date.UTC(2026, 8, 21 + i)), startTime: "09:00",
          durationMins: 150, maxMarks: 80, passMarks: 27,
        },
      });
      created++;
    }
  }
  console.log(`half-yearly papers created: ${created}`);
  await db.$disconnect();
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
