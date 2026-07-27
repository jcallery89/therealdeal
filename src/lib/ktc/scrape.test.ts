import { describe, expect, it } from "vitest";
import { extractPlayersArray } from "./scrape";

const SAMPLE_HTML = `
<html><head><script>
var somethingElse = 1;
var playersArray = [{"playerName":"Ja'Marr Chase","position":"WR","team":"CIN","age":25,"oneQBValues":{"value":9500},"superflexValues":{"value":9200}},{"playerName":"Josh Allen","position":"QB","team":"BUF","age":29,"oneQBValues":{"value":7800},"superflexValues":{"value":9900}}];
var after = true;
</script></head><body></body></html>`;

describe("extractPlayersArray", () => {
  it("pulls the embedded players array out of page HTML", () => {
    const players = extractPlayersArray(SAMPLE_HTML);
    expect(players).toHaveLength(2);
    expect(players[0].playerName).toBe("Ja'Marr Chase");
    expect(players[1].superflexValues.value).toBe(9900);
  });

  it("throws on pages without the array (triggers fixture fallback)", () => {
    expect(() => extractPlayersArray("<html>redesigned</html>")).toThrow();
  });
});
