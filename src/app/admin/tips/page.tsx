import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TipsClient } from "@/components/admin/tips/TipsClient";
import { Coins } from "lucide-react";

export default async function TipsPage() {
  const session = await auth();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.user.role)) {
    redirect("/login");
  }

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
      <TipsClient role={session.user.role} />
    </div>
  );
}
