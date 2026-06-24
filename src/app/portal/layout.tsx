import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { PortalNav } from "@/components/portal/PortalNav";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session || session.user.role !== "EMPLOYEE") redirect("/login");

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
      />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </div>
  );
}
