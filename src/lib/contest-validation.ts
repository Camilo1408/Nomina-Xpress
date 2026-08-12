// Schemas Zod de entrada del módulo de concursos. Todo input de usuario pasa por
// aquí antes de tocar Prisma.

import { z } from "zod";
import {
  CONTEST_CRITERIA,
  PAYOUT_MODES,
  WINNER_MODES,
  TIP_CONTEST_MAX_PERCENT,
} from "@/lib/contests";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener el formato AAAA-MM-DD");

/** Porcentaje de un ítem: > 0, hasta el tope, máximo 2 decimales. */
const percentSchema = z
  .number()
  .positive("El porcentaje debe ser mayor que 0")
  .max(TIP_CONTEST_MAX_PERCENT, `El porcentaje no puede superar el ${TIP_CONTEST_MAX_PERCENT}%`)
  .refine((p) => Math.round(p * 100) / 100 === p, "El porcentaje admite máximo 2 decimales");

export const contestItemInputSchema = z.object({
  name: z.string().trim().min(1, "El nombre del ítem es obligatorio").max(120),
  description: z.string().trim().max(500).optional().nullable(),
  goalValue: z.number().finite("La meta debe ser un número").nonnegative("La meta no puede ser negativa"),
  goalUnit: z.string().trim().min(1).max(40).default("unidades"),
  criteria: z.enum(CONTEST_CRITERIA),
  percent: percentSchema,
  winnerMode: z.enum(WINNER_MODES),
});

export const contestInputSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre del concurso es obligatorio").max(160),
    description: z.string().trim().max(1000).optional().nullable(),
    startDate: dateString,
    endDate: dateString,
    payoutMode: z.enum(PAYOUT_MODES),
    items: z
      .array(contestItemInputSchema)
      .min(1, "El concurso debe tener al menos un ítem"),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "La fecha de fin no puede ser anterior a la de inicio",
    path: ["endDate"],
  })
  .refine(
    (d) => new Set(d.items.map((i) => i.name.toLowerCase())).size === d.items.length,
    { message: "Hay dos ítems con el mismo nombre", path: ["items"] }
  );

/** Edición del concurso: los ítems se gestionan por sus propias rutas. */
export const contestUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional().nullable(),
    startDate: dateString,
    endDate: dateString,
    payoutMode: z.enum(PAYOUT_MODES),
    /** Obligatorio cuando el cambio modifica reservas ya existentes. */
    confirmImpact: z.boolean().optional(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "La fecha de fin no puede ser anterior a la de inicio",
    path: ["endDate"],
  });

export const contestResultsSchema = z.object({
  results: z
    .array(
      z.object({
        employeeId: z.string().min(1),
        value: z.number().finite("El resultado debe ser un número"),
        achievedAt: z.iso.datetime().optional().nullable(),
        notes: z.string().trim().max(300).optional().nullable(),
      })
    )
    .min(1, "Registra al menos un resultado"),
});

export const awardSchema = z.object({
  /** Solo para ítems con criterio SELECCION_MANUAL o para desempatar. */
  manualEmployeeIds: z.array(z.string().min(1)).optional(),
});

export const cancelSchema = z.object({
  reason: z.string().trim().min(3, "Indica el motivo de la cancelación").max(300),
  /**
   * Confirmación explícita de que se van a modificar propinas ya repartidas.
   * La UI la marca solo después de mostrar el impacto día por día.
   */
  confirmImpact: z.literal(true, {
    message: "Debes confirmar el impacto sobre las propinas antes de cancelar",
  }),
});

export const activateSchema = z.object({
  /** Igual que en cancelar: obligatoria si hay días ya registrados en el rango. */
  confirmImpact: z.boolean().optional(),
});

export const voidItemSchema = z.object({
  reason: z.string().trim().min(3, "Indica el motivo").max(300),
  confirmImpact: z.literal(true, {
    message: "Debes confirmar la devolución de la reserva a los empleados",
  }),
});

export const voidBonusSchema = z.object({
  reason: z.string().trim().min(3, "Indica el motivo de la anulación").max(300),
});

export const updatePaymentSchema = z.object({
  periodStart: dateString,
  periodEnd: dateString,
});

export type ContestInput = z.infer<typeof contestInputSchema>;
export type ContestItemInput = z.infer<typeof contestItemInputSchema>;
