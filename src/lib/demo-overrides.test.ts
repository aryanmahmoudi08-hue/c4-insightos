import { beforeEach, describe, expect, it } from "vitest";
import {
  overrideKey,
  readOverrides,
  writeOverride,
  clearOverrides,
  countOverrides,
  DEMO_OVERRIDES_STORAGE_KEY,
} from "./demo-overrides";

// jsdom-free: a minimal localStorage stand-in, since these functions only ever
// touch getItem/setItem and dispatchEvent.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  clear() {
    this.m.clear();
  }
}

beforeEach(() => {
  const storage = new MemStorage();
  // @ts-expect-error minimal stand-in for the two methods used
  globalThis.window = { localStorage: storage, dispatchEvent: () => true, CustomEvent };
});

describe("overrideKey", () => {
  it("scopes by page so the same label on two pages is independent", () => {
    expect(overrideKey("/dashboard", "Cash Collected")).not.toBe(
      overrideKey("/payments", "Cash Collected"),
    );
  });
});

describe("writeOverride / readOverrides", () => {
  it("stores and reads a value back", () => {
    writeOverride("k", "$120,000");
    expect(readOverrides().k).toBe("$120,000");
  });

  it("trims whitespace", () => {
    writeOverride("k", "  $99  ");
    expect(readOverrides().k).toBe("$99");
  });

  it("clears the key when set to an empty string rather than blanking the card", () => {
    writeOverride("k", "$1");
    writeOverride("k", "   ");
    expect(readOverrides().k).toBeUndefined();
  });

  it("keeps other keys untouched", () => {
    writeOverride("a", "1");
    writeOverride("b", "2");
    writeOverride("a", "");
    expect(readOverrides()).toEqual({ b: "2" });
  });
});

describe("resilience", () => {
  it("returns {} for malformed JSON rather than throwing", () => {
    window.localStorage.setItem(DEMO_OVERRIDES_STORAGE_KEY, "{not json");
    expect(readOverrides()).toEqual({});
  });

  it("returns {} when the stored blob is an array", () => {
    window.localStorage.setItem(DEMO_OVERRIDES_STORAGE_KEY, "[1,2]");
    expect(readOverrides()).toEqual({});
  });

  // A non-string would render as "[object Object]" on a card.
  it("drops non-string values", () => {
    window.localStorage.setItem(DEMO_OVERRIDES_STORAGE_KEY, '{"a":"ok","b":{"x":1},"c":5}');
    expect(readOverrides()).toEqual({ a: "ok" });
  });
});

describe("clearOverrides", () => {
  it("removes everything", () => {
    writeOverride("a", "1");
    writeOverride("b", "2");
    expect(countOverrides()).toBe(2);
    clearOverrides();
    expect(countOverrides()).toBe(0);
  });
});
