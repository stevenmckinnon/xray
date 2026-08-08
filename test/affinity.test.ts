import { describe, expect, it } from "vitest";
import { isPlausible, rankScored, rankTokens } from "../src/client/affinity";

/** The real collision set at Salt's medium density: everything below is 8px. */
const EIGHT_PX = [
  "--salt-curve-200",
  "--salt-size-adornment",
  "--salt-size-bar-strong",
  "--salt-spacing-100",
  "--salt-spacing-fixed-800",
];

describe("rankTokens", () => {
  it("picks the spacing token for padding", () => {
    expect(rankTokens("padding-left", EIGHT_PX)[0]).toBe("--salt-spacing-100");
  });

  it("picks the curve token for a corner radius", () => {
    expect(rankTokens("border-top-left-radius", EIGHT_PX)[0]).toBe(
      "--salt-curve-200",
    );
  });

  it("picks the size token for height", () => {
    expect(
      rankTokens("height", ["--salt-spacing-350", "--salt-size-base"])[0],
    ).toBe("--salt-size-base");
  });

  it("prefers the semantic colour token over the raw palette entry", () => {
    const names = [
      "--salt-color-white",
      "--salt-palette-neutral-primary-background",
      "--salt-container-primary-background",
    ];
    expect(rankTokens("background-color", names)[0]).toBe(
      "--salt-container-primary-background",
    );
  });

  it("prefers a foreground token for text colour", () => {
    const names = [
      "--salt-color-gray-900",
      "--salt-content-primary-foreground",
    ];
    expect(rankTokens("color", names)[0]).toBe(
      "--salt-content-primary-foreground",
    );
  });

  it("keeps every candidate", () => {
    expect(rankTokens("padding-left", EIGHT_PX)).toHaveLength(EIGHT_PX.length);
  });
});

describe("isPlausible", () => {
  it("accepts a match whose name belongs to the property", () => {
    expect(isPlausible(rankScored("padding-left", EIGHT_PX))).toBe(true);
  });

  it("rejects a numeric coincidence", () => {
    // 13px really is --salt-accent-lineHeight, and that really is irrelevant to padding.
    expect(
      isPlausible(rankScored("padding-left", ["--salt-accent-lineHeight"])),
    ).toBe(false);
  });

  it("rejects a weak-keyword-only match", () => {
    // "fontSize" contains "size", which does not make it a border radius.
    expect(
      isPlausible(
        rankScored("border-top-left-radius", ["--salt-text-label-fontSize"]),
      ),
    ).toBe(false);
  });

  it("is not fooled into rejecting a legitimate palette-layer token", () => {
    expect(
      isPlausible(
        rankScored("background-color", [
          "--salt-palette-neutral-primary-background",
        ]),
      ),
    ).toBe(true);
  });

  it("rejects when there are no candidates at all", () => {
    expect(isPlausible([])).toBe(false);
  });
});

describe("veto keywords", () => {
  it("refuses a typographic token as an explanation for a box height", () => {
    // At high density 28px really is --salt-text-display2-fontSize. Reporting a
    // button's height as a display heading's font size is worse than silence.
    const ranked = rankScored("height", ["--salt-text-display2-fontSize"]);
    expect(isPlausible(ranked)).toBe(false);
  });

  it("still accepts the size token for height when both are present", () => {
    const names = ["--salt-text-display2-fontSize", "--salt-size-base"];
    expect(rankTokens("height", names)[0]).toBe("--salt-size-base");
    expect(isPlausible(rankScored("height", names))).toBe(true);
  });

  it("refuses a rounding token as an explanation for padding", () => {
    expect(isPlausible(rankScored("padding-top", ["--salt-curve-200"]))).toBe(
      false,
    );
  });

  it("refuses a spacing token as an explanation for a corner radius", () => {
    expect(
      isPlausible(rankScored("border-top-left-radius", ["--salt-spacing-100"])),
    ).toBe(false);
  });

  it("keeps font-size matching its own token", () => {
    expect(isPlausible(rankScored("font-size", ["--salt-text-fontSize"]))).toBe(
      true,
    );
  });
});
