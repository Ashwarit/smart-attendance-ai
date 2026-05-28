import type { DashboardPayload } from "./types";

const today = new Date().toISOString().slice(0, 10);
const monthYear = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

export const mockPayload: DashboardPayload = {
  date: today,
  records: [
    // Late arrivals (after 10:00 AM cutoff)
    { employeeId: "EMP-001", name: "Jane Doe", date: today, checkIn: "11:15 AM", checkOut: "06:00 PM", late: true },
    { employeeId: "EMP-003", name: "Aisha Khan", date: today, checkIn: "11:32 AM", checkOut: "06:10 PM", late: true },
    { employeeId: "EMP-005", name: "Priya Patel", date: today, checkIn: "11:05 AM", checkOut: null, late: true },
    // On time
    { employeeId: "EMP-002", name: "John Smith", date: today, checkIn: "09:45 AM", checkOut: "05:30 PM", late: false },
    { employeeId: "EMP-004", name: "Marco Rossi", date: today, checkIn: "09:50 AM", checkOut: "07:00 PM", late: false },
    { employeeId: "EMP-006", name: "Liam O'Brien", date: today, checkIn: "09:30 AM", checkOut: "05:45 PM", late: false },
    { employeeId: "EMP-007", name: "Sofia Garcia", date: today, checkIn: "09:15 AM", checkOut: "06:30 PM", late: false },
    { employeeId: "EMP-010", name: "Raj Mehta", date: today, checkIn: "09:55 AM", checkOut: "06:00 PM", late: false },
    // Absent (no check-in)
    { employeeId: "EMP-008", name: "David Chen", date: today, checkIn: null, checkOut: null, late: false },
    { employeeId: "EMP-009", name: "Emma Wilson", date: today, checkIn: null, checkOut: null, late: false },
  ],
  monthly: [
    // Critical (3+ strikes)
    { employeeId: "EMP-001", name: "Jane Doe", lateCount: 3, lastWarningDate: today, monthYear },
    // At Risk (2 strikes)
    { employeeId: "EMP-003", name: "Aisha Khan", lateCount: 2, lastWarningDate: today, monthYear },
    { employeeId: "EMP-005", name: "Priya Patel", lateCount: 2, lastWarningDate: today, monthYear },
    // Safe (0–1 strikes)
    { employeeId: "EMP-002", name: "John Smith", lateCount: 1, lastWarningDate: null, monthYear },
    { employeeId: "EMP-004", name: "Marco Rossi", lateCount: 0, lastWarningDate: null, monthYear },
    { employeeId: "EMP-006", name: "Liam O'Brien", lateCount: 0, lastWarningDate: null, monthYear },
    { employeeId: "EMP-007", name: "Sofia Garcia", lateCount: 1, lastWarningDate: null, monthYear },
    { employeeId: "EMP-008", name: "David Chen", lateCount: 0, lastWarningDate: null, monthYear },
    { employeeId: "EMP-009", name: "Emma Wilson", lateCount: 0, lastWarningDate: null, monthYear },
    { employeeId: "EMP-010", name: "Raj Mehta", lateCount: 0, lastWarningDate: null, monthYear },
  ],
};

/**
 * Fixed weekly chart data — realistic, consistent numbers.
 * Total employees = 10 per day, so onTime + late + absent = 10.
 */
export const weeklyChartData = [
  { day: "Mon", onTime: 7, late: 2, absent: 1 },
  { day: "Tue", onTime: 8, late: 1, absent: 1 },
  { day: "Wed", onTime: 6, late: 3, absent: 1 },
  { day: "Thu", onTime: 7, late: 1, absent: 2 },
  { day: "Fri", onTime: 5, late: 3, absent: 2 },
];