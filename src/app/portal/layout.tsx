import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { PortalNav } from "@/components/portal/PortalNav";
import { getSessionPermissions, hasAdminAreaAccess } from "@/lib/get-permissions";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session || session.user.role !== "EMPLOYEE") redirect("/login");

  // Un empleado con permisos admin (rol personalizado o permisos individuales)
  // opera en el área admin: se envía allí (refleja los cambios de permisos al
  // refrescar, sin re-login).
  const permissions = await getSessionPermissions(session);
  if (hasAdminAreaAccess(permissions)) redirect("/admin/dashboard");

  const [tenant, employee] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.user.tenantId } }),
    session.user.employeeId
      ? prisma.employee.findUnique({ where: { id: session.user.employeeId } })
      : null,
  ]);

  const displayName = employee?.name ?? session.user.name ?? "Personal";

  return (
    <div className="min-h-screen bg-background">
      <PortalNav
        userName={displayName}
        logoUrl={tenant?.logoUrl}
        inventarioUrl={session.user.inventoryAccess
          ? process.env.NEXT_PUBLIC_INVENTARIO_APP_URL
          : undefined}
      />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </div>
  );
}
