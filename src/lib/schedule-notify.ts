// A quién se le avisa de un horario, y cómo.
//
// Regla del propietario: reciben el aviso TODOS los empleados que figuran en el horario,
// sea con turno o con día de descanso, les haya cambiado algo o no. Quien no tiene ninguna
// celda asignada en ese horario no recibe nada.
//
// Un descanso es una fila de `ScheduleShift` (`restDay: true`), así que basta con mirar
// quién tiene filas: no hay que distinguir turno de descanso ni comparar con lo anterior.

import { prisma } from "@/lib/db";
import { sendPushNotification, type PushPayload } from "@/lib/push";

/** Empleados que figuran en el horario: con turno o con descanso. */
export function employeesInSchedule(shifts: Array<{ employeeId: string }>): string[] {
  return [...new Set(shifts.map((s) => s.employeeId))];
}

/**
 * Envía el aviso a los dispositivos de esos empleados. No lanza: un fallo del servicio de
 * notificaciones no debe tumbar la operación que lo originó. Devuelve cuántos se enviaron.
 */
export async function notifyScheduleEmployees(
  tenantId: string,
  employeeIds: string[],
  payload: PushPayload,
): Promise<number> {
  if (employeeIds.length === 0) return 0;

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { tenantId, user: { employeeId: { in: employeeIds }, active: true } },
    });
    if (subscriptions.length === 0) return 0;

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        sendPushNotification({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload),
      ),
    );

    // Las suscripciones que el servicio rechazó (caducadas) se retiran.
    const expired = subscriptions.filter((_, i) => {
      const r = results[i];
      return r.status === "fulfilled" && r.value === false;
    });
    if (expired.length > 0) {
      await prisma.pushSubscription.deleteMany({
        where: { tenantId, endpoint: { in: expired.map((s) => s.endpoint) } },
      });
    }
    return subscriptions.length - expired.length;
  } catch (err) {
    console.error("[horarios] no se pudo enviar el aviso:", err);
    return 0;
  }
}
