import { prisma } from "@/lib/db";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const tenant = await prisma.tenant.findFirst({
    select: { name: true, logoUrl: true },
  });

  return (
    <LoginForm
      tenantName={tenant?.name ?? "Nómina Xpress"}
      logoUrl={tenant?.logoUrl ?? null}
    />
  );
}
