import { prisma } from "@/lib/db";
import { SettingsClient } from "@/components/admin/settings/SettingsClient";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";

export default async function SettingsPage() {
  const { session, permissions } = await requirePagePermission(PERMISSIONS.SETTINGS_VIEW);
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
  });

  if (!tenant) return null;

  const canEdit = permissions.has(PERMISSIONS.SETTINGS_EDIT);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Configuración</h1>
        <p className="text-sm text-[#7A6358] mt-1">Personaliza tu restaurante en Nómina Xpress</p>
      </div>
      <SettingsClient tenant={tenant} canEdit={canEdit} />
    </div>
  );
}
