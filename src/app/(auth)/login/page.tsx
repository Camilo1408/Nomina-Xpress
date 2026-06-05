import { prisma } from "@/lib/db";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  let tenant: { name: string; logoUrl: string | null } | null = null;

  try {
    tenant = await prisma.tenant.findFirst({
      select: { name: true, logoUrl: true },
    });
  } catch {
    // BD no disponible aún — muestra el formulario con valores por defecto
  }

  return (
    <LoginForm
      tenantName={tenant?.name ?? "Cucina dei Fiori"}
      logoUrl={tenant?.logoUrl ?? null}
    />
  );
}
