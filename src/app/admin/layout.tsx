import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/shared/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar
        tenantName={tenant?.name ?? "Restaurante"}
        logoUrl={tenant?.logoUrl}
      />
      <main className="flex-1 overflow-y-auto bg-background min-w-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8 pt-[72px] lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}
