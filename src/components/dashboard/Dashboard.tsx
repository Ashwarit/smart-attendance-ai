import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Settings2,
  ShieldCheck,
  LayoutDashboard,
} from "lucide-react";
import { mockPayload } from "./mockData";
import type { DailyRecord, DashboardPayload, MonthlyCounter } from "./types";

/* ========================================
   CONSTANTS
   ======================================== */

const WEBHOOK_KEY = "hr_attendance_webhook_url";
const EXCUSE_KEY = "hr_attendance_excuse_url";
const REFRESH_MS = 60_000;

type Status = "Safe" | "At Risk" | "Critical";

/**
 * Three-strike policy:
 * 0–1 late arrivals → Safe
 * 2 late arrivals   → At Risk
 * 3+ late arrivals  → Critical
 */
function statusFor(count: number): Status {
  if (count >= 3) return "Critical";
  if (count === 2) return "At Risk";
  return "Safe";
}

const STATUS_STYLES: Record<Status, { pill: string; dot: string }> = {
  Safe: {
    pill: "bg-emerald-50 text-emerald-700 border border-emerald-200/60",
    dot: "bg-emerald-500",
  },
  "At Risk": {
    pill: "bg-amber-50 text-amber-700 border border-amber-200/60",
    dot: "bg-amber-500",
  },
  Critical: {
    pill: "bg-red-50 text-red-700 border border-red-200/60",
    dot: "bg-red-500",
  },
};

/* ========================================
   DATA FETCH
   ======================================== */

async function fetchPayload(url: string): Promise<DashboardPayload> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Webhook ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) {
    return { date: new Date().toISOString().slice(0, 10), records: data, monthly: [] };
  }
  const p = data as Record<string, unknown>;
  const date = (p.date as string) ?? new Date().toISOString().slice(0, 10);

  // Native shape
  if (Array.isArray(p.records) || Array.isArray(p.monthly)) {
    return {
      date,
      records: (p.records as DailyRecord[]) ?? [],
      monthly: (p.monthly as MonthlyCounter[]) ?? [],
    };
  }

  // Adapter for { summary, atRisk[], lateDetail[] } shape
  const lateDetail = (p.lateDetail as Array<Record<string, unknown>>) ?? [];
  const atRisk = (p.atRisk as Array<Record<string, unknown>>) ?? [];
  const monthYear = date.slice(0, 7);

  const records: DailyRecord[] = lateDetail.map((r) => ({
    employeeId: String(r.employeeId ?? r.id ?? r.name ?? ""),
    name: String(r.name ?? r.employeeId ?? "Unknown"),
    date: String(r.date ?? date),
    checkIn: (r.checkIn as string) ?? null,
    checkOut: (r.checkOut as string) ?? null,
    late: r.late !== false,
    excused: Boolean(r.excused),
  }));

  const monthly: MonthlyCounter[] = atRisk.map((m) => ({
    employeeId: String(m.employeeId ?? m.id ?? m.name ?? ""),
    name: String(m.name ?? m.employeeId ?? "Unknown"),
    lateCount: Number(m.lateCount ?? m.count ?? m.strikes ?? 0),
    lastWarningDate: (m.lastWarningDate as string) ?? null,
    monthYear: String(m.monthYear ?? monthYear),
  }));

  return { date, records, monthly };
}

const readLS = (k: string) =>
  typeof window === "undefined" ? "" : window.localStorage.getItem(k) ?? "";

/* ========================================
   AVATAR
   ======================================== */

function Avatar({ name, variant = "blue" }: { name: string; variant?: "blue" | "red" }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const colors = {
    blue: "bg-indigo-50 text-indigo-600",
    red: "bg-red-50 text-red-600",
  };

  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${colors[variant]}`}>
      {initials}
    </div>
  );
}

/* ========================================
   MAIN DASHBOARD
   ======================================== */

export function Dashboard() {
  const [webhookUrl, setWebhookUrl] = useState<string>(() => readLS(WEBHOOK_KEY));
  const [excuseUrl, setExcuseUrl] = useState<string>(() => readLS(EXCUSE_KEY));
  const [tempWebhookUrl, setTempWebhookUrl] = useState<string>(webhookUrl);
  const [tempExcuseUrl, setTempExcuseUrl] = useState<string>(excuseUrl);
  const [payload, setPayload] = useState<DashboardPayload>(mockPayload);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [usingMock, setUsingMock] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [excusing, setExcusing] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Sync temporary inputs when the settings dialog opens
  useEffect(() => {
    if (settingsOpen) {
      setTempWebhookUrl(webhookUrl);
      setTempExcuseUrl(excuseUrl);
    }
  }, [settingsOpen, webhookUrl, excuseUrl]);

  /* Auto-refresh every 60 seconds (Requirement B1.4) */
  const load = useCallback(async () => {
    if (!webhookUrl) {
      setPayload(mockPayload);
      setUsingMock(true);
      setError(null);
      setLastUpdated(new Date());
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPayload(webhookUrl);
      setPayload(data);
      setUsingMock(false);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
      // Fallback to mock payload if no realtime data was ever loaded in the current state
      setUsingMock((prev) => prev || payload === mockPayload || !payload.records || payload.records.length === 0);
    } finally {
      setLoading(false);
    }
  }, [webhookUrl, payload]);

  useEffect(() => {
    load();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(load, REFRESH_MS);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [load]);

  /* ============================
     DERIVED METRICS
     ============================
     Mock data: 10 employees, 8 present (3 late, 5 on-time), 2 absent
     
     KPI (Requirement B1.1):
     - lateToday: present employees marked late & not excused
     - onTimeToday: present employees not late (or excused)
     - lateToday + onTimeToday = present.length (always holds)
     
     At-Risk list (Requirement B1.2):
     - Monthly records with lateCount >= 2, sorted highest first
     
     Status badges (Requirement B1.3):
     - Safe: 0–1 strikes → green
     - At Risk: 2 strikes → amber
     - Critical: 3+ strikes → red
  */

  const todayRecords = payload.records ?? [];
  const present = todayRecords.filter((r) => r.checkIn !== null);
  const lateToday = present.filter((r) => r.late && !r.excused).length;
  const onTimeToday = present.filter((r) => !r.late || r.excused).length;

  /* B1.2: Ranked list — employees with 2+ strikes, sorted by lateCount descending */
  const atRiskOrCritical: MonthlyCounter[] = useMemo(() => {
    return [...(payload.monthly ?? [])]
      .filter((m) => m.lateCount >= 2)
      .sort((a, b) => b.lateCount - a.lateCount);
  }, [payload.monthly]);

  /* Late records for the excuse panel */
  const lateRecordsToday = useMemo(() => todayRecords.filter((r) => r.late), [todayRecords]);
  const unexcusedLateCount = lateRecordsToday.filter((r) => !r.excused).length;

  const handleExcuse = async (record: DailyRecord) => {
    setExcusing(record.employeeId);
    setPayload((p) => ({
      ...p,
      records: p.records.map((r) =>
        r.employeeId === record.employeeId ? { ...r, excused: true } : r,
      ),
      monthly: p.monthly.map((m) =>
        m.employeeId === record.employeeId
          ? { ...m, lateCount: Math.max(0, m.lateCount - 1) }
          : m,
      ),
    }));
    try {
      if (excuseUrl) {
        await fetch(excuseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId: record.employeeId, date: record.date, action: "excuse" }),
        });
        toast.success(`${record.name} marked excused`);
      } else {
        toast.message("Excused locally", { description: "Set an excuse webhook in Settings to persist." });
      }
    } catch (e) {
      toast.error("Failed to sync excuse", { description: e instanceof Error ? e.message : "Network error" });
    } finally {
      setExcusing(null);
    }
  };

  const saveSettings = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(WEBHOOK_KEY, tempWebhookUrl);
      window.localStorage.setItem(EXCUSE_KEY, tempExcuseUrl);
    }
    setSettingsOpen(false);
    if (webhookUrl === tempWebhookUrl && excuseUrl === tempExcuseUrl) {
      load(); // Force manual reload since state didn't change
    } else {
      setWebhookUrl(tempWebhookUrl);
      setExcuseUrl(tempExcuseUrl);
    }
  };

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* ============================
          STICKY TOP BAR
          ============================ */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[960px] items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600">
              <LayoutDashboard className="h-4 w-4 text-white" />
            </div>
            <div className="leading-tight min-w-0">
              <h1 className="text-[14px] sm:text-[15px] font-semibold text-slate-900 truncate max-w-[160px] xs:max-w-[240px] sm:max-w-none">
                HR Attendance Intelligence
              </h1>
              <p className="text-[11px] text-slate-500 leading-none mt-0.5 truncate">
                {payload.date}
                {mounted && (
                  <> &middot; {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>
                )}
                {usingMock && (
                  <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-600 border border-amber-200/50">
                    Sample
                  </span>
                )}
                {!usingMock && !error && (
                  <span className="ml-1.5 inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-600 border border-emerald-200/50">
                    <span className="h-1 w-1 rounded-full bg-emerald-500" />
                    Live
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={load}
              disabled={loading}
              className="h-8 px-3 text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="ml-1.5 hidden text-[13px] sm:inline">Refresh</span>
            </Button>
            <div className="h-4 w-px bg-slate-200" />
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-3 text-slate-500 hover:text-slate-900 hover:bg-slate-100">
                  <Settings2 className="h-3.5 w-3.5" />
                  <span className="ml-1.5 hidden text-[13px] sm:inline">Settings</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[calc(100%-2rem)] max-w-[440px] rounded-lg">
                <DialogHeader>
                  <DialogTitle className="text-base">Webhook Configuration</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="webhook" className="text-[13px] font-medium text-slate-700">GET — Attendance Data</Label>
                    <Input id="webhook" placeholder="https://your-n8n/webhook/attendance" value={tempWebhookUrl} onChange={(e) => setTempWebhookUrl(e.target.value)} className="h-9 font-mono text-[13px]" />
                    <p className="text-[11px] text-slate-400">Returns {"{ date, records[], monthly[] }"} — CORS must be enabled.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="excuse" className="text-[13px] font-medium text-slate-700">POST — Excuse Override (optional)</Label>
                    <Input id="excuse" placeholder="https://your-n8n/webhook/excuse" value={tempExcuseUrl} onChange={(e) => setTempExcuseUrl(e.target.value)} className="h-9 font-mono text-[13px]" />
                  </div>
                </div>
                <DialogFooter className="pt-2">
                  <Button onClick={saveSettings} className="h-9 bg-indigo-600 text-[13px] hover:bg-indigo-700">Save &amp; Refresh</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      {/* ============================
          MAIN CONTENT
          ============================ */}
      <main className="mx-auto max-w-[960px] px-4 sm:px-6 py-6 space-y-6">
        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            <AlertCircle className="mt-1 h-4 w-4 shrink-0 text-red-400" />
            <div className="space-y-1 min-w-0">
              <span className="font-semibold block">Connection Error</span>
              <p className="text-[12px] text-red-600/95 leading-normal">
                {error.includes("Failed to fetch") ? (
                  <>
                    Could not reach your n8n webhook. This is typically caused by:
                    <span className="block mt-1.5 pl-3 border-l-2 border-red-200 space-y-1">
                      <span className="block">&bull; <strong className="font-medium text-red-800">CORS Block</strong>: Add the <code className="bg-red-100 px-1 py-px rounded font-mono text-[11px] text-red-800">Response Headers</code> option in your n8n Webhook node with <code className="bg-red-100 px-1 py-px rounded font-mono text-[11px] text-red-800">Access-Control-Allow-Origin: *</code>.</span>
                      <span className="block">&bull; <strong className="font-medium text-red-800">Offline</strong>: Ensure n8n is running locally or online.</span>
                      <span className="block">&bull; <strong className="font-medium text-red-800">Test URL</strong>: Make sure you're using the n8n <strong className="font-medium text-red-800">Production URL</strong> and the workflow is turned <strong className="font-medium text-red-800">Active</strong>.</span>
                    </span>
                  </>
                ) : (
                  error
                )}
              </p>
            </div>
          </div>
        )}

        {/* ============================
            B1.1 — Summary Card: Late vs On-Time
            ============================ */}
        <Card className="border-slate-200 bg-white shadow-none">
          <CardContent className="px-4 sm:px-6 py-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-4">
              Today's Attendance Summary
            </p>
            <div className="grid grid-cols-2 gap-3 sm:gap-6">
              {/* On Time */}
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  {loading && usingMock ? (
                    <Skeleton className="h-9 w-14" />
                  ) : (
                    <p className="text-[32px] font-bold leading-none tabular-nums text-slate-900">
                      {onTimeToday}
                    </p>
                  )}
                  <p className="text-[13px] text-slate-500 mt-1">On Time</p>
                </div>
              </div>

              {/* Late */}
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-50">
                  <Clock className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  {loading && usingMock ? (
                    <Skeleton className="h-9 w-14" />
                  ) : (
                    <p className="text-[32px] font-bold leading-none tabular-nums text-slate-900">
                      {lateToday}
                    </p>
                  )}
                  <p className="text-[13px] text-slate-500 mt-1">Late Arrivals</p>
                </div>
              </div>
            </div>

            {/* Ratio bar */}
            <div className="mt-5">
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                {(onTimeToday + lateToday) > 0 && (
                  <>
                    <div
                      className="bg-emerald-500 transition-all duration-300"
                      style={{ width: `${(onTimeToday / (onTimeToday + lateToday)) * 100}%` }}
                    />
                    <div
                      className="bg-red-400 transition-all duration-300"
                      style={{ width: `${(lateToday / (onTimeToday + lateToday)) * 100}%` }}
                    />
                  </>
                )}
              </div>
              <div className="flex justify-between mt-1.5 text-[11px] text-slate-400">
                <span>{onTimeToday + lateToday > 0 ? Math.round((onTimeToday / (onTimeToday + lateToday)) * 100) : 0}% on time</span>
                <span>{present.length} of {todayRecords.length} checked in</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ============================
            B1.2 + B1.3 — Ranked At-Risk List with Status Badges
            Employees with 2+ strikes this month, sorted by lateCount desc.
            Color-coded: Safe (green), At Risk (amber), Critical (red).
            ============================ */}
        <Card className="border-slate-200 bg-white shadow-none">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 sm:px-6 py-4">
            <div>
              <h2 className="text-[14px] font-semibold text-slate-900">
                At-Risk Employees This Month
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Three-strike policy &middot; Ranked by late arrival count
              </p>
            </div>
            <span className="flex h-6 items-center rounded-md bg-slate-100 px-2.5 font-mono text-[11px] font-medium text-slate-500">
              {atRiskOrCritical.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            {atRiskOrCritical.length === 0 ? (
              <div className="flex flex-col items-center gap-2.5 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                  <ShieldCheck className="h-6 w-6 text-emerald-500" />
                </div>
                <p className="text-[14px] font-medium text-slate-700">All clear this month</p>
                <p className="text-[12px] text-slate-400 max-w-[240px]">
                  No employees have reached 2 or more late arrivals.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-100 hover:bg-transparent">
                    <TableHead className="h-10 pl-4 sm:pl-6 text-[11px] font-medium uppercase tracking-wider text-slate-400 w-10">
                      #
                    </TableHead>
                    <TableHead className="h-10 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                      Employee
                    </TableHead>
                    <TableHead className="h-10 text-center text-[11px] font-medium uppercase tracking-wider text-slate-400">
                      Late Count
                    </TableHead>
                    <TableHead className="h-10 hidden sm:table-cell text-[11px] font-medium uppercase tracking-wider text-slate-400">
                      Last Warning
                    </TableHead>
                    <TableHead className="h-10 pr-4 sm:pr-6 text-right text-[11px] font-medium uppercase tracking-wider text-slate-400">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {atRiskOrCritical.map((m, idx) => {
                    const s = statusFor(m.lateCount);
                    const st = STATUS_STYLES[s];
                    return (
                      <TableRow
                        key={m.employeeId}
                        className="border-b border-slate-50 transition-row hover:bg-slate-50/60"
                      >
                        {/* Rank */}
                        <TableCell className="py-3 pl-4 sm:pl-6 text-[13px] font-medium text-slate-400 tabular-nums">
                          {idx + 1}
                        </TableCell>

                        {/* Employee */}
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={m.name} variant={s === "Critical" ? "red" : "blue"} />
                            <div>
                              <p className="text-[13px] font-medium text-slate-800 leading-tight">{m.name}</p>
                              <p className="text-[11px] text-slate-400 leading-tight">{m.employeeId}</p>
                            </div>
                          </div>
                        </TableCell>

                        {/* Late Count */}
                        <TableCell className="py-3 text-center">
                          <span className="font-mono text-[14px] tabular-nums">
                            <span className={m.lateCount >= 3 ? "font-bold text-red-600" : "font-semibold text-amber-600"}>
                              {m.lateCount}
                            </span>
                            <span className="text-slate-300 font-normal"> / 3</span>
                          </span>
                        </TableCell>

                        {/* Last Warning */}
                        <TableCell className="py-3 hidden sm:table-cell text-[13px] text-slate-500">
                          {m.lastWarningDate ?? "—"}
                        </TableCell>

                        {/* B1.3 — Status Badge */}
                        <TableCell className="py-3 pr-4 sm:pr-6 text-right">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${st.pill}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                            {s}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>

        {/* ============================
            TODAY'S LATE — Excuse Panel
            ============================ */}
        <Card className="border-slate-200 bg-white shadow-none">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 sm:px-6 py-4">
            <div>
              <h2 className="text-[14px] font-semibold text-slate-900">Today's Late Arrivals</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Excuse to remove from monthly strike count</p>
            </div>
            {unexcusedLateCount > 0 && (
              <span className="flex h-6 items-center rounded-md bg-red-50 px-2.5 font-mono text-[11px] font-medium text-red-500 border border-red-100">
                {unexcusedLateCount}
              </span>
            )}
          </div>

          <div className="px-4 sm:px-6 py-4">
            {lateRecordsToday.length === 0 ? (
              <div className="flex flex-col items-center gap-2.5 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
                <p className="text-[14px] font-medium text-slate-700">No late arrivals today</p>
                <p className="text-[12px] text-slate-400">Everyone checked in on time.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {lateRecordsToday.map((r) => (
                  <div
                    key={r.employeeId}
                    className="flex items-center justify-between gap-4 rounded-lg border border-slate-200/80 px-4 py-3 transition-row hover:bg-slate-50/60"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={r.name} variant="red" />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-slate-800">{r.name}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                          {r.employeeId}
                          <span className="xs:hidden"> · {r.checkIn ?? "—"}</span>
                          <span className="hidden xs:inline"> · In {r.checkIn ?? "—"} · Out {r.checkOut ?? "—"}</span>
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {r.excused ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Excused
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={excusing === r.employeeId}
                          onClick={() => handleExcuse(r)}
                          className="h-7 px-3 border-slate-200 text-[12px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        >
                          {excusing === r.employeeId ? "Saving…" : "Excuse"}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* ============================
            FOOTER
            ============================ */}
        <footer className="flex flex-col items-start justify-between gap-2 border-t border-slate-200 pt-4 text-[11px] text-slate-400 sm:flex-row sm:items-center">
          <span className="flex items-center gap-1.5">
            <RefreshCw className="h-3 w-3" />
            Auto-refreshes every 60 seconds
          </span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Safe (0–1)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> At Risk (2)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Critical (3+)
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}