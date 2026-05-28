import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Settings2,
  ShieldCheck,
  UserX,
} from "lucide-react";
import { mockPayload } from "./mockData";
import type { DailyRecord, DashboardPayload, MonthlyCounter } from "./types";

const WEBHOOK_KEY = "hr_attendance_webhook_url";
const EXCUSE_KEY = "hr_attendance_excuse_url";
const REFRESH_MS = 60_000;

type Status = "Safe" | "At Risk" | "Critical";

function statusFor(count: number): Status {
  if (count >= 3) return "Critical";
  if (count === 2) return "At Risk";
  return "Safe";
}

function statusVariant(status: Status): string {
  if (status === "Critical") return "bg-destructive text-destructive-foreground hover:bg-destructive/90";
  if (status === "At Risk") return "bg-amber-500 text-white hover:bg-amber-500/90";
  return "bg-emerald-600 text-white hover:bg-emerald-600/90";
}

async function fetchPayload(url: string): Promise<DashboardPayload> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Webhook ${res.status}`);
  const data = await res.json();
  // Tolerate two common shapes from n8n
  if (Array.isArray(data)) {
    return { date: new Date().toISOString().slice(0, 10), records: data, monthly: [] };
  }
  const p = data as Partial<DashboardPayload>;
  return {
    date: p.date ?? new Date().toISOString().slice(0, 10),
    records: p.records ?? [],
    monthly: p.monthly ?? [],
  };
}

const readLS = (k: string) =>
  typeof window === "undefined" ? "" : window.localStorage.getItem(k) ?? "";

export function Dashboard() {
  const [webhookUrl, setWebhookUrl] = useState<string>(() => readLS(WEBHOOK_KEY));
  const [excuseUrl, setExcuseUrl] = useState<string>(() => readLS(EXCUSE_KEY));
  const [payload, setPayload] = useState<DashboardPayload>(mockPayload);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [usingMock, setUsingMock] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [excusing, setExcusing] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

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
      setUsingMock(false);
    } finally {
      setLoading(false);
    }
  }, [webhookUrl]);

  useEffect(() => {
    load();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(load, REFRESH_MS);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [load]);

  const todayRecords = payload.records ?? [];
  const present = todayRecords.filter((r) => !!r.checkIn);
  const lateToday = present.filter((r) => r.late && !r.excused).length;
  const onTimeToday = present.filter((r) => !r.late || r.excused).length;
  const absentToday = todayRecords.filter((r) => !r.checkIn).length;
  const missingCheckout = present.filter((r) => !r.checkOut).length;

  const atRiskOrCritical: MonthlyCounter[] = useMemo(() => {
    return [...(payload.monthly ?? [])]
      .filter((m) => m.lateCount >= 2)
      .sort((a, b) => b.lateCount - a.lateCount);
  }, [payload.monthly]);

  const handleExcuse = async (record: DailyRecord) => {
    setExcusing(record.employeeId);
    // Optimistic update: mark daily excused AND decrement monthly late count
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
          body: JSON.stringify({
            employeeId: record.employeeId,
            date: record.date,
            action: "excuse",
          }),
        });
        toast.success(`${record.name} marked excused`);
      } else {
        toast.message("Excused locally", {
          description: "Set an excuse webhook in Connect n8n to persist.",
        });
      }
    } catch (e) {
      toast.error("Failed to sync excuse", {
        description: e instanceof Error ? e.message : "Network error",
      });
    } finally {
      setExcusing(null);
    }
  };

  const saveSettings = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(WEBHOOK_KEY, webhookUrl);
      window.localStorage.setItem(EXCUSE_KEY, excuseUrl);
    }
    setSettingsOpen(false);
    load();
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">HR Attendance Intelligence</h1>
              <p className="text-xs text-muted-foreground">
                {payload.date} · updated {lastUpdated.toLocaleTimeString()}
                {usingMock && " · sample data"}
                {!usingMock && !error && " · live"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={usingMock ? "secondary" : error ? "destructive" : "default"} className="hidden sm:inline-flex">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />
              {usingMock ? "Sample mode" : error ? "Disconnected" : "Live"}
            </Badge>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings2 className="mr-2 h-4 w-4" />
                  Connect n8n
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>n8n webhook endpoints</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="webhook">GET webhook (returns attendance JSON)</Label>
                    <Input
                      id="webhook"
                      placeholder="https://your-n8n/webhook/attendance"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Must return {"{ date, records[], monthly[] }"} with CORS enabled.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="excuse">POST webhook for "Excused" override (optional)</Label>
                    <Input
                      id="excuse"
                      placeholder="https://your-n8n/webhook/excuse"
                      value={excuseUrl}
                      onChange={(e) => setExcuseUrl(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={saveSettings}>Save & refresh</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {error && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              Could not reach webhook: {error}. Click "Connect n8n" to update the URL.
            </CardContent>
          </Card>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="On time"
            value={onTimeToday}
            accent="text-emerald-600"
            tone="emerald"
            loading={loading && usingMock}
          />
          <SummaryCard
            icon={<Clock className="h-5 w-5" />}
            label="Late"
            value={lateToday}
            accent="text-destructive"
            tone="destructive"
            loading={loading && usingMock}
          />
          <SummaryCard
            icon={<UserX className="h-5 w-5" />}
            label="Absent"
            value={absentToday}
            accent="text-slate-600"
            tone="slate"
            loading={loading && usingMock}
          />
          <SummaryCard
            icon={<AlertTriangle className="h-5 w-5" />}
            label="Missing checkout"
            value={missingCheckout}
            accent="text-amber-600"
            tone="amber"
            loading={loading && usingMock}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">At-risk employees this month</CardTitle>
                <p className="text-xs text-muted-foreground">Three-strike policy · 2+ late arrivals</p>
              </div>
              <Badge variant="outline" className="font-mono">
                {atRiskOrCritical.length}
              </Badge>
            </CardHeader>
            <Separator />
            <CardContent>
              {atRiskOrCritical.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <ShieldCheck className="h-8 w-8 text-emerald-600" />
                  <p className="text-sm font-medium">All clear this month</p>
                  <p className="text-xs text-muted-foreground">No employees with 2+ late arrivals.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Late count</TableHead>
                      <TableHead>Last warning</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {atRiskOrCritical.map((m) => {
                      const s = statusFor(m.lateCount);
                      return (
                        <TableRow key={m.employeeId}>
                          <TableCell>
                            <div className="font-medium">{m.name}</div>
                            <div className="text-xs text-muted-foreground">{m.employeeId}</div>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{m.lateCount}/3</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {m.lastWarningDate ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge className={statusVariant(s)}>{s}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Today's late arrivals</CardTitle>
                <p className="text-xs text-muted-foreground">Excuse to remove from monthly count</p>
              </div>
              <Badge variant="outline" className="font-mono">{lateToday}</Badge>
            </CardHeader>
            <Separator />
            <CardContent className="space-y-2 pt-4">
              {todayRecords.filter((r) => r.late).length === 0 && (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                  <p className="text-sm font-medium">No late arrivals today</p>
                </div>
              )}
              {todayRecords
                .filter((r) => r.late)
                .map((r) => (
                  <div
                    key={r.employeeId}
                    className="flex items-center justify-between rounded-md border bg-card p-3 transition-colors hover:bg-muted/50"
                  >
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.employeeId} · in {r.checkIn ?? "—"} · out {r.checkOut ?? "missing"}
                      </div>
                    </div>
                    {r.excused ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Excused
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={excusing === r.employeeId}
                        onClick={() => handleExcuse(r)}
                      >
                        {excusing === r.employeeId ? "Saving…" : "Excuse"}
                      </Button>
                    )}
                  </div>
                ))}
            </CardContent>
          </Card>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
          <span>Auto-refreshing every 60 seconds.</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Safe 0–1</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> At Risk 2</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive" /> Critical 3+</span>
          </span>
        </footer>
      </main>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  accent,
  tone,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
  tone: "emerald" | "destructive" | "amber" | "slate";
  loading: boolean;
}) {
  const ring = {
    emerald: "bg-emerald-50 ring-emerald-100 dark:bg-emerald-950/40 dark:ring-emerald-900",
    destructive: "bg-destructive/10 ring-destructive/20",
    amber: "bg-amber-50 ring-amber-100 dark:bg-amber-950/40 dark:ring-amber-900",
    slate: "bg-slate-100 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700",
  }[tone];
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-center gap-4 py-5">
        <div className={`rounded-lg p-3 ring-1 ${ring} ${accent}`}>{icon}</div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-12" />
          ) : (
            <div className="text-3xl font-semibold tabular-nums">{value}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}