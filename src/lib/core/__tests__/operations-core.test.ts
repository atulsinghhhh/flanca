import { describe, expect, it } from "vitest";
import {
  applyStockTxn, canAllot, canBoard, canDeleteRoom, canDeleteRoute, canDeleteStop,
  needsReorder, validateItem, validateRoom, validateRoute,
} from "../operations-core";

describe("validateRoute", () => {
  it("accepts a route a school would run", () => {
    expect(validateRoute({ name: "Kolar Road", vehicleNo: "MP04 AB 1234", capacity: 40, driverPhone: "9826010099" }).ok).toBe(true);
  });

  it("insists on a name and refuses a duplicate", () => {
    expect(validateRoute({ name: "" }).ok).toBe(false);
    expect(validateRoute({ name: "kolar road", existingNames: ["Kolar Road"] }).ok).toBe(false);
  });

  it("refuses a bus that seats nobody", () => {
    expect(validateRoute({ name: "R", capacity: 0 }).ok).toBe(false);
  });

  it("warns about a hundred-seat vehicle rather than refusing", () => {
    const check = validateRoute({ name: "R", capacity: 120 });
    expect(check.ok).toBe(true);
    expect(check.messages[0].level).toBe("WARNING");
  });

  it("wants ten digits or nothing for the driver", () => {
    expect(validateRoute({ name: "R", driverPhone: "98260" }).ok).toBe(false);
    expect(validateRoute({ name: "R", driverPhone: "" }).ok).toBe(true);
  });
});

describe("canBoard — a seat is a real thing", () => {
  const base = { capacity: 40, onBoard: 20, studentStatus: "ACTIVE", alreadyOnThisRoute: false };

  it("allows an ordinary child onto a bus with room", () => {
    expect(canBoard(base).allowed).toBe(true);
  });

  it("refuses a full bus, with the numbers", () => {
    const check = canBoard({ ...base, onBoard: 40 });
    expect(check.reason).toMatch(/full — 40 of 40 seats/);
  });

  it("allows boarding when no capacity is recorded, rather than guessing one", () => {
    expect(canBoard({ ...base, capacity: null, onBoard: 500 }).allowed).toBe(true);
  });

  it("refuses the same child twice and a child who has left", () => {
    expect(canBoard({ ...base, alreadyOnThisRoute: true }).allowed).toBe(false);
    expect(canBoard({ ...base, studentStatus: "TRANSFERRED" }).allowed).toBe(false);
  });
});

describe("canDeleteRoute / canDeleteStop", () => {
  it("refuses a route children use", () => {
    expect(canDeleteRoute({ students: 24, stops: 0 }).reason).toMatch(/24 children use/);
  });

  it("refuses a route with stops still on it", () => {
    expect(canDeleteRoute({ students: 0, stops: 5 }).allowed).toBe(false);
  });

  it("allows an unused route", () => {
    expect(canDeleteRoute({ students: 0, stops: 0 }).allowed).toBe(true);
  });

  it("refuses a stop children are picked up at", () => {
    expect(canDeleteStop({ students: 1 }).reason).toMatch(/1 child is/);
  });
});

describe("validateRoom / canDeleteRoom", () => {
  it("accepts a room", () => {
    expect(validateRoom({ roomNo: "B-12", capacity: 3, kind: "BOYS" }).ok).toBe(true);
  });

  it("refuses a duplicate room number", () => {
    expect(validateRoom({ roomNo: "b-12", capacity: 2, existingRoomNos: ["B-12"] }).ok).toBe(false);
  });

  it("refuses a room that sleeps nobody, and a kind that is not one", () => {
    expect(validateRoom({ roomNo: "1", capacity: 0 }).ok).toBe(false);
    expect(validateRoom({ roomNo: "1", capacity: 2, kind: "MIXED" }).ok).toBe(false);
  });

  it("keeps a room anybody has stayed in", () => {
    expect(canDeleteRoom({ allotments: 3 }).reason).toMatch(/3 children have/);
    expect(canDeleteRoom({ allotments: 0 }).allowed).toBe(true);
  });
});

describe("canAllot — beds and wings", () => {
  const base = {
    capacity: 2, occupied: 1, roomKind: "BOYS", studentGender: "MALE",
    studentStatus: "ACTIVE", alreadyInARoom: false,
  };

  it("allots a bed in a room with one free", () => {
    expect(canAllot(base).allowed).toBe(true);
  });

  it("refuses a full room with the numbers", () => {
    expect(canAllot({ ...base, occupied: 2 }).reason).toMatch(/full — 2 of 2 beds/);
  });

  it("refuses a girl a bed in the boys' wing", () => {
    expect(canAllot({ ...base, studentGender: "FEMALE" }).reason).toMatch(/boys room/);
  });

  it("does not guess when the room has no kind or the child has no gender recorded", () => {
    expect(canAllot({ ...base, roomKind: null, studentGender: "FEMALE" }).allowed).toBe(true);
    expect(canAllot({ ...base, studentGender: null }).allowed).toBe(true);
  });

  it("says to move a child who already has a bed rather than giving them two", () => {
    expect(canAllot({ ...base, alreadyInARoom: true }).reason).toMatch(/Move them/);
  });
});

describe("applyStockTxn — a register that cannot go negative", () => {
  it("adds a delivery", () => {
    expect(applyStockTxn({ kind: "IN", quantity: 50, current: 10 })).toEqual({ allowed: true, reason: null, next: 60 });
  });

  it("issues what is there", () => {
    expect(applyStockTxn({ kind: "OUT", quantity: 10, current: 10 }).next).toBe(0);
  });

  it("refuses to issue what is not there, and says what to do", () => {
    const r = applyStockTxn({ kind: "OUT", quantity: 11, current: 10 });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/only 10 left/);
    expect(r.reason).toMatch(/Count the shelf/);
    expect(r.next).toBe(10);
  });

  it("uses the singular for one", () => {
    expect(applyStockTxn({ kind: "OUT", quantity: 2, current: 1 }).reason).toMatch(/is only 1 left/);
  });

  it("lets a stock count set the number outright, because that is what a count is", () => {
    expect(applyStockTxn({ kind: "ADJUST", quantity: 3, current: 900 }).next).toBe(3);
    expect(applyStockTxn({ kind: "ADJUST", quantity: 0, current: 900 }).next).toBe(0);
  });

  it("refuses a negative count and a fractional quantity", () => {
    expect(applyStockTxn({ kind: "ADJUST", quantity: -1, current: 5 }).allowed).toBe(false);
    expect(applyStockTxn({ kind: "IN", quantity: 1.5, current: 5 }).allowed).toBe(false);
  });

  it("refuses a movement of nothing", () => {
    expect(applyStockTxn({ kind: "IN", quantity: 0, current: 5 }).allowed).toBe(false);
  });
});

describe("validateItem / needsReorder", () => {
  it("accepts an item", () => {
    expect(validateItem({ name: "Chalk", unit: "boxes", reorderAt: 10 }).ok).toBe(true);
  });

  it("insists on a unit, because a bare number of chalk means nothing", () => {
    expect(validateItem({ name: "Chalk", unit: " " }).ok).toBe(false);
  });

  it("refuses a duplicate item", () => {
    expect(validateItem({ name: "chalk", unit: "box", existingNames: ["Chalk"] }).ok).toBe(false);
  });

  it("flags an item at or below its reorder level", () => {
    expect(needsReorder({ quantity: 10, reorderAt: 10 })).toBe(true);
    expect(needsReorder({ quantity: 11, reorderAt: 10 })).toBe(false);
    expect(needsReorder({ quantity: 0, reorderAt: null })).toBe(false);
  });
});
