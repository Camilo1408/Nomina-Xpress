import { z } from "zod";

// Esquema de entrada para crear/editar descuentos. Idéntico en forma al de bonos
// (mismas reglas condicionales) pero con mensajes propios de descuentos.
export const discountInputSchema = z
  .object({
    name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    description: z.string().max(500).optional().nullable(),
    valueType: z.enum(["STANDARD", "PER_EMPLOYEE"]),
    amount: z.number().nonnegative().optional(),
    assignmentType: z.enum(["ALL", "PAYROLL", "SHIFT", "SPECIFIC"]),
    frequency: z.enum(["BIWEEKLY", "MONTHLY"]),
    monthlyMode: z.enum(["FIRST", "SECOND", "SPLIT"]).optional().nullable(),
    active: z.boolean().optional(),
    assignments: z
      .array(
        z.object({
          employeeId: z.string().min(1),
          amount: z.number().positive().optional().nullable(),
        })
      )
      .optional()
      .default([]),
  })
  .superRefine((data, ctx) => {
    if (data.frequency === "MONTHLY" && !data.monthlyMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["monthlyMode"],
        message: "Selecciona cómo se aplica el descuento mensual",
      });
    }

    if (data.valueType === "STANDARD") {
      if (data.amount == null || data.amount <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount"],
          message: "Ingresa un valor del descuento mayor a 0",
        });
      }
    }

    if (data.assignmentType === "SPECIFIC" && data.assignments.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assignments"],
        message: "Selecciona al menos un empleado",
      });
    }

    if (data.valueType === "PER_EMPLOYEE") {
      if (data.assignments.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["assignments"],
          message: "Configura el valor por empleado para al menos un empleado",
        });
      }
      data.assignments.forEach((a, i) => {
        if (a.amount == null || a.amount <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["assignments", i, "amount"],
            message: "Cada empleado debe tener un valor mayor a 0",
          });
        }
      });
    }
  });

export type DiscountInput = z.infer<typeof discountInputSchema>;
