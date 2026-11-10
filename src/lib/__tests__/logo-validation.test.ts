import { describe, expect, it } from "vitest";
import { detectLogoType } from "../logo-validation";

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46);
const WEBP = new Uint8Array([...text("RIFF"), 0x24, 0, 0, 0, ...text("WEBP"), ...text("VP8 ")]);

describe("detectLogoType (CP-51)", () => {
  it("reconoce PNG, JPG y WEBP por sus bytes iniciales", () => {
    expect(detectLogoType(PNG)).toBe("png");
    expect(detectLogoType(JPG)).toBe("jpg");
    expect(detectLogoType(WEBP)).toBe("webp");
  });

  it("[NEG] rechaza un SVG, aunque sea una imagen válida", () => {
    expect(detectLogoType(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(detectLogoType(text('<?xml version="1.0"?><svg></svg>'))).toBeNull();
  });

  it("[NEG] rechaza HTML, texto y archivos vacíos", () => {
    expect(detectLogoType(text("<!doctype html><script>alert(1)</script>"))).toBeNull();
    expect(detectLogoType(text("hola"))).toBeNull();
    expect(detectLogoType(bytes())).toBeNull();
  });

  it("[NEG] un RIFF que no es WEBP (por ejemplo un WAV) no pasa", () => {
    expect(detectLogoType(new Uint8Array([...text("RIFF"), 0x24, 0, 0, 0, ...text("WAVE")]))).toBeNull();
  });

  it("[LIM] una firma incompleta no pasa", () => {
    expect(detectLogoType(PNG.slice(0, 7))).toBeNull();
    expect(detectLogoType(JPG.slice(0, 2))).toBeNull();
    expect(detectLogoType(WEBP.slice(0, 11))).toBeNull();
  });
});
