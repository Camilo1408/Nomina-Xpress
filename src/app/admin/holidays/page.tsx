import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";
import { listNationalHolidays } from "@/lib/holidays";
import { HolidaysManager } from "@/components/admin/holidays/HolidaysManager";

export default async function HolidaysPage() {
  const { session, permissions } = await requirePagePermission(PERMISSIONS.HOLIDAYS_VIEW);

  const holidays = await prisma.holiday.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: [{ month: "asc" }, { day: "asc" }],
    select: { id: true, name: true, month: true, day: true, year: true },
  });

  // Festivos nacionales del año actual y el siguiente (para el visor de solo lectura).
  const currentYear = new Date().getFullYear();
  const national = [currentYear, currentYear + 1].map((year) => ({
    year,
    holidays: listNationalHolidays(year),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Festivos</h1>
        <p className="text-sm text-[#7A6358] mt-1">
          Gestiona los festivos que el sistema tiene en cuenta al calcular la nómina y el pago de
          turnos especiales.
        </p>
      </div>

      <HolidaysManager
        initialHolidays={holidays}
        national={national}
        canCreate={permissions.has(PERMISSIONS.HOLIDAYS_CREATE)}
        canEdit={permissions.has(PERMISSIONS.HOLIDAYS_EDIT)}
        canDelete={permissions.has(PERMISSIONS.HOLIDAYS_DELETE)}
      />
    </div>
  );
}
