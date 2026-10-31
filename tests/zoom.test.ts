import { describe, expect, it } from "vitest";
import { ZOOM_MAX, ZOOM_MIN, parseZoom, stepZoom, zoomLabel } from "../src/zoom";

describe("zoom", () => {
  it("valor salvo vale; ausente, zero ou lixo é 100 %", () => {
    expect(parseZoom("1.3")).toBe(1.3);
    expect(parseZoom(null)).toBe(1);
    expect(parseZoom("0")).toBe(1);
    expect(parseZoom("lixo")).toBe(1);
    expect(parseZoom("")).toBe(1);
  });

  it("anda de 10 em 10 % sem erro de ponto flutuante", () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1.1, 1)).toBe(1.2);
    expect(stepZoom(1.2, -1)).toBe(1.1);
    expect(stepZoom(0.7, -1)).toBe(0.6);
  });

  it("para nos limites", () => {
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });

  it("valor salvo fora da faixa volta aos poucos", () => {
    expect(stepZoom(0.3, 1)).toBe(0.4);
    expect(stepZoom(3, -1)).toBe(2.9);
    expect(stepZoom(0.3, -1)).toBe(ZOOM_MIN);
    expect(stepZoom(3, 1)).toBe(ZOOM_MAX);
  });

  it("rótulo em porcentagem inteira", () => {
    expect(zoomLabel(1)).toBe("100 %");
    expect(zoomLabel(1.1)).toBe("110 %");
  });
});
