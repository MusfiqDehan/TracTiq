import { describe, expect, it } from "vitest";
import { formatGoalText, formatShortWeek, formatTimerClock } from "@/lib/utils";

describe("Formatting and Timer Utilities", () => {
  it("formats countdown and overtime clocks accurately", () => {
    expect(formatTimerClock(300)).toBe("05:00");
    expect(formatTimerClock(65)).toBe("01:05");
    expect(formatTimerClock(0)).toBe("00:00");
  });

  it("formats goal expressions across all 4 types", () => {
    expect(formatGoalText({ type: "at_least", value: 10 }, "count")).toBe("≥ 10");
    expect(formatGoalText({ type: "at_most", value: 3 }, "%")).toBe("≤ 3%");
    expect(formatGoalText({ type: "between", min: 2, max: 4 }, "hours")).toBe("2 hours–4 hours");
    expect(formatGoalText({ type: "exactly", value: 1 }, "count")).toBe("= 1");
    expect(formatShortWeek("2026-11-02")).toBe("Nov 2");
  });
});
