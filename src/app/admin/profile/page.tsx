import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ProfileClient } from "./ProfileClient";

export default async function AdminProfilePage() {
  const session = await auth();
  const role = session!.user.role;
  const userName = session!.user.name ?? "Usuario";

  const employee = session!.user.employeeId
    ? await prisma.employee.findUnique({
        where: { id: session!.user.employeeId },
        select: { name: true, documentId: true, phone: true, hourlyRateNormal: true, hourlyRateSpecial: true },
      })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Hola, {userName}</h1>
        <p className="text-sm text-[#7A6358] mt-1">
          {role === "SUPERADMIN" ? "Cambia tu usuario o contraseña" : "Cambia tu contraseña"}
        </p>
      </div>
      <ProfileClient role={role} employee={employee} />
    </div>
  );
}
