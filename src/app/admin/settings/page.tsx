import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SettingsClient } from "@/components/admin/settings/SettingsClient";

export default async function SettingsPage() {
  const session = await auth();
  const tenant = await prisma.tenant.findUnique({
    where: { id: session!.user.tenantId },
  });

  if (!tenant) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Configuración</h1>
        <p className="text-sm text-[#7A6358] mt-1">Personaliza tu restaurante en Nómina Xpress</p>
      </div>
      <SettingsClient tenant={tenant} />
    </div>
  );
}
