// Tipos compartidos por los componentes del módulo de concursos.

export interface ItemReserve {
  reservedAmount: number;
  tipBase: number;
  days: number;
}

export interface ContestItem {
  id: string;
  name: string;
  description: string | null;
  goalValue: number;
  goalUnit: string;
  criteria: string;
  percent: number;
  winnerMode: string;
  outcome: string;
  reserve?: ItemReserve;
  _count?: { results: number; bonuses: number };
}

export interface Contest {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  status: string;
  payoutMode: string;
  cancelReason: string | null;
  items: ContestItem[];
}

export interface ImpactRow {
  date: string;
  totalAmount: number;
  netBefore: number;
  netAfter: number;
  delta: number;
}

export interface ImpactPreview {
  rows: ImpactRow[];
  totalDelta: number;
  affectedDays: number;
  daysWithoutTips: number;
  error?: string;
}

export interface ContestResult {
  id: string;
  employeeId: string;
  value: number;
  achievedAt: string | null;
  notes: string | null;
  employee: { id: string; name: string; active: boolean };
}

export interface BonusPayment {
  id: string;
  installment: number;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: string;
  paidAt: string | null;
}

export interface ContestBonus {
  id: string;
  employeeId: string;
  contestName: string;
  itemName: string;
  goalSnapshot: string;
  percentSnapshot: number;
  tipBaseSnapshot: number;
  reservedAmount: number;
  resultValue: number;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  paidAmount: number;
  pendingAmount?: number;
  status: string;
  employee: { id: string; name: string; active?: boolean };
  payments: BonusPayment[];
}

export interface Employee {
  id: string;
  name: string;
  active: boolean;
}
