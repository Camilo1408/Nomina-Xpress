# Reporte de Propinas (PDF y Excel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Descargar desde `/admin/tips` un reporte de propinas en PDF y Excel (hoja "Asignación" + hoja "Detalle por día") para el rango Desde/Hasta aplicado.

**Architecture:** Una función pura `aggregateTipsReport` (sin Prisma, usable desde el cliente) produce totales, resumen por empleado y detalle por día; un helper de servidor la alimenta desde Prisma. Dos plantillas nuevas (ExcelJS y @react-pdf/renderer) con el mismo estilo que nómina, dos rutas GET protegidas por permisos nuevos, y botones de exportación en `TipsClient`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Prisma 7, ExcelJS 4, @react-pdf/renderer 4, Vitest 4, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-25-reporte-propinas-design.md`

## Global Constraints

- Trabajar en `restaurant-nomina/`, rama `feat/reporte-propinas`.
- Textos de UI y reportes en español. Título del reporte: "Reporte de Propinas".
- Nombres de hojas Excel exactos: `Asignación` y `Detalle por día`.
- Nombre de archivo: `propinas_<from>_<to>.xlsx` / `propinas_<from>_<to>.pdf`.
- Claves de permiso exactas: `tips:export_pdf`, `tips:export_excel`; etiquetas "Exportar PDF de propinas" / "Exportar Excel de propinas".
- Firma: "Firma del personal".
- Día sin reparto: "Sin horas registradas ese día — no se distribuyó".
- Colores: primario del tenant (fallback `#C1643F`), texto `#2C1F15`, secundario `#7A6358`, verde `#6B8E6B`, rojo `#B94040`, fondo cabecera `#F2EDE6`, borde `#E0D5CA`.
- No usar `prisma migrate` ni cambiar el esquema (no hace falta).
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Desviación menor del spec (aprobable):** `fetchTipsReport` vive en `src/lib/tips-report.server.ts` (no en `tips-report.ts`) para que `TipsClient` pueda importar la función pura sin arrastrar Prisma al bundle del navegador.

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/tips-report.ts` | Crear | Tipos, `aggregateTipsReport` (pura), `parseTipsReportRange` |
| `src/lib/tips-report.server.ts` | Crear | `fetchTipsReport` (Prisma → agregado) |
| `src/lib/__tests__/tips-report.test.ts` | Crear | Tests de agregación y validación de rango |
| `src/lib/permission-keys.ts` | Modificar | 2 permisos nuevos, roles base, grupo y etiquetas |
| `src/lib/excel/tips-template.ts` | Crear | `generateTipsExcel` |
| `src/lib/excel/__tests__/tips-template.test.ts` | Crear | Tests del Excel |
| `src/lib/pdf/tips-template.tsx` | Crear | `TipsPDF` |
| `src/lib/pdf/__tests__/tips-template.test.tsx` | Crear | Smoke test del PDF |
| `src/app/api/admin/tips/export/excel/route.ts` | Crear | Ruta Excel |
| `src/app/api/admin/tips/export/pdf/route.ts` | Crear | Ruta PDF |
| `src/app/admin/tips/page.tsx` | Modificar | Pasar `canExportPdf`/`canExportExcel` |
| `src/components/admin/tips/TipsClient.tsx` | Modificar | Botones, rango aplicado, usar `aggregateTipsReport` |

---

### Task 1: Agregación del reporte y validación de rango

**Files:**
- Create: `src/lib/tips-report.ts`
- Create: `src/lib/tips-report.server.ts`
- Test: `src/lib/__tests__/tips-report.test.ts`

**Interfaces:**
- Produces:
  - `interface TipDistributionInput { employeeId: string; hoursWorked: number; tipPercent: number; effectiveHours: number; amount: number; employee: { name: string } }`
  - `interface TipEntryInput { date: string; totalAmount: number; menaje: number; netAmount: number; notes: string | null; distributions: TipDistributionInput[] }`
  - `interface TipsEmployeeSummary { employeeId: string; employeeName: string; totalHours: number; avgTipPercent: number; totalAmount: number }`
  - `interface TipsDayRow { employeeName: string; hoursWorked: number; tipPercent: number; effectiveHours: number; ratePerHour: number; amount: number }`
  - `interface TipsDay { date: string; gross: number; menaje: number; distributed: number; notes: string | null; rows: TipsDayRow[] }`
  - `interface TipsReport { totals: { gross: number; menaje: number; distributed: number }; byEmployee: TipsEmployeeSummary[]; byDay: TipsDay[] }`
  - `aggregateTipsReport(entries: TipEntryInput[]): TipsReport`
  - `parseTipsReportRange(params: URLSearchParams): { ok: true; from: string; to: string } | { ok: false; error: string }`
  - `fetchTipsReport(tenantId: string, from: string, to: string): Promise<TipsReport>` (en `tips-report.server.ts`)

- [ ] **Step 1: Escribir el test que falla**

`src/lib/__tests__/tips-report.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aggregateTipsReport, parseTipsReportRange, type TipEntryInput } from "../tips-report";

const dist = (employeeId: string, name: string, hoursWorked: number, tipPercent: number, amount: number) => ({
  employeeId,
  hoursWorked,
  tipPercent,
  effectiveHours: Math.round(hoursWorked * tipPercent) / 100,
  amount,
  employee: { name },
});

const ENTRIES: TipEntryInput[] = [
  // Viene desordenado a propósito: el reporte debe ordenar byDay ascendente.
  {
    date: "2026-09-02",
    totalAmount: 90_000,
    menaje: 9_000,
    netAmount: 81_000,
    notes: null,
    distributions: [dist("e1", "María", 7.5, 100, 81_000)],
  },
  {
    date: "2026-09-01",
    totalAmount: 120_000,
    menaje: 12_000,
    netAmount: 108_000,
    notes: "Evento privado",
    distributions: [dist("e1", "María", 8, 100, 72_000), dist("e2", "Juan", 8, 50, 36_000)],
  },
  {
    date: "2026-09-03",
    totalAmount: 10_000,
    menaje: 1_000,
    netAmount: 9_000,
    notes: null,
    distributions: [],
  },
];

describe("aggregateTipsReport", () => {
  it("suma los totales del rango", () => {
    const r = aggregateTipsReport(ENTRIES);
    expect(r.totals).toEqual({ gross: 220_000, menaje: 22_000, distributed: 198_000 });
  });

  it("agrupa por empleado con % ponderado por horas, ordenado por total desc", () => {
    const r = aggregateTipsReport(ENTRIES);
    expect(r.byEmployee).toEqual([
      { employeeId: "e1", employeeName: "María", totalHours: 15.5, avgTipPercent: 100, totalAmount: 153_000 },
      { employeeId: "e2", employeeName: "Juan", totalHours: 8, avgTipPercent: 50, totalAmount: 36_000 },
    ]);
  });

  it("la suma asignada por empleado coincide con la suma de las distribuciones", () => {
    const r = aggregateTipsReport(ENTRIES);
    const asignado = r.byEmployee.reduce((s, e) => s + e.totalAmount, 0);
    const distribuido = ENTRIES.flatMap((e) => e.distributions).reduce((s, d) => s + d.amount, 0);
    expect(asignado).toBe(distribuido);
  });

  it("promedia el % con peso de horas (8h al 100% + 8h al 50% = 75%)", () => {
    const r = aggregateTipsReport([
      { date: "2026-09-01", totalAmount: 0, menaje: 0, netAmount: 0, notes: null, distributions: [dist("e1", "Ana", 8, 100, 10)] },
      { date: "2026-09-02", totalAmount: 0, menaje: 0, netAmount: 0, notes: null, distributions: [dist("e1", "Ana", 8, 50, 10)] },
    ]);
    expect(r.byEmployee[0].avgTipPercent).toBe(75);
  });

  it("ordena el detalle por fecha ascendente y calcula propina por hora", () => {
    const r = aggregateTipsReport(ENTRIES);
    expect(r.byDay.map((d) => d.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    const d1 = r.byDay[0];
    expect(d1).toMatchObject({ gross: 120_000, menaje: 12_000, distributed: 108_000, notes: "Evento privado" });
    expect(d1.rows[0]).toEqual({ employeeName: "María", hoursWorked: 8, tipPercent: 100, effectiveHours: 8, ratePerHour: 9_000, amount: 72_000 });
    expect(d1.rows[1]).toMatchObject({ employeeName: "Juan", effectiveHours: 4, ratePerHour: 9_000 });
  });

  it("día sin reparto queda con rows vacío", () => {
    const r = aggregateTipsReport(ENTRIES);
    expect(r.byDay[2].rows).toEqual([]);
  });

  it("propina por hora es 0 si las horas efectivas son 0", () => {
    const r = aggregateTipsReport([
      { date: "2026-09-01", totalAmount: 0, menaje: 0, netAmount: 0, notes: null, distributions: [{ ...dist("e1", "Ana", 5, 0, 0), effectiveHours: 0 }] },
    ]);
    expect(r.byDay[0].rows[0].ratePerHour).toBe(0);
  });

  it("sin registros devuelve todo en cero", () => {
    expect(aggregateTipsReport([])).toEqual({ totals: { gross: 0, menaje: 0, distributed: 0 }, byEmployee: [], byDay: [] });
  });
});

describe("parseTipsReportRange", () => {
  const p = (q: string) => parseTipsReportRange(new URLSearchParams(q));

  it("acepta un rango válido", () => {
    expect(p("from=2026-09-01&to=2026-09-15")).toEqual({ ok: true, from: "2026-09-01", to: "2026-09-15" });
  });

  it("acepta from igual a to", () => {
    expect(p("from=2026-09-01&to=2026-09-01")).toMatchObject({ ok: true });
  });

  it("rechaza fechas faltantes", () => {
    expect(p("from=2026-09-01")).toEqual({ ok: false, error: "Debes indicar las fechas Desde y Hasta" });
  });

  it("rechaza formato inválido", () => {
    expect(p("from=01/09/2026&to=2026-09-15")).toEqual({ ok: false, error: "Formato de fecha inválido (usa AAAA-MM-DD)" });
  });

  it("rechaza from posterior a to", () => {
    expect(p("from=2026-09-16&to=2026-09-15")).toEqual({ ok: false, error: "La fecha Desde no puede ser posterior a Hasta" });
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npx vitest run src/lib/__tests__/tips-report.test.ts`
Expected: FAIL — `Failed to resolve import "../tips-report"`.

- [ ] **Step 3: Implementar `src/lib/tips-report.ts`**

```ts
// Agregación del reporte de propinas. Función pura (sin Prisma) para que la
// pantalla de Propinas y los reportes PDF/Excel usen exactamente los mismos números.

export interface TipDistributionInput {
  employeeId: string;
  hoursWorked: number;
  tipPercent: number;
  effectiveHours: number;
  amount: number;
  employee: { name: string };
}

export interface TipEntryInput {
  date: string;
  totalAmount: number;
  menaje: number;
  netAmount: number;
  notes: string | null;
  distributions: TipDistributionInput[];
}

export interface TipsEmployeeSummary {
  employeeId: string;
  employeeName: string;
  totalHours: number;
  avgTipPercent: number;
  totalAmount: number;
}

export interface TipsDayRow {
  employeeName: string;
  hoursWorked: number;
  tipPercent: number;
  effectiveHours: number;
  ratePerHour: number;
  amount: number;
}

export interface TipsDay {
  date: string;
  gross: number;
  menaje: number;
  distributed: number;
  notes: string | null;
  rows: TipsDayRow[];
}

export interface TipsReport {
  totals: { gross: number; menaje: number; distributed: number };
  byEmployee: TipsEmployeeSummary[];
  byDay: TipsDay[];
}

function aggregateByEmployee(entries: TipEntryInput[]): TipsEmployeeSummary[] {
  const map = new Map<string, { name: string; hours: number; weightedPct: number; amount: number }>();

  for (const entry of entries) {
    for (const d of entry.distributions) {
      const existing = map.get(d.employeeId);
      if (existing) {
        existing.hours += d.hoursWorked;
        existing.weightedPct += d.tipPercent * d.hoursWorked;
        existing.amount += d.amount;
      } else {
        map.set(d.employeeId, {
          name: d.employee.name,
          hours: d.hoursWorked,
          weightedPct: d.tipPercent * d.hoursWorked,
          amount: d.amount,
        });
      }
    }
  }

  return Array.from(map.entries())
    .map(([employeeId, v]) => ({
      employeeId,
      employeeName: v.name,
      totalHours: Math.round(v.hours * 100) / 100,
      avgTipPercent: v.hours > 0 ? Math.round(v.weightedPct / v.hours) : 0,
      totalAmount: Math.round(v.amount),
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

export function aggregateTipsReport(entries: TipEntryInput[]): TipsReport {
  const totals = entries.reduce(
    (acc, e) => ({
      gross: acc.gross + e.totalAmount,
      menaje: acc.menaje + e.menaje,
      distributed: acc.distributed + e.netAmount,
    }),
    { gross: 0, menaje: 0, distributed: 0 }
  );

  const byDay: TipsDay[] = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      date: e.date,
      gross: e.totalAmount,
      menaje: e.menaje,
      distributed: e.netAmount,
      notes: e.notes,
      rows: e.distributions.map((d) => ({
        employeeName: d.employee.name,
        hoursWorked: d.hoursWorked,
        tipPercent: d.tipPercent,
        effectiveHours: d.effectiveHours,
        ratePerHour: d.effectiveHours > 0 ? Math.round(d.amount / d.effectiveHours) : 0,
        amount: d.amount,
      })),
    }));

  return { totals, byEmployee: aggregateByEmployee(entries), byDay };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseTipsReportRange(
  params: URLSearchParams
): { ok: true; from: string; to: string } | { ok: false; error: string } {
  const from = params.get("from");
  const to = params.get("to");
  if (!from || !to) return { ok: false, error: "Debes indicar las fechas Desde y Hasta" };
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return { ok: false, error: "Formato de fecha inválido (usa AAAA-MM-DD)" };
  }
  if (from > to) return { ok: false, error: "La fecha Desde no puede ser posterior a Hasta" };
  return { ok: true, from, to };
}
```

- [ ] **Step 4: Implementar `src/lib/tips-report.server.ts`**

```ts
// Solo servidor: carga las propinas del rango desde Prisma y las agrega.
// Mismo filtro de fechas que GET /api/admin/tips.
import { prisma } from "@/lib/db";
import { aggregateTipsReport, type TipsReport } from "@/lib/tips-report";

export async function fetchTipsReport(tenantId: string, from: string, to: string): Promise<TipsReport> {
  const entries = await prisma.tipEntry.findMany({
    where: { tenantId, date: { gte: from, lte: to } },
    include: {
      distributions: {
        include: { employee: { select: { name: true } } },
        orderBy: { amount: "desc" },
      },
    },
    orderBy: { date: "asc" },
  });
  return aggregateTipsReport(entries);
}
```

- [ ] **Step 5: Ejecutar tests y verificar que pasan**

Run: `npx vitest run src/lib/__tests__/tips-report.test.ts`
Expected: PASS (13 tests).

Run: `npx tsc --noEmit -p . 2>&1 | grep tips-report`
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tips-report.ts src/lib/tips-report.server.ts src/lib/__tests__/tips-report.test.ts
git commit -m "feat(propinas): agregación del reporte de propinas por empleado y por día

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Permisos de exportación

**Files:**
- Modify: `src/lib/permission-keys.ts` (bloque `// ── Propinas`, `BASE_ROLE_PERMISSIONS.ADMIN`, `.SUPERADMIN`, grupo `module: "tips"`, etiquetas `"tips:*"`)
- Test: `src/lib/__tests__/get-permissions.test.ts` (añadir casos)

**Interfaces:**
- Produces: `PERMISSIONS.TIPS_EXPORT_PDF = "tips:export_pdf"`, `PERMISSIONS.TIPS_EXPORT_EXCEL = "tips:export_excel"`.

- [ ] **Step 1: Escribir el test que falla** — en `src/lib/__tests__/get-permissions.test.ts`, cambiar la línea 3 a:

```ts
import { PERMISSIONS, BASE_ROLE_PERMISSIONS, PERMISSION_LABELS } from "../permission-keys";
```

y añadir al final del archivo:

```ts
describe("permisos de exportación de propinas", () => {
  it("ADMIN y SUPERADMIN pueden exportar propinas por defecto", () => {
    for (const role of ["ADMIN", "SUPERADMIN"]) {
      expect(BASE_ROLE_PERMISSIONS[role]).toContain(PERMISSIONS.TIPS_EXPORT_PDF);
      expect(BASE_ROLE_PERMISSIONS[role]).toContain(PERMISSIONS.TIPS_EXPORT_EXCEL);
    }
  });

  it("EMPLOYEE no puede exportar propinas", () => {
    expect(BASE_ROLE_PERMISSIONS.EMPLOYEE).not.toContain(PERMISSIONS.TIPS_EXPORT_PDF);
  });

  it("tienen etiqueta en español", () => {
    expect(PERMISSION_LABELS["tips:export_pdf"]).toBe("Exportar PDF de propinas");
    expect(PERMISSION_LABELS["tips:export_excel"]).toBe("Exportar Excel de propinas");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/lib/__tests__/get-permissions.test.ts`
Expected: FAIL — `TIPS_EXPORT_PDF` undefined / etiqueta undefined.

- [ ] **Step 3: Implementar en `src/lib/permission-keys.ts`**

En el bloque de claves, después de `TIPS_DELETE`:

```ts
  TIPS_DELETE:              "tips:delete",
  TIPS_EXPORT_PDF:          "tips:export_pdf",
  TIPS_EXPORT_EXCEL:        "tips:export_excel",
```

En `BASE_ROLE_PERMISSIONS.ADMIN`, después de `PERMISSIONS.TIPS_EDIT,`:

```ts
    PERMISSIONS.TIPS_EXPORT_PDF,
    PERMISSIONS.TIPS_EXPORT_EXCEL,
```

En `BASE_ROLE_PERMISSIONS.SUPERADMIN`, después de `PERMISSIONS.TIPS_DELETE,`:

```ts
    PERMISSIONS.TIPS_EXPORT_PDF,
    PERMISSIONS.TIPS_EXPORT_EXCEL,
```

En el grupo `module: "tips"`, `keys` queda:

```ts
    keys: [
      PERMISSIONS.TIPS_VIEW,
      PERMISSIONS.TIPS_CREATE,
      PERMISSIONS.TIPS_EDIT,
      PERMISSIONS.TIPS_DELETE,
      PERMISSIONS.TIPS_EXPORT_PDF,
      PERMISSIONS.TIPS_EXPORT_EXCEL,
    ],
```

En el mapa de etiquetas, después de `"tips:delete"`:

```ts
  "tips:export_pdf":          "Exportar PDF de propinas",
  "tips:export_excel":        "Exportar Excel de propinas",
```

- [ ] **Step 4: Ejecutar toda la suite**

Run: `npx vitest run`
Expected: PASS (todos; los 308 previos + los nuevos). Si algún test existente fija la cantidad exacta de permisos por rol o de `ALL_PERMISSION_KEYS`, actualizar ese número sumando 2 y dejar constancia en el commit.

- [ ] **Step 5: Commit**

```bash
git add src/lib/permission-keys.ts src/lib/__tests__/get-permissions.test.ts
git commit -m "feat(propinas): permisos para exportar el reporte de propinas en PDF y Excel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Plantilla Excel

**Files:**
- Create: `src/lib/excel/tips-template.ts`
- Test: `src/lib/excel/__tests__/tips-template.test.ts`

**Interfaces:**
- Consumes: `TipsReport` de `@/lib/tips-report`; `LoadedLogo` de `@/lib/logo-loader`.
- Produces: `generateTipsExcel(report: TipsReport, period: { from: string; to: string }, tenantName: string, primaryColor: string, logo?: LoadedLogo | null): Promise<Buffer>`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { generateTipsExcel } from "../tips-template";
import { aggregateTipsReport } from "@/lib/tips-report";

const REPORT = aggregateTipsReport([
  {
    date: "2026-09-01", totalAmount: 120_000, menaje: 12_000, netAmount: 108_000, notes: null,
    distributions: [
      { employeeId: "e1", hoursWorked: 8, tipPercent: 100, effectiveHours: 8, amount: 72_000, employee: { name: "María" } },
      { employeeId: "e2", hoursWorked: 8, tipPercent: 50, effectiveHours: 4, amount: 36_000, employee: { name: "Juan" } },
    ],
  },
  { date: "2026-09-02", totalAmount: 10_000, menaje: 1_000, netAmount: 9_000, notes: null, distributions: [] },
]);

async function load() {
  const buffer = await generateTipsExcel(REPORT, { from: "2026-09-01", to: "2026-09-15" }, "Cucina dei Fiori", "#C1643F", null);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

const rows = (ws: ExcelJS.Worksheet) => ws.getRows(1, ws.rowCount) ?? [];
const text = (ws: ExcelJS.Worksheet) => rows(ws).map((r) => String(r.getCell(1).value ?? ""));

describe("Excel de propinas", () => {
  it("tiene las hojas Asignación y Detalle por día", async () => {
    const wb = await load();
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Asignación", "Detalle por día"]);
  });

  it("título con restaurante, nombre del reporte y período", async () => {
    const ws = (await load()).getWorksheet("Asignación")!;
    expect(ws.getCell("A1").value).toBe("Cucina dei Fiori — Reporte de Propinas 2026-09-01 al 2026-09-15");
  });

  it("muestra los totales del rango", async () => {
    const ws = (await load()).getWorksheet("Asignación")!;
    const val = (label: string) => rows(ws).find((r) => r.getCell(1).value === label)!.getCell(2).value;
    expect(val("Total propinas brutas")).toBe(130_000);
    expect(val("Provisión menaje (10%)")).toBe(13_000);
    expect(val("Total distribuido")).toBe(117_000);
  });

  it("una fila por empleado con total y espacio de firma; total final = suma", async () => {
    const ws = (await load()).getWorksheet("Asignación")!;
    const maria = rows(ws).find((r) => r.getCell(1).value === "María")!;
    expect(maria.getCell(4).value).toBe(72_000);
    expect(String(maria.getCell(5).value)).toContain("____");
    const header = rows(ws).find((r) => r.getCell(1).value === "Personal")!;
    expect(header.getCell(5).value).toBe("Firma del personal");
    const total = rows(ws).find((r) => r.getCell(1).value === "TOTAL ASIGNADO")!;
    expect(total.getCell(4).value).toBe(108_000);
  });

  it("reporte sin propinas: totales y total asignado en cero, con aviso en ambas hojas", async () => {
    const buffer = await generateTipsExcel(aggregateTipsReport([]), { from: "2026-09-01", to: "2026-09-15" }, "X", "#C1643F", null);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Asignación")!;
    const val = (label: string) => rows(ws).find((r) => r.getCell(1).value === label)!.getCell(2).value;
    expect(val("Total propinas brutas")).toBe(0);
    expect(val("Total distribuido")).toBe(0);
    expect(rows(ws).find((r) => r.getCell(1).value === "TOTAL ASIGNADO")!.getCell(4).value).toBe(0);
    expect(text(ws)).toContain("No hay propinas registradas en este período.");
    expect(text(wb.getWorksheet("Detalle por día")!)).toContain("No hay propinas registradas en este período.");
  });

  it("detalle agrupado por día con reparto y aviso cuando no se distribuyó", async () => {
    const ws = (await load()).getWorksheet("Detalle por día")!;
    const t = text(ws);
    expect(t.some((s) => s.startsWith("01/09/2026"))).toBe(true);
    expect(t).toContain("Juan");
    expect(t).toContain("Sin horas registradas ese día — no se distribuyó");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/lib/excel/__tests__/tips-template.test.ts`
Expected: FAIL — `Failed to resolve import "../tips-template"`.

- [ ] **Step 3: Implementar `src/lib/excel/tips-template.ts`**

```ts
import ExcelJS from "exceljs";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { LoadedLogo } from "@/lib/logo-loader";
import type { TipsReport } from "@/lib/tips-report";

const MONEY = '"$"#,##0';
const HOURS = '0.00"h"';
const PCT = '0"%"';
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2EDE6" } };
const ALT_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9F5F0" } };

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, color: { argb: "FF2C1F15" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFE0D5CA" } } };
    cell.alignment = { horizontal: "center" };
  });
}

export async function generateTipsExcel(
  report: TipsReport,
  period: { from: string; to: string },
  tenantName: string,
  primaryColor: string,
  logo?: LoadedLogo | null
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const hex = primaryColor.replace("#", "");

  // ── Hoja 1: Asignación ────────────────────────────────────────────────────
  const ws = workbook.addWorksheet("Asignación");
  ws.columns = [
    { key: "name", width: 28 },
    { key: "hours", width: 16 },
    { key: "pct", width: 14 },
    { key: "total", width: 18 },
    { key: "sign", width: 34 },
  ];

  const LOGO_SIZE = 64;
  ws.getRow(1).height = 56;
  if (logo) {
    const ext = logo.format === "jpg" ? "jpeg" : "png";
    const imageId = workbook.addImage({ buffer: logo.data as unknown as ExcelJS.Buffer, extension: ext });
    ws.addImage(imageId, {
      tl: { col: 4.05, row: 0.05 }, // col 4 = E (base 0)
      ext: { width: LOGO_SIZE, height: LOGO_SIZE },
      editAs: "oneCell",
    });
  }

  ws.mergeCells("A1:D1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `${tenantName} — Reporte de Propinas ${period.from} al ${period.to}`;
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } };
  titleCell.font = { bold: true, size: 14, color: { argb: "FFFAF7F2" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  const totalsRows: [string, number, string][] = [
    ["Total propinas brutas", report.totals.gross, "FF2C1F15"],
    ["Provisión menaje (10%)", report.totals.menaje, "FFB94040"],
    ["Total distribuido", report.totals.distributed, "FF6B8E6B"],
  ];
  for (const [label, value, color] of totalsRows) {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { bold: true, color: { argb: "FF7A6358" } };
    row.getCell(2).numFmt = MONEY;
    row.getCell(2).font = { bold: true, color: { argb: color } };
  }
  ws.addRow([]);

  styleHeader(ws.addRow(["Personal", "Horas trabajadas", "% Asignación", "Total recibido", "Firma del personal"]));

  report.byEmployee.forEach((emp, i) => {
    const row = ws.addRow([emp.employeeName, emp.totalHours, emp.avgTipPercent, emp.totalAmount, "______________________________"]);
    row.height = 24;
    row.getCell(2).numFmt = HOURS;
    row.getCell(3).numFmt = PCT;
    row.getCell(4).numFmt = MONEY;
    row.getCell(4).font = { bold: true, color: { argb: "FF6B8E6B" } };
    row.getCell(5).font = { color: { argb: "FF7A6358" } };
    row.alignment = { vertical: "bottom" };
    if (i % 2 === 1) row.eachCell((cell) => { cell.fill = ALT_FILL; });
  });

  if (report.byEmployee.length === 0) {
    const empty = ws.addRow(["No hay propinas registradas en este período."]);
    ws.mergeCells(`A${empty.number}:E${empty.number}`);
    empty.getCell(1).font = { italic: true, color: { argb: "FF7A6358" } };
  }

  const assigned = report.byEmployee.reduce((s, e) => s + e.totalAmount, 0);
  const totalRow = ws.addRow(["TOTAL ASIGNADO", "", "", assigned, ""]);
  totalRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
  });
  totalRow.getCell(4).numFmt = MONEY;

  // ── Hoja 2: Detalle por día ───────────────────────────────────────────────
  const detail = workbook.addWorksheet("Detalle por día");
  detail.columns = [
    { key: "name", width: 28 },
    { key: "hours", width: 12 },
    { key: "pct", width: 12 },
    { key: "eff", width: 12 },
    { key: "rate", width: 14 },
    { key: "amount", width: 16 },
  ];

  if (report.byDay.length === 0) {
    const empty = detail.addRow(["No hay propinas registradas en este período."]);
    detail.mergeCells(`A${empty.number}:F${empty.number}`);
    empty.getCell(1).font = { italic: true, color: { argb: "FF7A6358" } };
  }

  for (const day of report.byDay) {
    const titleText =
      `${formatDate(day.date)} — Bruto ${formatCurrency(day.gross)} | ` +
      `Menaje ${formatCurrency(day.menaje)} | Distribuido ${formatCurrency(day.distributed)}` +
      (day.notes ? ` — ${day.notes}` : "");
    const dayRow = detail.addRow([titleText]);
    detail.mergeCells(`A${dayRow.number}:F${dayRow.number}`);
    dayRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } };
    dayRow.getCell(1).font = { bold: true, color: { argb: "FFFAF7F2" } };

    if (day.rows.length === 0) {
      const empty = detail.addRow(["Sin horas registradas ese día — no se distribuyó"]);
      detail.mergeCells(`A${empty.number}:F${empty.number}`);
      empty.getCell(1).font = { italic: true, color: { argb: "FF7A6358" } };
    } else {
      styleHeader(detail.addRow(["Personal", "Horas", "% Prop.", "Hs. ef.", "Prop./h", "Propina"]));
      day.rows.forEach((r, i) => {
        const row = detail.addRow([r.employeeName, r.hoursWorked, r.tipPercent, r.effectiveHours, r.ratePerHour, r.amount]);
        row.getCell(2).numFmt = HOURS;
        row.getCell(3).numFmt = PCT;
        row.getCell(4).numFmt = HOURS;
        row.getCell(5).numFmt = MONEY;
        row.getCell(6).numFmt = MONEY;
        row.getCell(6).font = { bold: true, color: { argb: "FF6B8E6B" } };
        if (i % 2 === 1) row.eachCell((cell) => { cell.fill = ALT_FILL; });
      });
    }
    detail.addRow([]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run src/lib/excel/__tests__/tips-template.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/excel/tips-template.ts src/lib/excel/__tests__/tips-template.test.ts
git commit -m "feat(propinas): plantilla Excel del reporte (Asignación + Detalle por día)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Plantilla PDF

**Files:**
- Create: `src/lib/pdf/tips-template.tsx`
- Test: `src/lib/pdf/__tests__/tips-template.test.tsx`

**Interfaces:**
- Consumes: `TipsReport`; `PdfLogo` de `@/lib/pdf/payroll-template`.
- Produces: `TipsPDF(props: { tenantName: string; period: { from: string; to: string }; report: TipsReport; primaryColor: string; logo?: PdfLogo }): JSX.Element`

- [ ] **Step 1: Escribir el test que falla**

```tsx
import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { TipsPDF } from "../tips-template";
import { aggregateTipsReport } from "@/lib/tips-report";

describe("PDF de propinas", () => {
  it("genera un PDF válido con asignación y detalle", async () => {
    const report = aggregateTipsReport([
      {
        date: "2026-09-01", totalAmount: 120_000, menaje: 12_000, netAmount: 108_000, notes: "Evento",
        distributions: [
          { employeeId: "e1", hoursWorked: 8, tipPercent: 100, effectiveHours: 8, amount: 72_000, employee: { name: "María" } },
          { employeeId: "e2", hoursWorked: 8, tipPercent: 50, effectiveHours: 4, amount: 36_000, employee: { name: "Juan" } },
        ],
      },
      { date: "2026-09-02", totalAmount: 10_000, menaje: 1_000, netAmount: 9_000, notes: null, distributions: [] },
    ]);
    const buffer = await renderToBuffer(
      TipsPDF({ tenantName: "Cucina dei Fiori", period: { from: "2026-09-01", to: "2026-09-15" }, report, primaryColor: "#C1643F", logo: null })
    );
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("genera un PDF aunque no haya registros", async () => {
    const buffer = await renderToBuffer(
      TipsPDF({ tenantName: "X", period: { from: "2026-09-01", to: "2026-09-15" }, report: aggregateTipsReport([]), primaryColor: "#C1643F" })
    );
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/lib/pdf/__tests__/tips-template.test.tsx`
Expected: FAIL — `Failed to resolve import "../tips-template"`.

- [ ] **Step 3: Implementar `src/lib/pdf/tips-template.tsx`**

```tsx
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { TipsReport } from "@/lib/tips-report";
import type { PdfLogo } from "@/lib/pdf/payroll-template";

const styles = StyleSheet.create({
  page: { padding: 32, paddingBottom: 56, fontSize: 10, fontFamily: "Helvetica", color: "#2C1F15" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  headerLeft: { flex: 1, paddingRight: 12 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 11, color: "#7A6358" },
  logoBox: { width: 70, height: 70, alignItems: "center", justifyContent: "center" },
  logo: { maxWidth: 70, maxHeight: 70, objectFit: "contain" },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 6, marginTop: 4 },
  cards: { flexDirection: "row", gap: 8, marginBottom: 16 },
  card: { flex: 1, border: 1, borderColor: "#E0D5CA", borderRadius: 4, padding: 8 },
  cardLabel: { fontSize: 8, color: "#7A6358", marginBottom: 3 },
  cardValue: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  table: { border: 1, borderColor: "#E0D5CA", borderRadius: 4 },
  tableHeader: { flexDirection: "row", backgroundColor: "#F2EDE6", padding: "6 8" },
  tableRow: { flexDirection: "row", padding: "5 8", borderTop: 1, borderColor: "#E0D5CA" },
  tableRowAlt: { flexDirection: "row", padding: "5 8", borderTop: 1, borderColor: "#E0D5CA", backgroundColor: "#FDFAF7" },
  headerText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#7A6358" },
  totalRow: { flexDirection: "row", padding: "6 8", borderTop: 2, borderColor: "#2C1F15", backgroundColor: "#F2EDE6" },
  bold: { fontFamily: "Helvetica-Bold" },
  green: { color: "#6B8E6B" },
  right: { textAlign: "right" },
  signatures: { marginTop: 20 },
  signatureItem: { width: "48%", marginBottom: 18 },
  signatureLine: { borderBottom: 1, borderColor: "#7A6358", marginTop: 22 },
  signatureLabel: { fontSize: 9, color: "#7A6358", marginTop: 4 },
  dayBlock: { marginBottom: 12 },
  dayHeader: { padding: "6 8", borderRadius: 4, marginBottom: 4 },
  dayHeaderText: { color: "#FAF7F2", fontFamily: "Helvetica-Bold", fontSize: 10 },
  dayNotes: { color: "#FAF7F2", fontSize: 8, marginTop: 2 },
  emptyDay: { fontSize: 9, color: "#7A6358", fontStyle: "italic", padding: "4 8" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, borderTop: 1, borderColor: "#E0D5CA", paddingTop: 6 },
  footerText: { fontSize: 8, color: "#A08878", textAlign: "center" },
});

// Anchos de columnas (flex)
const A = { name: 3, hours: 2, pct: 2, total: 2 };
const D = { name: 3, hours: 1.2, pct: 1.2, eff: 1.2, rate: 1.6, amount: 1.8 };

interface TipsPDFProps {
  tenantName: string;
  period: { from: string; to: string };
  report: TipsReport;
  primaryColor: string;
  logo?: PdfLogo;
}

function Header({ tenantName, period, primaryColor, logo }: Omit<TipsPDFProps, "report">) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerLeft}>
        <Text style={[styles.title, { color: primaryColor }]}>{tenantName}</Text>
        <Text style={styles.subtitle}>Reporte de Propinas — {period.from} al {period.to}</Text>
      </View>
      {logo && (
        <View style={styles.logoBox}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logo} style={styles.logo} />
        </View>
      )}
    </View>
  );
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) =>
          `Generado el ${new Date().toLocaleDateString("es-CO")} — Nómina Xpress — Página ${pageNumber} de ${totalPages}`
        }
      />
    </View>
  );
}

export function TipsPDF({ tenantName, period, report, primaryColor, logo }: TipsPDFProps) {
  const assigned = report.byEmployee.reduce((s, e) => s + e.totalAmount, 0);

  return (
    <Document>
      {/* ── Página 1: Asignación ── */}
      <Page size="A4" style={styles.page}>
        <Header tenantName={tenantName} period={period} primaryColor={primaryColor} logo={logo} />

        <View style={styles.cards}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Total propinas brutas</Text>
            <Text style={styles.cardValue}>{formatCurrency(report.totals.gross)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Provisión menaje (10%)</Text>
            <Text style={[styles.cardValue, { color: "#B94040" }]}>{formatCurrency(report.totals.menaje)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Total distribuido</Text>
            <Text style={[styles.cardValue, styles.green]}>{formatCurrency(report.totals.distributed)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Asignación por personal</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[{ flex: A.name }, styles.headerText]}>Personal</Text>
            <Text style={[{ flex: A.hours }, styles.headerText, styles.right]}>Horas trabajadas</Text>
            <Text style={[{ flex: A.pct }, styles.headerText, styles.right]}>% Asignación</Text>
            <Text style={[{ flex: A.total }, styles.headerText, styles.right]}>Total recibido</Text>
          </View>
          {report.byEmployee.map((e, i) => (
            <View key={e.employeeId} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt} wrap={false}>
              <Text style={{ flex: A.name }}>{e.employeeName}</Text>
              <Text style={[{ flex: A.hours }, styles.right]}>{e.totalHours.toFixed(2)}h</Text>
              <Text style={[{ flex: A.pct }, styles.right]}>{e.avgTipPercent}%</Text>
              <Text style={[{ flex: A.total }, styles.right, styles.bold, styles.green]}>{formatCurrency(e.totalAmount)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={[{ flex: A.name + A.hours + A.pct }, styles.bold]}>TOTAL ASIGNADO</Text>
            <Text style={[{ flex: A.total }, styles.right, styles.bold, styles.green]}>{formatCurrency(assigned)}</Text>
          </View>
        </View>

        {report.byEmployee.length > 0 && (
          <View style={[styles.signatures, { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }]}>
            {report.byEmployee.map((e) => (
              <View key={e.employeeId} style={styles.signatureItem} wrap={false}>
                <View style={styles.signatureLine} />
                <Text style={styles.signatureLabel}>
                  Firma del personal: {e.employeeName} — {formatCurrency(e.totalAmount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Footer />
      </Page>

      {/* ── Detalle por día ── */}
      <Page size="A4" style={styles.page}>
        <Header tenantName={tenantName} period={period} primaryColor={primaryColor} logo={logo} />
        <Text style={styles.sectionTitle}>Detalle por día</Text>

        {report.byDay.length === 0 && <Text style={styles.emptyDay}>No hay propinas registradas en este período.</Text>}

        {report.byDay.map((day) => (
          <View key={day.date} style={styles.dayBlock} wrap={false}>
            <View style={[styles.dayHeader, { backgroundColor: primaryColor }]}>
              <Text style={styles.dayHeaderText}>
                {formatDate(day.date)} — Bruto {formatCurrency(day.gross)} | Menaje {formatCurrency(day.menaje)} | Distribuido {formatCurrency(day.distributed)}
              </Text>
              {day.notes && <Text style={styles.dayNotes}>{day.notes}</Text>}
            </View>
            {day.rows.length === 0 ? (
              <Text style={styles.emptyDay}>Sin horas registradas ese día — no se distribuyó</Text>
            ) : (
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[{ flex: D.name }, styles.headerText]}>Personal</Text>
                  <Text style={[{ flex: D.hours }, styles.headerText, styles.right]}>Horas</Text>
                  <Text style={[{ flex: D.pct }, styles.headerText, styles.right]}>% Prop.</Text>
                  <Text style={[{ flex: D.eff }, styles.headerText, styles.right]}>Hs. ef.</Text>
                  <Text style={[{ flex: D.rate }, styles.headerText, styles.right]}>Prop./h</Text>
                  <Text style={[{ flex: D.amount }, styles.headerText, styles.right]}>Propina</Text>
                </View>
                {day.rows.map((r, i) => (
                  <View key={`${day.date}-${i}`} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                    <Text style={{ flex: D.name }}>{r.employeeName}</Text>
                    <Text style={[{ flex: D.hours }, styles.right]}>{r.hoursWorked.toFixed(2)}h</Text>
                    <Text style={[{ flex: D.pct }, styles.right]}>{r.tipPercent}%</Text>
                    <Text style={[{ flex: D.eff }, styles.right]}>{r.effectiveHours.toFixed(2)}h</Text>
                    <Text style={[{ flex: D.rate }, styles.right]}>{formatCurrency(r.ratePerHour)}</Text>
                    <Text style={[{ flex: D.amount }, styles.right, styles.bold, styles.green]}>{formatCurrency(r.amount)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        <Footer />
      </Page>
    </Document>
  );
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run src/lib/pdf/__tests__/tips-template.test.tsx`
Expected: PASS (2 tests). Si `fontStyle: "italic"` lanza error de fuente con Helvetica, cambiar `emptyDay` a `fontFamily: "Helvetica-Oblique"` y quitar `fontStyle`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/tips-template.tsx src/lib/pdf/__tests__/tips-template.test.tsx
git commit -m "feat(propinas): plantilla PDF del reporte (asignación con firmas + detalle por día)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Rutas de exportación

**Files:**
- Create: `src/app/api/admin/tips/export/excel/route.ts`
- Create: `src/app/api/admin/tips/export/pdf/route.ts`

**Interfaces:**
- Consumes: `parseTipsReportRange` (`@/lib/tips-report`), `fetchTipsReport` (`@/lib/tips-report.server`), `generateTipsExcel`, `TipsPDF`, `PERMISSIONS.TIPS_EXPORT_EXCEL|PDF`, `loadTenantLogo`, `logAudit`.
- Produces: `GET /api/admin/tips/export/excel?from&to` y `GET /api/admin/tips/export/pdf?from&to` → archivo; 401 `{ error: "Unauthorized" }`; 400 `{ error: <mensaje de parseTipsReportRange> }`.

- [ ] **Step 1: Crear la ruta Excel**

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";
import { loadTenantLogo } from "@/lib/logo-loader";
import { parseTipsReportRange } from "@/lib/tips-report";
import { fetchTipsReport } from "@/lib/tips-report.server";
import { generateTipsExcel } from "@/lib/excel/tips-template";

export async function GET(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.TIPS_EXPORT_EXCEL))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const range = parseTipsReportRange(new URL(req.url).searchParams);
  if (!range.ok) return NextResponse.json({ error: range.error }, { status: 400 });
  const { from, to } = range;

  const tenantId = session.user.tenantId;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const report = await fetchTipsReport(tenantId, from, to);
  const logo = await loadTenantLogo(tenant?.logoUrl);

  const buffer = await generateTipsExcel(
    report,
    { from, to },
    tenant?.name ?? "Restaurante",
    tenant?.primaryColor ?? "#C1643F",
    logo
  );

  await logAudit(req, session, {
    action: "EXPORT",
    module: "TIPS",
    description: `Exportó el reporte de propinas en Excel (${from} a ${to})`,
    after: { format: "EXCEL", from, to },
  });

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="propinas_${from}_${to}.xlsx"`,
    },
  });
}
```

- [ ] **Step 2: Crear la ruta PDF**

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/get-permissions";
import { PERMISSIONS } from "@/lib/permission-keys";
import { loadTenantLogo } from "@/lib/logo-loader";
import { parseTipsReportRange } from "@/lib/tips-report";
import { fetchTipsReport } from "@/lib/tips-report.server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session || !(await sessionCan(session, PERMISSIONS.TIPS_EXPORT_PDF))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const range = parseTipsReportRange(new URL(req.url).searchParams);
  if (!range.ok) return NextResponse.json({ error: range.error }, { status: 400 });
  const { from, to } = range;

  const tenantId = session.user.tenantId;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const report = await fetchTipsReport(tenantId, from, to);

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { TipsPDF } = await import("@/lib/pdf/tips-template");
  const logo = await loadTenantLogo(tenant?.logoUrl);

  const buffer = await renderToBuffer(
    TipsPDF({
      tenantName: tenant?.name ?? "Restaurante",
      period: { from, to },
      report,
      primaryColor: tenant?.primaryColor ?? "#C1643F",
      logo,
    })
  );

  await logAudit(req, session, {
    action: "EXPORT",
    module: "TIPS",
    description: `Exportó el reporte de propinas en PDF (${from} a ${to})`,
    after: { format: "PDF", from, to },
  });

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="propinas_${from}_${to}.pdf"`,
    },
  });
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "tips/export|tips-report|tips-template"`
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/tips/export
git commit -m "feat(propinas): rutas de exportación del reporte de propinas en PDF y Excel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Botones de exportación en la pantalla de Propinas

**Files:**
- Modify: `src/app/admin/tips/page.tsx`
- Modify: `src/components/admin/tips/TipsClient.tsx`

**Interfaces:**
- Consumes: `aggregateTipsReport` (`@/lib/tips-report`), rutas de Task 5, `PERMISSIONS.TIPS_EXPORT_PDF|EXCEL`.

- [ ] **Step 1: `page.tsx` — pasar permisos**

Reemplazar el `<TipsClient ... />` por:

```tsx
      <TipsClient
        canCreate={permissions.has(PERMISSIONS.TIPS_CREATE)}
        canEdit={permissions.has(PERMISSIONS.TIPS_EDIT)}
        canDelete={permissions.has(PERMISSIONS.TIPS_DELETE)}
        canExportPdf={permissions.has(PERMISSIONS.TIPS_EXPORT_PDF)}
        canExportExcel={permissions.has(PERMISSIONS.TIPS_EXPORT_EXCEL)}
      />
```

- [ ] **Step 2: `TipsClient.tsx` — usar la agregación compartida**

Borrar la interfaz `EmployeeSummary` y la función local `aggregateByEmployee` completas. Añadir el import:

```ts
import { aggregateTipsReport } from "@/lib/tips-report";
```

y reemplazar

```ts
  const employeeSummaries = aggregateByEmployee(entries);
```

por

```ts
  const employeeSummaries = aggregateTipsReport(entries).byEmployee;
```

- [ ] **Step 3: `TipsClient.tsx` — props, rango aplicado y descarga**

Import de iconos: añadir `FileSpreadsheet, FileDown` al import de `lucide-react`.

`TipsClientProps` queda:

```ts
interface TipsClientProps {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExportPdf: boolean;
  canExportExcel: boolean;
}
```

Firma del componente:

```ts
export function TipsClient({ canCreate, canEdit, canDelete, canExportPdf, canExportExcel }: TipsClientProps) {
```

Estados nuevos, junto a los demás `useState`:

```ts
  // Rango con el que se cargó la lista: los reportes usan este, no lo escrito sin aplicar.
  const [appliedRange, setAppliedRange] = useState({ from: period.from, to: period.to });
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  // Formato pendiente de confirmar cuando el rango no tiene propinas (reporte en ceros).
  const [confirmEmptyExport, setConfirmEmptyExport] = useState<"pdf" | "excel" | null>(null);
```

En `fetchTips`, después de `setEntries(data.entries ?? []);` añadir:

```ts
      setAppliedRange({ from: f, to: t });
```

Nueva función, debajo de `deleteEntry`:

```ts
  async function downloadExport(format: "pdf" | "excel") {
    setExporting(format);
    try {
      const params = new URLSearchParams(appliedRange);
      const res = await fetch(`/api/admin/tips/export/${format}?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "No se pudo generar el reporte");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `propinas_${appliedRange.from}_${appliedRange.to}.${format === "pdf" ? "pdf" : "xlsx"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo generar el reporte");
    } finally {
      setExporting(null);
    }
  }

  // Si el rango aplicado no tiene propinas, se avisa y se pide confirmación
  // antes de descargar un reporte en ceros.
  function requestExport(format: "pdf" | "excel") {
    if (entries.length === 0) {
      setConfirmEmptyExport(format);
      return;
    }
    downloadExport(format);
  }
```

Junto al `<ConfirmDialog>` existente (el de eliminar), añadir un segundo diálogo:

```tsx
      <ConfirmDialog
        open={!!confirmEmptyExport}
        title="No hay propinas en este período"
        description={`No hay propinas registradas entre el ${formatDate(appliedRange.from)} y el ${formatDate(appliedRange.to)}. ¿Deseas descargar el reporte de todas formas? Todos los valores estarán en cero.`}
        confirmLabel="Descargar de todas formas"
        onConfirm={() => {
          const format = confirmEmptyExport;
          setConfirmEmptyExport(null);
          if (format) downloadExport(format);
        }}
        onCancel={() => setConfirmEmptyExport(null)}
      />
```

(`ConfirmDialog` sin `variant` usa su estilo por defecto; revisar `src/components/shared/ConfirmDialog.tsx` para confirmar que `variant` es opcional; si es obligatorio, pasar el valor no destructivo que acepte.)

- [ ] **Step 4: `TipsClient.tsx` — botones**

Dentro de la tarjeta de filtros, justo después del `</div>` que cierra el grid de inputs/botones (antes del `</div>` que cierra la tarjeta), añadir:

```tsx
        {(canExportExcel || canExportPdf) && (
          <div className="flex flex-col sm:flex-row gap-2 pt-3 mt-3 border-t border-[#F2EDE6]">
            {canExportExcel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => requestExport("excel")}
                disabled={exporting !== null}
                className="gap-1.5 border-[#6B8E6B] text-[#6B8E6B] w-full sm:w-auto justify-center"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {exporting === "excel" ? "Generando..." : "Exportar Excel (propinas)"}
              </Button>
            )}
            {canExportPdf && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => requestExport("pdf")}
                disabled={exporting !== null}
                className="gap-1.5 border-[#B94040] text-[#B94040] w-full sm:w-auto justify-center"
              >
                <FileDown className="w-4 h-4" />
                {exporting === "pdf" ? "Generando..." : "Exportar PDF (propinas)"}
              </Button>
            )}
          </div>
        )}
```

- [ ] **Step 5: Verificar tipos, lint y suite**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "tips"`
Expected: sin salida.

Run: `npx eslint src/components/admin/tips/TipsClient.tsx src/app/admin/tips/page.tsx src/lib/tips-report.ts src/lib/tips-report.server.ts src/lib/excel/tips-template.ts src/lib/pdf/tips-template.tsx src/app/api/admin/tips/export`
Expected: sin errores.

Run: `npx vitest run`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/tips/page.tsx src/components/admin/tips/TipsClient.tsx
git commit -m "feat(propinas): botones para exportar el reporte de propinas en PDF y Excel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verificación en el navegador

**Files:** ninguno (solo verificación; corregir en el archivo que corresponda si algo falla).

- [ ] **Step 1:** Levantar el dev server con `preview_start` usando la configuración existente de `.claude/launch.json`.
- [ ] **Step 2:** Iniciar sesión con el usuario demo SUPERADMIN del seed e ir a `/admin/tips`. Confirmar que aparecen "Exportar Excel (propinas)" y "Exportar PDF (propinas)". Filtrar un rango sin registros (p. ej. 2020-01-01 a 2020-01-15), pulsar un botón y confirmar que aparece el diálogo "No hay propinas en este período"; "Cancelar" lo cierra sin descargar y "Descargar de todas formas" pide la ruta (verificar con `read_network_requests` un 200).
- [ ] **Step 3:** Con `javascript_tool`, pedir ambas rutas con el rango aplicado y comprobar `status 200`, `content-type` y `content-disposition` (`propinas_<from>_<to>.xlsx|pdf`); pedir `?from=2026-09-16&to=2026-09-15` y comprobar `400` con el mensaje "La fecha Desde no puede ser posterior a Hasta".
- [ ] **Step 4:** Descargar el Excel desde la ruta (fetch → guardar en scratchpad no es posible desde el navegador; en su lugar, correr en Bash un script `npx tsx` en el scratchpad que llame a `fetchTipsReport` + `generateTipsExcel` para el mismo rango y abrir el archivo con ExcelJS para confirmar que el total de "TOTAL ASIGNADO" coincide con "Total distribuido" de la pantalla, vista "Por personal").
- [ ] **Step 5:** Captura de pantalla de la pantalla de Propinas con los botones como prueba.
- [ ] **Step 6:** Si hubo correcciones, commit con `fix(propinas): ...`.
