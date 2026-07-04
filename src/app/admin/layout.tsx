import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/shared/AdminSidebar";
import { getSessionPermissions, hasAdminAreaAccess } from "@/lib/get-permissions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const [tenant, permissions] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.user.tenantId } }),
    getSessionPermissions(session),
  ]);

  // Gate por permisos EFECTIVOS (BD fresca), no por rol base: así un EMPLOYEE con
  // rol personalizado o permisos individuales admin entra al área, y los cambios
  // de permisos se reflejan al refrescar sin necesidad de re-loguear.
  if (!hasAdminAreaAccess(permissions)) redirect("/portal/report");

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar
        tenantName={tenant?.name ?? "Restaurante"}
        logoUrl={tenant?.logoUrl}
        role={session.user.role}
        userName={session.user.name ?? "Usuario"}
        permissions={[...permissions]}
        hasEmployee={!!session.user.employeeId}
      />
      <main className="flex-1 overflow-y-auto bg-background min-w-0">
        {/*
          Padding-top separado de pb para evitar conflictos con sm:py-8
          y garantizar que el contenido quede siempre debajo de la topbar
          fija de mobile/tablet (h-14 = 56px) hasta el breakpoint lg.
        */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-4 sm:pb-8 pt-20 lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}
