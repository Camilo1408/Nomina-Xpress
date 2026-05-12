import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function MyHorarioLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  // This section is only for ADMIN users linked to an employee record.
  // SUPERADMIN has no employee record and should not access this page.
  if (!session || session.user.role !== "ADMIN") {
    redirect("/admin/dashboard");
  }
  return <>{children}</>;
}
