import { afterEach, describe, expect, it } from "vitest";
import { isInventoryEnabled } from "@/lib/feature-flags";

const KEY = "NEXT_PUBLIC_INVENTARIO_APP_URL";

describe("isInventoryEnabled", () => {
  const original = process.env[KEY];

  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  it("returns false when the env var is undefined", () => {
    delete process.env[KEY];
    expect(isInventoryEnabled()).toBe(false);
  });

  it("returns false when the env var is empty or whitespace", () => {
    process.env[KEY] = "   ";
    expect(isInventoryEnabled()).toBe(false);
  });

  it("returns true when the env var has a non-empty value", () => {
    process.env[KEY] = "https://inventario.example.com";
    expect(isInventoryEnabled()).toBe(true);
  });
});
