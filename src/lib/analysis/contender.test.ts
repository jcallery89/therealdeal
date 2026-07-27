import { describe, expect, it } from "vitest";
import { bucketForScore } from "./contender";

describe("bucketForScore", () => {
  it("maps scores to posture buckets at documented boundaries", () => {
    expect(bucketForScore(60)).toBe("Contend");
    expect(bucketForScore(26)).toBe("Contend");
    expect(bucketForScore(25)).toBe("Push");
    expect(bucketForScore(0)).toBe("Push");
    expect(bucketForScore(-1)).toBe("Retool");
    expect(bucketForScore(-25)).toBe("Retool");
    expect(bucketForScore(-26)).toBe("Rebuild");
  });
});
