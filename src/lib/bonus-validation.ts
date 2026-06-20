import { z } from "zod";

// Esquema de entrada compartido para crear/editar bonos.
// Reglas condicionales (montos según valueType, monthlyMode según frequency)
// se refinan abajo para devolver errores claros.
export const bonusInputSchema = z
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
    // Frecuencia mensual requiere modo de pago
    if (data.frequency === "MONTHLY" && !data.monthlyMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["monthlyMode"],
        message: "Selecciona cómo se paga el bono mensual",
      });
    }

    // Valor estándar requiere un monto positivo
    if (data.valueType === "STANDARD") {
      if (data.amount == null || data.amount <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount"],
          message: "Ingresa un valor del bono mayor a 0",
        });
      }
    }

    // Asignación específica requiere al menos un empleado
    if (data.assignmentType === "SPECIFIC" && data.assignments.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assignments"],
        message: "Selecciona al menos un empleado",
      });
    }

    // Valor personalizado: cada asignación necesita un monto positivo
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

export type BonusInput = z.infer<typeof bonusInputSchema>;
