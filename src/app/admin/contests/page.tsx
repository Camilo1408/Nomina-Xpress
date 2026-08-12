import { ContestsClient } from "@/components/admin/contests/ContestsClient";
import { Trophy } from "lucide-react";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";

export default async function ContestsPage() {
  const { permissions } = await requirePagePermission(PERMISSIONS.CONTESTS_VIEW);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#C1643F]/10 flex items-center justify-center">
          <Trophy className="w-5 h-5 text-[#C1643F]" />
        </div>
        <div>
          <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Concursos e incentivos</h1>
          <p className="text-sm text-[#7A6358] mt-0.5">
            Premios financiados con un porcentaje adicional de las propinas del período
          </p>
        </div>
      </div>
      <ContestsClient
        canCreate={permissions.has(PERMISSIONS.CONTESTS_CREATE)}
        canEdit={permissions.has(PERMISSIONS.CONTESTS_EDIT)}
        canDelete={permissions.has(PERMISSIONS.CONTESTS_DELETE)}
        canAward={permissions.has(PERMISSIONS.CONTESTS_AWARD)}
        canPay={permissions.has(PERMISSIONS.CONTESTS_PAY)}
      />
    </div>
  );
}
