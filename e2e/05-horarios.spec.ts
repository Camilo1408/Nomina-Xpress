// Parrilla de horarios: cambiar la fecha de inicio no borra los turnos ya capturados ni
// abre un diálogo del navegador (los avisos del sistema son tarjetas propias).

import { expect, test } from "@playwright/test";
import { login, watchPage } from "./helpers";

test("cambiar la fecha de inicio mueve los turnos con la semana, sin diálogos y sin perder nada", async ({ page }) => {
  const dialogos: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogos.push(dialog.message());
    await dialog.dismiss();
  });
  const watch = watchPage(page);

  await login(page, "proprietario");
  await page.goto("/admin/schedules/new");

  const fecha = page.getByLabel("La semana empieza el");
  const inicio = await fecha.inputValue();
  const filas = page.locator("tbody tr");

  // Primer empleado: turno el primer día. Segundo empleado: descanso el último día.
  await filas.nth(0).getByTitle("Asignar turno").first().click();
  await filas.nth(0).locator('input[type="time"]').nth(0).fill("08:00");
  await filas.nth(0).locator('input[type="time"]').nth(1).fill("16:00");
  await filas.nth(1).getByTitle("Marcar como día de descanso").last().click();

  const estado = async () => ({
    horas: await page.locator('tbody input[type="time"]').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value)),
    // Columna (día de la semana) de cada celda con algo capturado.
    turnoEnColumna: await filas.nth(0).locator("td").evaluateAll((tds) => tds.findIndex((td) => td.querySelector('input[type="time"]'))),
    descansoEnColumna: await filas.nth(1).locator("td").evaluateAll((tds) => tds.findIndex((td) => td.querySelector('[title="Quitar"]'))),
  });
  const antes = await estado();
  expect(antes.horas).toEqual(["08:00", "16:00"]);

  // Siete semanas atrás: ninguna fecha de la semana nueva coincide con la anterior.
  const d = new Date(`${inicio}T12:00:00`);
  d.setDate(d.getDate() - 49);
  const nueva = d.toISOString().slice(0, 10);
  await fecha.fill(nueva);

  await expect(fecha).toHaveValue(nueva);
  await expect(page.getByText("Los turnos se movieron a la nueva semana")).toBeVisible();
  // Mismas horas, en el mismo día de la semana: nada se descartó.
  expect(await estado()).toEqual(antes);

  // Y de vuelta, tampoco.
  await fecha.fill(inicio);
  expect(await estado()).toEqual(antes);

  expect(dialogos, "diálogos nativos del navegador").toEqual([]);
  watch.expectClean();
});
