# Módulo de concursos e incentivos — Diseño

**Fecha:** 2026-08-12
**Rama:** `feat/concursos`
**Estado:** aprobado, pendiente de plan de implementación

Concursos internos en los que uno o varios empleados obtienen un bono por cumplir
una meta. El bono no lo asume la empresa: se financia descontando un porcentaje
adicional del fondo de propinas del período del concurso.

---

## 1. Hallazgos del sistema actual

Verificado sobre el código, no supuesto.

### Propinas

`src/lib/tips.ts` — el fondo **no es por período: es por día**. `TipEntry` es único
por `[tenantId, date]`.

```
menaje    = round(totalAmount × MENAJE_PERCENT)   // MENAJE_PERCENT = 0.1, constante hardcodeada
netAmount = totalAmount − menaje
```

`netAmount` se reparte el mismo día proporcional a `horas × tipPercent/100`, y se
persiste en filas `TipDistribution`. No existe tabla de configuración: el 10 % es
una constante del código.

Las distribuciones se **recalculan retroactivamente** en dos casos ya existentes:

- al mutar un `TimeEntry` → `recalculateTipForDate()` (`src/lib/recalculate-tips.ts`)
- al crear/editar/borrar un `Holiday` → `recalculateSpecialForDates()`

### Nómina y reportes

`src/app/api/admin/reports/payroll/route.ts:66`

```
finalPay = clampFinalPay(payroll.netPay, totalBonuses, totalDiscounts)
```

Las propinas **ya están excluidas** de `finalPay` y se muestran como línea
informativa en pantalla, PDF (`src/lib/pdf/payroll-template.tsx:164`) y Excel. Ese
es el patrón exacto a replicar para el bono de concurso.

`Bonus` y `Discount` son **stateless**: no persisten aplicaciones, se recalculan por
quincena a partir de la configuración vigente. Un bono de concurso **no puede** ser
stateless — tiene saldos, pagos parciales y prevención de doble pago — por eso lleva
modelos propios con prefijo `Contest*`.

### Tres contradicciones con el brief original

1. **No existe ningún "cierre de quincena".** Búsqueda de `cierre|closed|locked|PayrollPeriod`
   sobre `src/`: sin resultados. Los reportes se calculan al vuelo sobre datos vivos
   y las propinas se recalculan retroactivamente. El concepto de "período cerrado"
   hay que inventarlo.
2. **Migraciones desincronizadas.** `prisma/migrations/` termina en
   `20260619010000_add_roles_permissions`, pero el schema ya tiene `Bonus`,
   `Discount`, `Holiday` e `InventoryCategory`. El `dev.db` local se construyó con
   `prisma db push` y su tabla `_prisma_migrations` está **vacía**. Producción se
   migró con scripts ad-hoc (`prisma/turso-migrate-bonos-descuentos.mjs`).
3. **No hay datos de ventas en este sistema.** Las ventas de cervezas/vinos viven en
   `inventario-restaurante`, en otra base de datos. La meta no se puede evaluar
   automáticamente sin integración cross-app.

---

## 2. Decisiones tomadas

| # | Decisión | Elegido |
|---|---|---|
| 1 | Días ya registrados al activar un concurso | **Recalcular** los `TipEntry` del rango que ya existan |
| 2 | Mecanismo de "período cerrado" | **Congelado solo del concurso**, sin cierre global |
| 3 | Meta y ganador | **Registro manual** de resultados; el sistema resuelve por criterio |
| 4 | Reserva de un concurso cancelado | **Devolver a los empleados vía recálculo** |
| 5 | Barrera para la devolución | **Permitir siempre, con confirmación explícita** |
| 6 | Ganadores por ítem | **Configurable**: `GANADOR_UNICO` o `REPARTIDO` |
| 7 | Tope de descuento | **30 % total** (10 % menaje + hasta 20 % concursos), configurable |
| 8 | Quincena de pago | **Auto-calculada y editable**, pago explícito e idempotente |
| 9 | Rama | `feat/concursos` |
| 10 | Ítem desierto | **Mismo trato que cancelación**: devolución vía recálculo |
| 11 | Permisos | `contests:*` — SUPERADMIN y PROPRIETARY; ADMIN solo lectura |

Supuestos adicionales aprobados:

- Los ítems **heredan el rango de fechas del concurso**; no tienen período propio.
- Si el ganador queda inactivo, el bono **sigue pendiente y visible**; solo se anula a mano.
- El bono aparece también en el **portal del empleado**, igual que las propinas.

---

## 3. Invariante financiera

Todo el módulo se apoya en una sola ecuación, **por día**, que debe cuadrar al peso:

```
totalAmount = menaje + Σ(reservas de concurso) + netAmount
```

Hoy es `totalAmount = menaje + netAmount`. El módulo solo inserta un término en el medio.

### Cálculo para un día `D` con `TipEntry`

```
menaje        = round(totalAmount × 10%)                    // sin cambios
reserva_I     = round(totalAmount × pct_I / 100)            // por cada ítem I aplicable a D
contestTotal  = Σ reserva_I
netAmount     = totalAmount − menaje − contestTotal         // por RESTA, nunca por porcentaje
```

Las `TipDistribution` se calculan sobre ese `netAmount` menor con la fórmula actual
sin modificar.

**Los tres porcentajes se aplican sobre el bruto del día.** 10 % + 2 % + 1 % = 13 %
del fondo original, como en el ejemplo del brief.

**Redondeo.** Cada reserva se redondea de forma independiente con `Math.round`, y
`netAmount` sale por resta. Así la suma de las partes es siempre exactamente
`totalAmount`: no se pierde ni se inventa un peso, sin importar cómo caiga el
redondeo. Consecuencia deliberada: la reserva total de un ítem sobre un período es
`Σ round(bruto_día × pct)`, que puede diferir en unos pocos pesos de
`round(Σbruto × pct)`. **La cifra válida es la suma de las reservas diarias**, porque
es la que efectivamente se descontó a los empleados.

### Topes

```ts
export const TIP_MENAJE_PERCENT = 10;          // espejo de MENAJE_PERCENT, en puntos porcentuales
export const TIP_CONTEST_MAX_PERCENT = 20;     // máximo acumulado de concursos en un mismo día
export const TIP_DEDUCTION_MAX_PERCENT = 30;   // menaje + concursos
```

Validación al crear, editar o activar: para **cada día del rango**, la suma de los
porcentajes de ítems activos de todos los concursos no puede superar
`TIP_CONTEST_MAX_PERCENT`. Guarda dura adicional en el cálculo: si `netAmount`
resultara negativo, la operación se rechaza con error explícito (nunca se guarda un
neto negativo).

---

## 4. Modelo de datos

Seis tablas nuevas y una columna añadida. **Ninguna tabla existente se altera
estructuralmente y ningún dato existente se reescribe.**

### 4.1 Columna añadida

```prisma
model TipEntry {
  // ... campos existentes sin cambios ...
  // Suma de las reservas de concurso RESERVADAS de este día.
  // Invariante: totalAmount = menaje + contestReserved + netAmount
  contestReserved Float @default(0)

  contestReserves ContestTipReserve[]
}
```

El `@default(0)` es deliberado: todas las filas históricas quedan en 0 y su
`netAmount` sigue siendo exactamente `totalAmount − menaje`. La migración no
recalcula nada.

### 4.2 `Contest`

```prisma
model Contest {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name        String
  description String?
  // Rango del concurso, inclusive, formato YYYY-MM-DD (igual que TimeEntry.date)
  startDate   String
  endDate     String
  // BORRADOR | PROGRAMADO | ACTIVO | FINALIZADO | PAGADO | CANCELADO
  status      String   @default("BORRADOR")
  // UNICO = todo en la quincena siguiente | DIVIDIDO = mitad en cada una de las dos siguientes
  payoutMode  String   @default("UNICO")

  activatedAt   DateTime?
  activatedById String?
  finalizedAt   DateTime?
  finalizedById String?
  cancelledAt   DateTime?
  cancelledById String?
  cancelReason  String?

  createdById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  items ContestItem[]

  @@index([tenantId])
  @@index([tenantId, status])
  @@index([tenantId, startDate, endDate])
}
```

### 4.3 `ContestItem`

```prisma
model ContestItem {
  id          String  @id @default(cuid())
  tenantId    String
  tenant      Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contestId   String
  contest     Contest @relation(fields: [contestId], references: [id], onDelete: Cascade)
  name        String
  description String?
  // Meta a cumplir: valor numérico + unidad legible ("unidades", "COP", "botellas")
  goalValue   Float
  goalUnit    String  @default("unidades")
  // MAYOR_VALOR | MENOR_VALOR | PRIMERO_EN_ALCANZAR | SELECCION_MANUAL
  criteria    String  @default("MAYOR_VALOR")
  // Porcentaje del bruto diario de propinas destinado a este ítem. > 0 y <= 20
  percent     Float
  // GANADOR_UNICO | REPARTIDO
  winnerMode  String  @default("GANADOR_UNICO")
  // PENDIENTE | ADJUDICADO | DESIERTO
  outcome     String  @default("PENDIENTE")

  resolvedAt   DateTime?
  resolvedById String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  results  ContestItemResult[]
  reserves ContestTipReserve[]
  bonuses  ContestBonus[]

  @@unique([contestId, name])
  @@index([tenantId])
  @@index([contestId])
}
```

### 4.4 `ContestItemResult`

Resultado registrado por participante. Necesaria para evaluar los criterios (un
ganador no se puede determinar sin conocer los resultados de todos) y para la
trazabilidad del §9 del brief.

```prisma
model ContestItemResult {
  id            String      @id @default(cuid())
  tenantId      String
  tenant        Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contestItemId String
  contestItem   ContestItem @relation(fields: [contestItemId], references: [id], onDelete: Cascade)
  employeeId    String
  employee      Employee    @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  value         Float
  // Momento en que alcanzó la meta. Solo lo usa el criterio PRIMERO_EN_ALCANZAR.
  achievedAt    DateTime?
  notes         String?

  recordedById String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([contestItemId, employeeId])
  @@index([tenantId])
  @@index([contestItemId])
}
```

### 4.5 `ContestTipReserve`

**El registro de trazabilidad del dinero.** Una fila por `(día × ítem)`.

```prisma
model ContestTipReserve {
  id            String      @id @default(cuid())
  tenantId      String
  tenant        Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contestId     String
  contestItemId String
  contestItem   ContestItem @relation(fields: [contestItemId], references: [id], onDelete: Cascade)
  tipEntryId    String
  tipEntry      TipEntry    @relation(fields: [tipEntryId], references: [id], onDelete: Cascade)
  // Día de la propina, duplicado para poder consultar sin join
  date          String
  // SNAPSHOTS congelados en el momento de reservar. No son referencias:
  // si el ítem cambia su porcentaje mañana, esto no se mueve.
  tipTotalAmount Float
  percent        Float
  amount         Float
  // RESERVADA | DEVUELTA
  status         String   @default("RESERVADA")
  refundedAt     DateTime?
  refundReason   String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tipEntryId, contestItemId])
  @@index([tenantId])
  @@index([contestItemId, status])
  @@index([tenantId, date])
}
```

`onDelete: Cascade` desde `TipEntry`: si se borra el registro de propinas del día, sus
reservas dejan de existir porque el dinero del que salían ya no existe. El detalle de
lo borrado queda en el `AuditLog` de la eliminación.

### 4.6 `ContestBonus`

```prisma
model ContestBonus {
  id            String      @id @default(cuid())
  tenantId      String
  tenant        Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contestId     String
  contestItemId String
  contestItem   ContestItem @relation(fields: [contestItemId], references: [id], onDelete: Cascade)
  employeeId    String
  employee      Employee    @relation(fields: [employeeId], references: [id])

  // SNAPSHOTS históricos — el reporte de una liquidación nunca depende
  // de la configuración vigente del concurso.
  contestName   String
  itemName      String
  goalSnapshot  String   // "240 unidades"
  criteriaSnapshot String
  percentSnapshot  Float
  // Base de propinas usada: Σ tipTotalAmount de los días con reserva del ítem
  tipBaseSnapshot  Float
  // Σ amount de las reservas RESERVADAS del ítem
  reservedAmount   Float
  resultValue      Float
  periodStart      String
  periodEnd        String

  // Parte de reservedAmount que corresponde a este ganador (1.0 si GANADOR_UNICO)
  shareRatio  Float @default(1)
  totalAmount Float
  paidAmount  Float @default(0)

  // PENDIENTE | PARCIAL | PAGADO | ANULADO
  status     String   @default("PENDIENTE")
  voidedAt   DateTime?
  voidReason String?

  assignedAt   DateTime @default(now())
  assignedById String?
  updatedAt    DateTime @updatedAt

  payments ContestBonusPayment[]

  @@unique([contestItemId, employeeId])
  @@index([tenantId])
  @@index([tenantId, status])
  @@index([tenantId, employeeId])
}
```

`pendingAmount` no se persiste: es siempre `totalAmount − paidAmount`. Un solo dato
como fuente de verdad evita que dos columnas se desincronicen.

### 4.7 `ContestBonusPayment`

```prisma
model ContestBonusPayment {
  id             String       @id @default(cuid())
  tenantId       String
  tenant         Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contestBonusId String
  contestBonus   ContestBonus @relation(fields: [contestBonusId], references: [id], onDelete: Cascade)
  employeeId     String
  // 1 o 2
  installment    Int
  // Quincena destino
  periodStart    String
  periodEnd      String
  amount         Float
  // PENDIENTE | PAGADO | ANULADO
  status         String   @default("PENDIENTE")
  paidAt         DateTime?
  paidById       String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([contestBonusId, installment])
  @@index([tenantId])
  @@index([tenantId, employeeId, periodStart, periodEnd])
  @@index([tenantId, status])
}
```

El `@@unique([contestBonusId, installment])` es la primera barrera contra el doble
pago: no pueden existir dos cuotas 1 del mismo bono.

### 4.8 Relaciones añadidas a modelos existentes

```prisma
model Tenant {
  contests            Contest[]
  contestItems        ContestItem[]
  contestItemResults  ContestItemResult[]
  contestTipReserves  ContestTipReserve[]
  contestBonuses      ContestBonus[]
  contestBonusPayments ContestBonusPayment[]
}

model Employee {
  contestItemResults ContestItemResult[]
  contestBonuses     ContestBonus[]
}
```

Nota sobre campos denormalizados: `ContestBonusPayment.employeeId`,
`ContestTipReserve.date` y `ContestTipReserve.contestId` se guardan como columnas
planas **sin relación Prisma**. Son copias deliberadas que permiten indexar y filtrar
sin `join` — en particular, la query por período del reporte de nómina (§10.1) y la
consulta de reservas por día. Su valor se deriva del padre en el momento de crear la
fila y nunca cambia después.

---

## 5. Estados y transiciones

### Concurso

```
BORRADOR ──publicar──▶ PROGRAMADO ──activar──▶ ACTIVO ──finalizar──▶ FINALIZADO ──▶ PAGADO
    │                      │                      │                      │
    └──────────────────────┴──────cancelar────────┴──────────────────────┘
                                                                          ▼
                                                                      CANCELADO
```

**Solo `ACTIVO` genera reservas.** Ni `PROGRAMADO` ni `FINALIZADO` las generan. Esto
elimina la necesidad de un cron o job programado y hace el comportamiento
completamente predecible: nada cambia sin una acción explícita de un usuario.

| Transición | Efecto |
|---|---|
| `BORRADOR → PROGRAMADO` | Valida fechas, ítems y topes. Sin efecto sobre propinas. |
| `PROGRAMADO → ACTIVO` | **Recálculo retroactivo**: crea las reservas de todos los `TipEntry` ya existentes en el rango y recalcula sus distribuciones. Decisión 1. |
| `ACTIVO → FINALIZADO` | **Congela**. A partir de aquí, un `TipEntry` nuevo o editado dentro del rango **no crea reservas nuevas**; la UI lo advierte. Habilita registrar resultados y adjudicar. |
| `FINALIZADO → PAGADO` | Automática cuando todas las cuotas de todos los bonos del concurso están `PAGADO` o `ANULADO`. |
| `* → CANCELADO` | **Devolución**: todas las reservas `RESERVADA` pasan a `DEVUELTA`, y los `TipEntry` afectados se recalculan devolviendo el dinero al reparto. Requiere `cancelReason` y confirmación explícita. |

Finalización anticipada (antes de `endDate`) permitida con confirmación: congela con
la base acumulada hasta ese día. Los días restantes del rango ya no reservan.

### Ítem

`PENDIENTE → ADJUDICADO` (adjudicar) o `PENDIENTE → DESIERTO` (declarar desierto).

`DESIERTO` dispara la misma devolución que la cancelación, pero **acotada a las
reservas de ese ítem**: los demás ítems del concurso no se tocan.

### Bono y cuota

- Bono: `PENDIENTE → PARCIAL → PAGADO`, o `ANULADO` desde cualquiera.
- Cuota: `PENDIENTE → PAGADO`, o `ANULADO`.
- `PARCIAL` cuando `0 < paidAmount < totalAmount`.

---

## 6. Lógica de cálculo

### 6.1 Aplicabilidad de un ítem a un día

Un ítem `I` aplica al día `D` si y solo si:

```
contest.status === "ACTIVO"
  && contest.startDate <= D <= contest.endDate
  && contest.tenantId === tenantId
```

Comparación lexicográfica de strings `YYYY-MM-DD`, igual que el resto del sistema.
Sin objetos `Date`, sin zonas horarias, sin `toISOString`.

### 6.2 Punto de entrada único

`calculateTips()` recibe un parámetro nuevo **opcional**:

```ts
export function calculateTips(
  totalAmount: number,
  employees: TipEmployeeInput[],
  deductions: ContestDeduction[] = []      // ← nuevo, por defecto vacío
): TipCalculation
```

Con `deductions === []` el resultado es **idéntico al actual**, byte a byte. Los tests
existentes de propinas pasan sin modificarse.

Los tres únicos sitios que escriben propinas llaman a
`resolveContestDeductionsForDate(tenantId, date)`:

- `POST /api/admin/tips`
- `PUT /api/admin/tips/[id]`
- `recalculateTipForDate()`

Como el recálculo por festivos y por registro de horas ya pasa por
`recalculateTipForDate()`, **arrastra las reservas correctamente sin código
adicional**. Un solo punto de entrada, sin lógica duplicada.

### 6.3 Reparto entre varios ganadores (`REPARTIDO`, N ganadores)

```
base    = reservedAmount del ítem
cuota   = Math.floor(base / N)
share_i = cuota                              para i = 2..N
share_1 = base − (N − 1) × cuota             el residuo va al primero
```

Suma exacta = `base`. Cero pesos perdidos.

### 6.4 Quincena destino de las cuotas

Reutiliza `getPeriodForDate()` de `src/lib/tips.ts`, ya usado por el resto del sistema:

```
endPeriod = getPeriodForDate(contest.endDate)
next1     = getPeriodForDate(diaSiguiente(endPeriod.periodEnd))
next2     = getPeriodForDate(diaSiguiente(next1.periodEnd))
```

- `payoutMode = UNICO` → una cuota en `next1` por `totalAmount`.
- `payoutMode = DIVIDIDO` → cuota 1 en `next1` = `round(total / 2)`;
  cuota 2 en `next2` = `total − cuota1`. La suma es exacta.

El admin puede editar la quincena destino de una cuota mientras esté `PENDIENTE`.

### 6.5 Resolución del ganador

Solo califican los empleados cuyo resultado **cumple la meta**:

- `MAYOR_VALOR`, `PRIMERO_EN_ALCANZAR`, `SELECCION_MANUAL` → `value >= goalValue`
- `MENOR_VALOR` → `value <= goalValue`

Entre los que califican:

| Criterio | Ganador |
|---|---|
| `MAYOR_VALOR` | mayor `value` |
| `MENOR_VALOR` | menor `value` |
| `PRIMERO_EN_ALCANZAR` | menor `achievedAt` (los nulos no califican) |
| `SELECCION_MANUAL` | el que elija el admin, de entre los que califican |

Si nadie califica → el ítem solo puede declararse `DESIERTO`. Si hay empate en
`GANADOR_UNICO`, el sistema **no elige**: exige `SELECCION_MANUAL` sobre los empatados
o cambiar el ítem a `REPARTIDO`.

---

## 7. Casos de borde y su resolución

| Caso | Resolución |
|---|---|
| Concurso empieza o termina a mitad de quincena | Se resuelve solo: la reserva se aplica exactamente a los días del rango. La base es `Σ` de esos días, no de la quincena. Queda registrada en `tipBaseSnapshot`. |
| Concursos simultáneos / solapados | Los porcentajes se acumulan **por día**. La validación recorre día a día el rango y suma los ítems activos de todos los concursos. |
| Superar el tope | Se rechaza al crear/editar/activar, devolviendo la lista de días en conflicto y el porcentaje que se alcanzaría. |
| Cambiar el `%` de un ítem `ACTIVO` | Permitido, con confirmación: recalcula los días ya reservados con el porcentaje nuevo. Las reservas anteriores se sobrescriben (mismo `@@unique`), y el cambio queda en `AuditLog.before/after`. |
| Cambiar fechas de un concurso `ACTIVO` | Permitido con confirmación: días que salen del rango → reserva `DEVUELTA` + recálculo; días que entran → reserva nueva + recálculo. |
| Editar la **configuración** de un concurso `FINALIZADO`, `PAGADO` o `CANCELADO` | **Prohibido.** HTTP 409. Configuración = fechas, porcentajes, ítems, modalidad de pago. En `FINALIZADO` sí se permite registrar resultados, adjudicar, declarar desierto, pagar cuotas y anular bonos: son las acciones propias de ese estado y ninguna toca las reservas ya congeladas. |
| `TipEntry` nuevo en el rango de un concurso `FINALIZADO` | Se crea sin reserva de ese concurso. La UI de propinas lo advierte. |
| Borrar un `TipEntry` con reservas | Cascade borra las reservas. El `AuditLog` guarda el detalle. Si el concurso está `FINALIZADO`, el `reservedAmount` del bono ya generado **no cambia** (es un snapshot). |
| Día sin `TipEntry` | No hay nada que reservar. La base del premio simplemente no incluye ese día. |
| `netAmount` quedaría negativo | Operación rechazada con error explícito. Nunca se persiste un neto negativo. |
| Ganador queda inactivo | El bono sigue `PENDIENTE` y visible. Solo se anula a mano. |
| Empleado sin horas el día de una reserva | Irrelevante: la reserva sale del bruto del día, antes del reparto. |
| Doble adjudicación del mismo ítem | `@@unique([contestItemId, employeeId])` + validación de `outcome === "PENDIENTE"`. |
| Doble pago de una cuota | Ver §8.3 — `updateMany` condicional. |
| Anular un bono ya pagado parcialmente | Permitido: las cuotas `PENDIENTE` pasan a `ANULADO`; las `PAGADO` se conservan. El bono queda `ANULADO` con `paidAmount` intacto. |
| Cancelar un concurso cuya quincena ya se pagó | **Permitido con confirmación explícita** (decisión 5). Ver §12 Riesgos. |

---

## 8. API

Todas las rutas: `auth()` + `sessionCan()` + validación Zod + `logAudit()`, siguiendo
el patrón de bonos y descuentos. Todas filtran por `tenantId` de la sesión.

### 8.1 Concursos

```
GET    /api/admin/contests                                  lista con filtros
POST   /api/admin/contests                                  crear (con ítems)
GET    /api/admin/contests/[id]                             detalle + ítems + reservas + bonos
PUT    /api/admin/contests/[id]                             editar
DELETE /api/admin/contests/[id]                             eliminar (solo BORRADOR)
GET    /api/admin/contests/[id]/impact?action=...           preview de impacto
POST   /api/admin/contests/[id]/activate                    activar + recálculo retroactivo
POST   /api/admin/contests/[id]/finalize                    congelar
POST   /api/admin/contests/[id]/cancel                      cancelar + devolución
```

`GET /impact` es la pieza que hace segura la confirmación: devuelve, **sin escribir
nada**, la lista de días afectados con `{ date, totalAmount, netAmountActual,
netAmountNuevo, delta }` y el total. Es lo que la UI muestra antes de pedir
confirmación en activar, cancelar y cambiar `%`/fechas.

### 8.2 Ítems y resultados

```
POST   /api/admin/contests/[id]/items                       crear ítem
PUT    /api/admin/contests/[id]/items/[itemId]              editar ítem
DELETE /api/admin/contests/[id]/items/[itemId]              eliminar (solo si no tiene reservas)
PUT    /api/admin/contests/[id]/items/[itemId]/results      registrar resultados (bulk upsert)
POST   /api/admin/contests/[id]/items/[itemId]/award        adjudicar → genera bono + cuotas
POST   /api/admin/contests/[id]/items/[itemId]/void         declarar desierto → devolución
```

### 8.3 Bonos y pagos

```
GET    /api/admin/contest-bonuses                                  filtros: estado, período, empleado
POST   /api/admin/contest-bonuses/[id]/void                        anular bono
PUT    /api/admin/contest-bonuses/[id]/payments/[pid]              editar quincena destino (solo PENDIENTE)
POST   /api/admin/contest-bonuses/[id]/payments/[pid]/pay          marcar pagada
GET    /api/employee/contest-bonuses                               portal del empleado
```

**Pago idempotente.** Dentro de una transacción:

```ts
const { count } = await tx.contestBonusPayment.updateMany({
  where: { id: pid, tenantId, status: "PENDIENTE" },
  data:  { status: "PAGADO", paidAt: new Date(), paidById },
});
if (count === 0) return 409;   // ya estaba pagada o anulada
await tx.contestBonus.update({
  where: { id },
  data: { paidAmount: { increment: amount }, status: nuevoEstado },
});
```

La condición `status: "PENDIENTE"` está en el `where`, no en un `if` previo. Dos
peticiones simultáneas: solo una obtiene `count === 1`. No depende de la UI ni de
un chequeo previo.

---

## 9. Permisos

Nuevas claves en `src/lib/permission-keys.ts`:

```ts
CONTESTS_VIEW:   "contests:view",
CONTESTS_CREATE: "contests:create",
CONTESTS_EDIT:   "contests:edit",
CONTESTS_DELETE: "contests:delete",
CONTESTS_AWARD:  "contests:award",   // registrar resultados y adjudicar ganadores
CONTESTS_PAY:    "contests:pay",     // marcar cuotas como pagadas
```

- **SUPERADMIN**: las seis.
- **ADMIN**: solo `contests:view`.
- **PROPRIETARY**: todas, por acceso total dinámico.
- **EMPLOYEE**: ninguna; ve sus propios bonos por la ruta del portal.

Además: grupo `{ module: "contests", label: "Concursos e incentivos" }` en
`PERMISSION_GROUPS` y las seis etiquetas en `PERMISSION_LABELS`, para que aparezcan
en la matriz de roles personalizados.

Auditoría: nuevo módulo `CONTESTS` en el catálogo de `AuditLog.module` y sus
etiquetas en `src/lib/audit-labels.ts`.

---

## 10. Integración con nómina y reportes

### 10.1 Carga de datos

`fetchPayrollPeriodData()` gana una **4.ª query** al `Promise.all` existente:

```ts
prisma.contestBonusPayment.findMany({
  where: {
    tenantId,
    employeeId: { in: employeeIds },
    periodStart: { gte: from },
    periodEnd:   { lte: to },
    status:      { not: "ANULADO" },
  },
  include: { contestBonus: { select: { contestName: true, itemName: true, totalAmount: true } } },
})
```

El filtro por período replica el de `payAdjustments`, ya presente en la función.

### 10.2 Campos nuevos en el reporte

`PayrollWithExtras` (`src/lib/report-types.ts`):

```ts
contestBonuses: ContestBonusApplied[];   // { contestName, itemName, installment, totalInstallments, amount, status }
totalContestBonus: number;
totalInformativeReceived: number;        // finalPay + totalTips + totalContestBonus
```

### 10.3 La regla crítica

**`finalPay` no se toca.** Es literalmente la misma línea:

```ts
finalPay: clampFinalPay(payroll.netPay, empBonuses.totalBonuses, empDiscounts.totalDiscounts)
```

El bono de concurso se pinta **justo debajo** de "Propinas acumuladas del período
(informativo)", con el mismo estilo, en las tres salidas:

- pantalla — `src/app/admin/reports/`
- PDF — `src/lib/pdf/payroll-template.tsx`, sección por empleado y totales
- Excel — `src/lib/excel/payroll-template.ts`

Y la nota al pie pasa a decir que **ni las propinas ni los bonos de concurso** se
suman al total final.

Orden de presentación, según el §8 del brief:

```
Salario / Horas / Recargos / Otros conceptos / Deducciones
─────────────────────────────────────────────
TOTAL FINAL A PAGAR          ← finalPay, sin propinas ni bonos
─────────────────────────────────────────────
Propinas del período (informativo)
Bono por concurso (informativo)
Total informativo recibido   ← totalInformativeReceived
```

### 10.4 Portal del empleado

`src/app/portal/report/page.tsx` muestra sus cuotas de la quincena con el mismo
tratamiento informativo. Ruta de datos: `GET /api/employee/contest-bonuses`.

### 10.5 Módulo de propinas

`TipsClient.tsx` y `TipEntryModal.tsx` muestran el desglose real del día:

```
Total          $500.000
Menaje 10%     −$50.000
Cervezas 2%    −$10.000
Vinos 1%       −$5.000
Neto a repartir $435.000
```

El texto fijo "Se descontará un 10% de provisión de menaje" del modal pasa a ser
dinámico según los concursos activos del día.

---

## 11. Archivos

### Nuevos

| Archivo | Contenido |
|---|---|
| `src/lib/contests.ts` | Lógica **pura**, sin DB: tipos, estados, topes, reparto entre ganadores, cálculo de cuotas, resolución de ganador. Testeable en aislamiento. |
| `src/lib/contest-service.ts` | Acceso a DB: `resolveContestDeductionsForDate`, `validateContestPercentages`, `applyContestToRange`, `refundReserves`, `computeImpactPreview`. |
| `src/lib/contest-bonus-service.ts` | Generación de bonos y cuotas, pago idempotente, carga por período para reportes. |
| `src/app/admin/contests/page.tsx` | Página del módulo. |
| `src/components/admin/contests/*` | `ContestsClient`, `ContestModal`, `ContestItemsEditor`, `ContestResultsModal`, `AwardModal`, `ImpactConfirmDialog`, `ContestBonusesTable`. |
| `src/app/api/admin/contests/**` | Rutas del §8.1 y §8.2. |
| `src/app/api/admin/contest-bonuses/**` | Rutas del §8.3. |
| `src/app/api/employee/contest-bonuses/route.ts` | Portal. |
| `prisma/turso-migrate-concursos.mjs` | Migración idempotente. |
| `src/lib/__tests__/contests.test.ts` | Unitarias de lógica pura. |
| `src/lib/__tests__/contest-reserves.test.ts` | Invariante, redondeo, topes, solapamiento. |
| `src/lib/__tests__/contest-bonus.test.ts` | Cuotas, reparto, idempotencia. |

### Modificados

| Archivo | Cambio |
|---|---|
| `prisma/schema.prisma` | 6 modelos, 1 columna, relaciones en `Tenant`/`Employee`/`TipEntry`. |
| `src/lib/tips.ts` | Parámetro opcional `deductions`, constantes de tope. |
| `src/lib/recalculate-tips.ts` | Resolver deducciones antes de calcular. |
| `src/app/api/admin/tips/route.ts` | Idem en `POST`, persistir reservas. |
| `src/app/api/admin/tips/[id]/route.ts` | Idem en `PUT`. |
| `src/lib/payroll-report.ts` | 4.ª query. |
| `src/lib/report-types.ts` | Campos nuevos. |
| `src/app/api/admin/reports/payroll/route.ts` | Ensamblado. |
| `src/app/api/admin/reports/payroll/export/pdf/route.ts` | Ensamblado. |
| `src/app/api/admin/reports/payroll/export/excel/route.ts` | Ensamblado. |
| `src/lib/pdf/payroll-template.tsx` | Línea informativa + totales + nota al pie. |
| `src/lib/excel/payroll-template.ts` | Idem. |
| `src/lib/permission-keys.ts` | 6 claves, grupo, etiquetas, `BASE_ROLE_PERMISSIONS`. |
| `src/lib/audit-labels.ts` | Módulo `CONTESTS`. |
| `src/components/shared/AdminSidebar.tsx` | Entrada de menú. |
| `src/app/portal/report/page.tsx` | Bono informativo. |
| `src/components/admin/tips/TipsClient.tsx` | Desglose de reservas. |
| `src/components/admin/tips/TipEntryModal.tsx` | Aviso dinámico. |
| `scripts/e2e-full-test.mjs` | 27 casos del §11 del brief. |
| `CLAUDE.md` | Documentar el módulo y la invariante. |

---

## 12. Migración y rollback

### Estrategia

`prisma migrate deploy` **no es viable**: el historial de migraciones está
desincronizado desde junio y `_prisma_migrations` está vacía en local. Se sigue el
patrón real del repo (`turso-migrate-bonos-descuentos.mjs`).

`prisma/turso-migrate-concursos.mjs`, idempotente y ejecutable con la misma orden en
local y en Turso:

```bash
node prisma/turso-migrate-concursos.mjs
```

### Qué hace exactamente

**Crea 6 tablas** con `CREATE TABLE IF NOT EXISTS`:
`Contest`, `ContestItem`, `ContestItemResult`, `ContestTipReserve`, `ContestBonus`,
`ContestBonusPayment`.

**Añade 1 columna**, comprobando antes con `PRAGMA table_info(TipEntry)`:

```sql
ALTER TABLE TipEntry ADD COLUMN contestReserved REAL NOT NULL DEFAULT 0;
```

**Crea los índices** declarados en el §4 con `CREATE INDEX IF NOT EXISTS` y
`CREATE UNIQUE INDEX IF NOT EXISTS`.

### Qué NO hace

- No modifica ninguna tabla existente más allá de esa columna con default.
- No borra ni reescribe un solo registro.
- No recalcula propinas históricas: todas quedan con `contestReserved = 0` y su
  `netAmount` intacto.

### Información existente afectada

**Ninguna.** Toda fila de `TipEntry` anterior a la migración mantiene
`totalAmount = menaje + netAmount`, que sigue siendo consistente con la invariante
nueva porque `contestReserved = 0`.

### Rollback

```sql
DROP TABLE IF EXISTS ContestBonusPayment;
DROP TABLE IF EXISTS ContestBonus;
DROP TABLE IF EXISTS ContestTipReserve;
DROP TABLE IF EXISTS ContestItemResult;
DROP TABLE IF EXISTS ContestItem;
DROP TABLE IF EXISTS Contest;
```

La columna `TipEntry.contestReserved` **se deja**: SQLite no soporta `DROP COLUMN`
sin recrear la tabla, y una columna con default 0 que nadie lee es inofensiva. Se
entrega también un `prisma/turso-rollback-concursos.mjs`.

El rollback se entrega como script probado en local, en el mismo commit que la
migración.

---

## 13. Plan de pruebas

### 13.1 Unitarias (vitest) — lógica pura

`contests.test.ts`

- Aplicabilidad de un ítem a un día según estado y rango, incluidos los bordes exactos.
- Tope: acepta 20 %, rechaza 20,01 %; menaje + concursos ≤ 30 %.
- Reparto `REPARTIDO`: N = 1, 2, 3, 7 y montos que no dividen exacto → la suma de
  partes es siempre igual a la base.
- Cuotas: `UNICO` y `DIVIDIDO`; con monto impar la suma de las dos cuotas es exacta.
- Quincena destino desde fin de concurso el día 1, 15, 16, 28, 29, 30, 31, cruce de
  año y febrero bisiesto.
- Resolución de ganador por los cuatro criterios, incluidos empates y "nadie califica".

`contest-reserves.test.ts`

- **Invariante**: para 1 000 combinaciones de bruto y porcentajes,
  `total === menaje + Σreservas + neto`, siempre.
- `deductions = []` produce **exactamente** el resultado actual de `calculateTips`.
- Redondeo: `Σ round(día × pct) ≠ round(Σdías × pct)` está contemplado y la cifra
  válida es la primera.
- `netAmount` negativo → error, no persistencia.
- Solapamiento de tres concursos en un mismo día.

`contest-bonus.test.ts`

- Transiciones de estado válidas e inválidas.
- `paidAmount` y saldo tras cada cuota.
- Anulación con cuotas pagadas y pendientes mezcladas.

### 13.2 Integración (vitest con Prisma mockeado)

Se sigue el patrón ya establecido en `src/lib/__tests__/payroll-report.test.ts`:
`vi.mock("@/lib/db")` con los métodos de Prisma necesarios. El proyecto no tiene
infraestructura de base de datos de prueba, y montarla queda fuera del alcance. La
cobertura contra una base real la aporta el E2E del §13.3, que corre contra `dev.db`.

- Activar un concurso recalcula los `TipEntry` ya existentes del rango y crea sus reservas.
- Cancelar devuelve el dinero: reservas `DEVUELTA`, `contestReserved` a 0,
  distribuciones restauradas al valor previo peso a peso.
- Finalizar congela: un `TipEntry` creado después en el rango no genera reserva.
- Editar el `%` de un ítem activo sobrescribe las reservas y recalcula.
- Pago concurrente de la misma cuota: solo uno gana, el otro recibe 409.
- Borrar un `TipEntry` con reservas no rompe el bono ya generado.

### 13.3 E2E — los 27 casos del brief

Extensión de `scripts/e2e-full-test.mjs`, que ya ejercita todos los módulos vía HTTP
con sesión real. Cada punto del §11 del brief es un caso numerado:

1–4 creación de concurso, ítems, porcentajes y activación · 5 registro de meta ·
6–9 cálculo de propinas con menaje, porcentajes acumulados y fondo disponible ·
10 reserva por ítem · 11–13 finalización, ganador y bono · 14 pago único ·
15 pago dividido · 16 saldos · 17 doble pago rechazado · 18 bono en el reporte ·
19 **`finalPay` idéntico con y sin bono** · 20 propinas siguen correctas ·
21 concursos simultáneos · 22 fechas superpuestas · 23 cancelación ·
24 modificación antes y después de iniciar · 25 concurso finalizado (congelado) ·
26 validaciones y errores · 27 regresión de los módulos existentes.

### 13.4 Regresión

- Los 11 tests actuales de `src/lib/__tests__/` pasan **sin modificarse**.
- `npm run build`, `npm run lint`, TypeScript strict sin `any`.
- **Prueba de oro**: se genera el reporte de un período **antes** de la migración, se
  guarda el JSON, se aplica la migración y el módulo, y se regenera. Sin concursos
  creados, ambos JSON deben ser **idénticos**. Es la verificación más fuerte de que
  nada existente cambió.

---

## 14. Riesgos identificados

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| 1 | **Cancelar un concurso cuya quincena ya se pagó altera propinas ya entregadas.** Decisión 5 lo permite conscientemente. | Alta | Diálogo de confirmación que lista día por día el impacto exacto vía `GET /impact`; reservas marcadas `DEVUELTA` en vez de borradas; `AuditLog` completo con `before`/`after`. La trazabilidad se conserva íntegra; el histórico vivo sí se mueve. |
| 2 | El recálculo retroactivo al activar reduce propinas ya mostradas al empleado. | Media | Mismo diálogo de impacto antes de activar. Recomendación operativa: activar el concurso antes de que empiece su rango. |
| 3 | El recálculo toca muchos días si el rango es largo. | Baja | Todo en una transacción; el rango máximo razonable es un mes (~31 `TipEntry`). |
| 4 | Deriva de redondeo entre la suma diaria y el porcentaje del total. | Baja | Documentada y testeada: la suma de reservas diarias es la cifra válida. `tipBaseSnapshot` y `reservedAmount` la congelan. |
| 5 | Un concurso activo y olvidado sigue descontando. | Media | Aviso en el dashboard de concursos activos y de concursos vencidos sin finalizar. |
| 6 | Divergencia entre `schema.prisma` y las migraciones ya existente en el repo. | Media | El módulo no la agrava: la migración es un script independiente e idempotente que no depende del historial. |
| 7 | Un `TipEntry` borrado deja el bono con una base que ya no existe. | Baja | Los snapshots del bono son inmutables; el `AuditLog` registra la eliminación. |

---

## 15. Procedimiento de despliegue

Orden obligatorio del §13 del brief. **Los pasos 8 en adelante requieren
autorización explícita del propietario.**

1. Desarrollo local en `feat/concursos`
2. Migración local: `node prisma/turso-migrate-concursos.mjs` sobre `dev.db`
3. Pruebas locales: `npm run test`, `npm run lint`, `npm run build`
4. Pruebas E2E: `node scripts/e2e-full-test.mjs` con el dev server arriba
5. Pruebas de regresión, incluida la prueba de oro del §13.4
6. Presentación de resultados
7. **Autorización explícita** ← barrera dura
8. Backup de producción: workflow `backup-db.yml` (cifrado GPG), verificando el artefacto
9. Migración de producción: `node prisma/turso-migrate-concursos.mjs` con las variables de Turso
10. Despliegue (Vercel)
11. Verificación post-despliegue: nómina, propinas, concursos, bonos, reportes y logs

Si falla cualquier paso de 8 en adelante: **detener**, no seguir modificando, evaluar
rollback (`turso-rollback-concursos.mjs`) y restauración del backup.

No se ejecuta ninguna acción sobre producción sin autorización explícita. Un mensaje
ambiguo no cuenta como autorización.
