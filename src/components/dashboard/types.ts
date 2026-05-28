export type DailyRecord = {
  employeeId: string;
  name: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  late: boolean;
  excused?: boolean;
};

export type MonthlyCounter = {
  employeeId: string;
  name: string;
  lateCount: number;
  lastWarningDate: string | null;
  monthYear: string;
};

export type DashboardPayload = {
  date: string;
  records: DailyRecord[];
  monthly: MonthlyCounter[];
};