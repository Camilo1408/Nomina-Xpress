import { RoleForm } from "@/components/admin/roles/RoleForm";
import { requirePagePermission } from "@/lib/require-permission";
import { PERMISSIONS } from "@/lib/permission-keys";
import { getDailyCategoriesForUI } from "@/lib/inventory-sync";

export default async function NewRolePage() {
  const { session } = await requirePagePermission(PERMISSIONS.ROLES_CREATE);
  const dailyCategories = await getDailyCategoriesForUI(session.user.tenantId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Nuevo rol</h1>
        <p className="text-sm text-[#7A6358] mt-1">
          Define el nombre, descripción y permisos del nuevo rol.
        </p>
      </div>
      <RoleForm dailyCategories={dailyCategories} />
    </div>
  );
}
