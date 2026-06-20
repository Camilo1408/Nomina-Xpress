import { TipsClient } from "@/components/admin/tips/TipsClient";
import { Coins } from "lucide-react";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";

export default async function TipsPage() {
  const { permissions } = await requirePagePermission(PERMISSIONS.TIPS_VIEW);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#C1643F]/10 flex items-center justify-center">
          <Coins className="w-5 h-5 text-[#C1643F]" />
        </div>
        <div>
          <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Propinas</h1>
          <p className="text-sm text-[#7A6358] mt-0.5">
            Registro y distribución diaria de propinas por quincena
          </p>
        </div>
      </div>
      <TipsClient
        canCreate={permissions.has(PERMISSIONS.TIPS_CREATE)}
        canEdit={permissions.has(PERMISSIONS.TIPS_EDIT)}
        canDelete={permissions.has(PERMISSIONS.TIPS_DELETE)}
      />
    </div>
  );
}
