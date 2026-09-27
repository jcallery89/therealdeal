import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses quoted fields, embedded commas/quotes, and CRLF", () => {
    const text = '"player","pos","note"\r\n"Ja\'Marr Chase","WR","x, y"\r\n"A ""Q"" B","TE",""\r\n';
    expect(parseCsv(text)).toEqual([
      { player: "Ja'Marr Chase", pos: "WR", note: "x, y" },
      { player: 'A "Q" B', pos: "TE", note: "" },
    ]);
  });

  it("handles unquoted values and a missing trailing newline", () => {
    expect(parseCsv("a,b\n1,2\n3,4")).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("returns no rows for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});
