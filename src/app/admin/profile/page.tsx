import { auth } from "@/lib/auth";
import { ProfileClient } from "./ProfileClient";

export default async function AdminProfilePage() {
  const session = await auth();
  const role = session!.user.role;
  const inventarioUrl = process.env.NEXT_PUBLIC_INVENTARIO_APP_URL;
  const hasInventoryAccess =
    role === "SUPERADMIN" || role === "ADMIN" || session!.user.inventoryAccess;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#2C1F15]">Mi Perfil</h1>
        <p className="text-sm text-[#7A6358] mt-1">
          {role === "SUPERADMIN" ? "Cambia tu usuario o contraseña" : "Cambia tu contraseña"}
        </p>
      </div>
      <ProfileClient
        role={role}
        inventarioUrl={hasInventoryAccess ? inventarioUrl : undefined}
      />
    </div>
  );
}
