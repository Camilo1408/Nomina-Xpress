import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

// Seed LOCAL — usa la misma config que la app (TURSO_DATABASE_URL apunta a file:./dev.db).
// Ejecutar con: npx tsx prisma/seed-local.ts

const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL ?? "file:./dev.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

function hoursFromNoon(date: string, startHour: number, endHour: number) {
  return {
    checkIn: new Date(`${date}T${String(startHour).padStart(2, "0")}:00:00`),
    checkOut: new Date(`${date}T${String(endHour).padStart(2, "0")}:00:00`),
  };
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Calcula la quincena actual igual que getCurrentPeriod() en ReportsClient:
// día <= 15 → [1, 15]; si no → [16, fin de mes].
function getCurrentPeriod(): { from: string; to: string; fromDate: Date; toDate: Date } {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  if (today.getDate() <= 15) {
    const fromDate = new Date(year, month, 1);
    const toDate = new Date(year, month, 15);
    return { from: ymd(fromDate), to: ymd(toDate), fromDate, toDate };
  }
  const lastDay = new Date(year, month + 1, 0).getDate();
  const fromDate = new Date(year, month, 16);
  const toDate = new Date(year, month, lastDay);
  return { from: ymd(fromDate), to: ymd(toDate), fromDate, toDate };
}

// Genera las fechas de la quincena actual desde el inicio del período hasta hoy
// (inclusive). Los domingos se marcan como especiales (tarifa dominical).
function workDatesUpToToday(): { date: string; isSpecial: boolean }[] {
  const { fromDate } = getCurrentPeriod();
  const today = new Date();
  const result: { date: string; isSpecial: boolean }[] = [];
  const cursor = new Date(fromDate);
  while (cursor <= today) {
    result.push({ date: ymd(cursor), isSpecial: cursor.getDay() === 0 }); // 0 = domingo
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

async function main() {
  console.log("🧹 Limpiando BD...");
  await prisma.auditLog.deleteMany({});
  await prisma.userPermission.deleteMany({});
  await prisma.tipDistribution.deleteMany({});
  await prisma.tipEntry.deleteMany({});
  await prisma.bonusAssignment.deleteMany({});
  await prisma.bonus.deleteMany({});
  await prisma.discountAssignment.deleteMany({});
  await prisma.discount.deleteMany({});
  await prisma.payAdjustment.deleteMany({});
  await prisma.scheduleShift.deleteMany({});
  await prisma.schedule.deleteMany({});
  await prisma.timeEntry.deleteMany({});
  await prisma.pushSubscription.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.customRole.deleteMany({});
  await prisma.tenant.deleteMany({});

  console.log("🏗️  Creando tenant...");
  const tenant = await prisma.tenant.create({
    data: {
      name: "Restaurante Demo",
      primaryColor: "#C1643F",
      secondaryColor: "#8B6355",
    },
  });

  console.log("👥 Creando usuarios y empleados...");

  // PROPRIETARY — acceso total al sistema
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: "SadminJavier",
      passwordHash: await bcrypt.hash("Javier123", 12),
      role: "PROPRIETARY",
    },
  });

  // SUPERADMIN
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: "SadminMajo",
      passwordHash: await bcrypt.hash("Majo123", 12),
      role: "SUPERADMIN",
    },
  });

  // ADMIN
  const userValen = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: "AdminValen",
      passwordHash: await bcrypt.hash("Valen123", 12),
      role: "ADMIN",
    },
  });

  // EMPLOYEE — Cesar con acceso a Inventario
  const empCesar = await prisma.employee.create({
    data: {
      tenantId: tenant.id,
      name: "Cesar Hernández",
      documentId: "1001234567",
      phone: "3001112233",
      hourlyRateNormal: 6900,
      hourlyRateSpecial: 11400,
      tipPercent: 100,
      payType: "PAYROLL",
    },
  });
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: "CesarH",
      passwordHash: await bcrypt.hash("CesarH123", 12),
      role: "EMPLOYEE",
      employeeId: empCesar.id,
      inventoryAccess: true,
    },
  });

  // EMPLOYEE — Vanessa sin acceso a inventario
  const empVanessa = await prisma.employee.create({
    data: {
      tenantId: tenant.id,
      name: "Vanessa Ríos",
      documentId: "1002345678",
      phone: "3004445566",
      hourlyRateNormal: 6900,
      hourlyRateSpecial: 11400,
      tipPercent: 100,
      payType: "PAYROLL",
    },
  });
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: "Vanessa",
      passwordHash: await bcrypt.hash("Vanessa123", 12),
      role: "EMPLOYEE",
      employeeId: empVanessa.id,
      inventoryAccess: false,
    },
  });

  // Empleados adicionales sin acceso al sistema (datos de prueba para nómina)
  const empCarlos = await prisma.employee.create({
    data: {
      tenantId: tenant.id,
      name: "Carlos López",
      documentId: "87654321",
      phone: "3109876543",
      hourlyRateNormal: 7200,
      hourlyRateSpecial: 12500,
      tipPercent: 100,
      payType: "PAYROLL",
    },
  });
  const empAna = await prisma.employee.create({
    data: {
      tenantId: tenant.id,
      name: "Ana Martínez",
      documentId: "11223344",
      phone: "3151234567",
      hourlyRateNormal: 6800,
      hourlyRateSpecial: 11800,
      tipPercent: 100,
      payType: "SHIFT",
    },
  });

  console.log("⏱️  Creando registros de horas de prueba...");
  const payableEmployees = [empCesar, empVanessa, empCarlos, empAna];
  const period = getCurrentPeriod();
  const workDays = workDatesUpToToday();
  console.log(`   Período actual: ${period.from} a ${period.to} (${workDays.length} días)`);

  for (const emp of payableEmployees) {
    for (const { date, isSpecial } of workDays) {
      // Normal: 08:00–16:00 (8h). Especial (domingo): 10:00–16:00 (6h).
      const { checkIn, checkOut } = isSpecial
        ? hoursFromNoon(date, 10, 16)
        : hoursFromNoon(date, 8, 16);
      await prisma.timeEntry.create({
        data: {
          tenantId: tenant.id,
          employeeId: emp.id,
          date,
          checkIn,
          checkOut,
          isSpecial,
        },
      });
    }
  }

  console.log("💰 Creando propina de prueba...");
  // Propina en el primer día laborado del período — usa las horas reales de ese día.
  const tipDay = workDays[0];
  const tipDate = tipDay?.date ?? period.from;
  // Horas reales por empleado ese día: normal=8h, especial (domingo/festivo)=6h.
  const tipDayHours = tipDay?.isSpecial ? 6 : 8;
  const totalTipAmount = 500000;
  const menaje = Math.round(totalTipAmount * 0.1);
  const netAmount = totalTipAmount - menaje;
  // Distribución proporcional a horas efectivas (todos 100% → misma proporción)
  const totalEffective = payableEmployees.length * tipDayHours;
  const ratePerHour = totalEffective > 0 ? netAmount / totalEffective : 0;
  await prisma.tipEntry.create({
    data: {
      tenantId: tenant.id,
      date: tipDate,
      totalAmount: totalTipAmount,
      menaje,
      netAmount,
      periodStart: period.from,
      periodEnd: period.to,
      notes: "Propina de prueba (seed)",
      distributions: {
        create: payableEmployees.map((emp) => ({
          tenantId: tenant.id,
          employeeId: emp.id,
          hoursWorked: tipDayHours,
          tipPercent: 100,
          effectiveHours: tipDayHours,
          amount: Math.round(tipDayHours * ratePerHour),
        })),
      },
    },
  });
  console.log(`   Propina del ${tipDate}: ${tipDayHours}h × ${payableEmployees.length} personas → ~${Math.round(netAmount / payableEmployees.length).toLocaleString("es-CO")} c/u`);

  console.log("📅 Creando horario publicado de prueba...");
  const schedule = await prisma.schedule.create({
    data: {
      tenantId: tenant.id,
      name: `Horario ${period.from} a ${period.to}`,
      weekStart: period.from,
      published: true,
      shifts: {
        create: payableEmployees.flatMap((emp) =>
          workDays.map(({ date }) => ({
            employeeId: emp.id,
            date,
            startTime: "08:00",
            endTime: "16:00",
          }))
        ),
      },
    },
  });
  console.log(`   Horario "${schedule.name}" con turnos para ${payableEmployees.length} empleados`);

  console.log("🎁 Creando bonos de prueba...");
  // Bono STANDARD para todos los empleados de nómina (quincenal)
  await prisma.bonus.create({
    data: {
      tenantId: tenant.id,
      name: "Bono de transporte",
      description: "Auxilio de transporte quincenal",
      valueType: "STANDARD",
      amount: 50000,
      assignmentType: "PAYROLL",
      frequency: "BIWEEKLY",
      active: true,
    },
  });
  // Bono PER_EMPLOYEE con asignaciones específicas (mensual, primera quincena)
  await prisma.bonus.create({
    data: {
      tenantId: tenant.id,
      name: "Bono de productividad",
      description: "Bono variable por desempeño",
      valueType: "PER_EMPLOYEE",
      amount: 0,
      assignmentType: "SPECIFIC",
      frequency: "MONTHLY",
      monthlyMode: "FIRST",
      active: true,
      assignments: {
        create: [
          { tenantId: tenant.id, employeeId: empCesar.id, amount: 80000, active: true },
          { tenantId: tenant.id, employeeId: empVanessa.id, amount: 60000, active: true },
        ],
      },
    },
  });

  console.log("➖ Creando descuentos de prueba...");
  // Descuento STANDARD para todos (quincenal)
  await prisma.discount.create({
    data: {
      tenantId: tenant.id,
      name: "Préstamo interno",
      description: "Cuota quincenal de préstamo",
      valueType: "STANDARD",
      amount: 30000,
      assignmentType: "ALL",
      frequency: "BIWEEKLY",
      active: true,
    },
  });
  // Descuento PER_EMPLOYEE específico (mensual, segunda quincena)
  await prisma.discount.create({
    data: {
      tenantId: tenant.id,
      name: "Uniforme",
      description: "Descuento por uniforme",
      valueType: "PER_EMPLOYEE",
      amount: 0,
      assignmentType: "SPECIFIC",
      frequency: "MONTHLY",
      monthlyMode: "SECOND",
      active: true,
      assignments: {
        create: [{ tenantId: tenant.id, employeeId: empCarlos.id, amount: 25000, active: true }],
      },
    },
  });

  console.log("💵 Creando ajustes de pago de prueba...");
  await prisma.payAdjustment.create({
    data: {
      tenantId: tenant.id,
      employeeId: empCesar.id,
      type: "BONUS",
      amount: 40000,
      description: "Bonificación extraordinaria",
      periodStart: period.from,
      periodEnd: period.to,
    },
  });
  await prisma.payAdjustment.create({
    data: {
      tenantId: tenant.id,
      employeeId: empAna.id,
      type: "DISCOUNT",
      amount: 15000,
      description: "Anticipo de quincena",
      periodStart: period.from,
      periodEnd: period.to,
    },
  });

  console.log("🛡️  Creando rol personalizado de prueba...");
  await prisma.customRole.create({
    data: {
      tenantId: tenant.id,
      name: "Supervisor de turno",
      slug: "supervisor-turno",
      description: "Puede registrar horas y ver reportes, sin gestión de personal",
      permissions: JSON.stringify([
        "time_entries:view",
        "time_entries:create",
        "time_entries:edit",
        "schedules:view",
        "tips:view",
        "payroll:view",
      ]),
      isSystem: false,
      active: true,
    },
  });

  console.log("🔑 Creando permiso individual de prueba (override)...");
  // A AdminValen se le concede explícitamente ver la auditoría (permiso extra)
  await prisma.userPermission.create({
    data: {
      tenantId: tenant.id,
      userId: userValen.id,
      permissionKey: "audit:view",
      granted: true,
    },
  });

  console.log("\n✅ Seed completado.");
  console.log("─────────────────────────────────────────────");
  console.log("   SadminJavier / Javier123  → PROPRIETARY");
  console.log("   SadminMajo   / Majo123    → SUPERADMIN");
  console.log("   AdminValen   / Valen123   → ADMIN");
  console.log("   CesarH       / CesarH123  → EMPLOYEE (inventoryAccess=true)");
  console.log("   Vanessa      / Vanessa123 → EMPLOYEE");
  console.log("─────────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
