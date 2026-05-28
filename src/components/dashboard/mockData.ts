import type { DashboardPayload } from "./types";

const today = new Date().toISOString().slice(0, 10);
const monthYear = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

export const mockPayload: DashboardPayload = {
  date: today,
  records: [
    { employeeId: "EMP-001", name: "Jane Doe", date: today, checkIn: "11:15 AM", checkOut: "06:00 PM", late: true },
    { employeeId: "EMP-002", name: "John Smith", date: today, checkIn: "09:45 AM", checkOut: "05:30 PM", late: false },
    { employeeId: "EMP-003", name: "Aisha Khan", date: today, checkIn: "11:32 AM", checkOut: "06:10 PM", late: true },
    { employeeId: "EMP-004", name: "Marco Rossi", date: today, checkIn: "10:50 AM", checkOut: "07:00 PM", late: false },
    { employeeId: "EMP-005", name: "Priya Patel", date: today, checkIn: "11:05 AM", checkOut: null, late: true },
    { employeeId: "EMP-006", name: "Liam O'Brien", date: today, checkIn: "09:30 AM", checkOut: "05:45 PM", late: false },
    { employeeId: "EMP-007", name: "Sofia Garcia", date: today, checkIn: "10:15 AM", checkOut: "06:30 PM", late: false },
  ],
  monthly: [
    { employeeId: "EMP-001", name: "Jane Doe", lateCount: 3, lastWarningDate: today, monthYear },
    { employeeId: "EMP-003", name: "Aisha Khan", lateCount: 2, lastWarningDate: today, monthYear },
    { employeeId: "EMP-005", name: "Priya Patel", lateCount: 2, lastWarningDate: today, monthYear },
    { employeeId: "EMP-002", name: "John Smith", lateCount: 1, lastWarningDate: null, monthYear },
    { employeeId: "EMP-004", name: "Marco Rossi", lateCount: 0, lastWarningDate: null, monthYear },
    { employeeId: "EMP-006", name: "Liam O'Brien", lateCount: 0, lastWarningDate: null, monthYear },
    { employeeId: "EMP-007", name: "Sofia Garcia", lateCount: 1, lastWarningDate: null, monthYear },
  ],
};