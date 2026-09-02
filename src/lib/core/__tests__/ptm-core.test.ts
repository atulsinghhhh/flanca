import { describe, expect, it } from "vitest";
import {
  buildSlots,
  canBookSlot,
  canCancelBooking,
  canOfferSlots,
  canRemoveSlot,
  clockToMinutes,
  minutesToClock,
} from "../ptm-core";

describe("minutesToClock / clockToMinutes", () => {
  it("round-trips an ordinary time", () => {
    expect(minutesToClock(555)).toBe("09:15");
    expect(clockToMinutes("09:15")).toBe(555);
  });

  it("refuses nonsense", () => {
    expect(clockToMinutes("25:00")).toBeNull();
    expect(clockToMinutes("nope")).toBeNull();
  });
});

describe("buildSlots", () => {
  it("cuts an even range cleanly", () => {
    const { slots, error } = buildSlots({ startMinute: 540, endMinute: 600, durationMinutes: 15 });
    expect(error).toBeNull();
    expect(slots).toEqual([
      { startMinute: 540, endMinute: 555 },
      { startMinute: 555, endMinute: 570 },
      { startMinute: 570, endMinute: 585 },
      { startMinute: 585, endMinute: 600 },
    ]);
  });

  it("drops a remainder rather than shortchanging the last slot", () => {
    const { slots, error } = buildSlots({ startMinute: 540, endMinute: 595, durationMinutes: 15 });
    expect(error).toBeNull();
    expect(slots).toHaveLength(3); // 540-555, 555-570, 570-585 — 585-595 dropped
  });

  it("refuses an end before the start", () => {
    expect(buildSlots({ startMinute: 600, endMinute: 540, durationMinutes: 15 }).error).toMatch(/end time/);
  });

  it("refuses a duration under 5 minutes", () => {
    expect(buildSlots({ startMinute: 540, endMinute: 600, durationMinutes: 2 }).error).toMatch(/at least 5/);
  });

  it("refuses a range too short for even one slot", () => {
    expect(buildSlots({ startMinute: 540, endMinute: 545, durationMinutes: 15 }).error).toMatch(/too short/);
  });

  it("refuses more than a day of slots", () => {
    expect(buildSlots({ startMinute: 0, endMinute: 400, durationMinutes: 15 }).error).toBeNull();
    expect(buildSlots({ startMinute: 0, endMinute: 1000, durationMinutes: 15 }).error).toMatch(/one day/);
  });
});

describe("canOfferSlots — the same reach rule chat and homework use", () => {
  const base = { classTeacherOfSectionIds: ["s1"], teachesSectionIds: ["s2"], sectionId: "s1", isActiveStaff: true };

  it("lets the office offer slots for anybody", () => {
    expect(canOfferSlots({ ...base, roles: ["PRINCIPAL"], sectionId: "s9" }).allowed).toBe(true);
  });

  it("lets a teacher offer slots for a section they are class teacher of", () => {
    expect(canOfferSlots({ ...base, roles: ["TEACHER"] }).allowed).toBe(true);
  });

  it("lets a teacher offer slots for a section they teach in", () => {
    expect(canOfferSlots({ ...base, roles: ["TEACHER"], sectionId: "s2" }).allowed).toBe(true);
  });

  it("refuses a section they do not stand in front of", () => {
    expect(canOfferSlots({ ...base, roles: ["TEACHER"], sectionId: "s3" }).reason).toMatch(/do not teach/);
  });

  it("refuses a teacher who has left", () => {
    expect(canOfferSlots({ ...base, roles: ["TEACHER"], isActiveStaff: false }).allowed).toBe(false);
  });

  it("refuses a librarian", () => {
    expect(canOfferSlots({ ...base, roles: ["LIBRARIAN"] }).allowed).toBe(false);
  });
});

describe("canRemoveSlot", () => {
  it("allows removing an empty slot", () => {
    expect(canRemoveSlot({ isBooked: false }).allowed).toBe(true);
  });

  it("refuses removing a booked slot", () => {
    expect(canRemoveSlot({ isBooked: true }).reason).toMatch(/Cancel the booking first/);
  });
});

describe("canBookSlot", () => {
  const base = {
    alreadyBooked: false,
    studentSectionId: "sec1",
    slotSectionId: "sec1",
    parentHasAnotherSlotSameDayWithStaff: false,
  };

  it("allows the ordinary case", () => {
    expect(canBookSlot(base).allowed).toBe(true);
  });

  it("refuses an already-booked slot", () => {
    expect(canBookSlot({ ...base, alreadyBooked: true }).reason).toMatch(/already booked/);
  });

  it("refuses a child in a different section", () => {
    expect(canBookSlot({ ...base, studentSectionId: "sec2" }).reason).toMatch(/not your child's section/);
  });

  it("refuses a second slot the same day with the same teacher", () => {
    expect(canBookSlot({ ...base, parentHasAnotherSlotSameDayWithStaff: true }).reason).toMatch(/already have a slot/);
  });
});

describe("canCancelBooking", () => {
  it("allows the booking parent", () => {
    expect(canCancelBooking({ isOffice: false, isBookingParent: true, isSlotOwner: false }).allowed).toBe(true);
  });

  it("allows the teacher who owns the slot", () => {
    expect(canCancelBooking({ isOffice: false, isBookingParent: false, isSlotOwner: true }).allowed).toBe(true);
  });

  it("allows the office", () => {
    expect(canCancelBooking({ isOffice: true, isBookingParent: false, isSlotOwner: false }).allowed).toBe(true);
  });

  it("refuses everybody else", () => {
    expect(canCancelBooking({ isOffice: false, isBookingParent: false, isSlotOwner: false }).reason).toMatch(/not your booking/);
  });
});
