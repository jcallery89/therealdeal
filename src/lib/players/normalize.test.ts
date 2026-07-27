import { describe, expect, it } from "vitest";
import { normalizeName } from "./normalize";

describe("normalizeName", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeName("Ja'Marr Chase")).toBe("ja marr chase");
    expect(normalizeName("A.J. Brown")).toBe("a j brown");
    expect(normalizeName("Amon-Ra St. Brown")).toBe("amon ra st brown");
  });

  it("strips generational suffixes", () => {
    expect(normalizeName("Kenneth Walker III")).toBe(normalizeName("Kenneth Walker"));
    expect(normalizeName("Michael Penix Jr.")).toBe(normalizeName("Michael Penix"));
    expect(normalizeName("Marvin Harrison Jr.")).toBe("marvin harrison");
  });

  it("applies nickname aliases symmetrically", () => {
    expect(normalizeName("Hollywood Brown")).toBe(normalizeName("Marquise Brown"));
    expect(normalizeName("Cameron Ward")).toBe(normalizeName("Cam Ward"));
  });

  it("strips diacritics", () => {
    expect(normalizeName("José Ramírez")).toBe("jose ramirez");
  });
});
