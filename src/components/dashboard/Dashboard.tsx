import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle2, Clock, RefreshCw, Settings2, Users } from "lucide-react";
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
  return data as DashboardPayload;
}

export function Dashboard() {
  const [webhookUrl, setWebhookUrl] = useState<string>(() => localStorage.getItem(WEBHOOK_KEY) ?? "");
  const [excuseUrl, setExcuseUrl] = useState<string>(() => localStorage.getItem(EXCUSE_KEY) ?? "");
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
  const lateToday = todayRecords.filter((r) => r.late && !r.excused).length;
  const onTimeToday = todayRecords.filter((r) => !r.late || r.excused).length;
  const missingCheckout = todayRecords.filter((r) => r.checkIn && !r.checkOut).length;

  const atRiskOrCritical: MonthlyCounter[] = useMemo(() => {
    return [...(payload.monthly ?? [])]
      .filter((m) => m.lateCount >= 2)
      .sort((a, b) => b.lateCount - a.lateCount);
  }, [payload.monthly]);

  const handleExcuse = async (record: DailyRecord) => {
    setExcusing(record.employeeId);
    // Optimistic update
    setPayload((p) => ({
      ...p,
      records: p.records.map((r) =>
        r.employeeId === record.employeeId ? { ...r, excused: true } : r,
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
      }
    } catch {
      // keep optimistic state; user will see refresh result
    } finally {
      setExcusing(null);
    }
  };

  const saveSettings = () => {
    localStorage.setItem(WEBHOOK_KEY, webhookUrl);
    localStorage.setItem(EXCUSE_KEY, excuseUrl);
    setSettingsOpen(false);
    load();
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">HR Attendance Intelligence</h1>
            <p className="text-sm text-muted-foreground">
              Live view · {payload.date} · updated {lastUpdated.toLocaleTimeString()}
              {usingMock && " · showing sample data"}
            </p>
          </div>
          <div className="flex items-center gap-2">
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

        <section className="grid gap-4 md:grid-cols-3">
          <SummaryCard
            icon={<Clock className="h-5 w-5" />}
            label="Late today"
            value={lateToday}
            accent="text-destructive"
            loading={loading && !payload.records.length}
          />
          <SummaryCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="On time today"
            value={onTimeToday}
            accent="text-emerald-600"
            loading={loading && !payload.records.length}
          />
          <SummaryCard
            icon={<Users className="h-5 w-5" />}
            label="Missing checkout"
            value={missingCheckout}
            accent="text-amber-600"
            loading={loading && !payload.records.length}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">At-risk employees this month</CardTitle>
              <p className="text-xs text-muted-foreground">Employees with 2 or more late arrivals</p>
            </CardHeader>
            <CardContent>
              {atRiskOrCritical.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No one is at risk this month. Nice.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Late count</TableHead>
                      <TableHead>Last warning</TableHead>
                      <TableHead>Status</TableHead>
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
                          <TableCell className="font-mono">{m.lateCount}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {m.lastWarningDate ?? "—"}
                          </TableCell>
                          <TableCell>
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
            <CardHeader>
              <CardTitle className="text-base">Today's late arrivals</CardTitle>
              <p className="text-xs text-muted-foreground">Mark as Excused to remove from the count</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {todayRecords.filter((r) => r.late).length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No late arrivals today.</p>
              )}
              {todayRecords
                .filter((r) => r.late)
                .map((r) => (
                  <div
                    key={r.employeeId}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.employeeId} · in {r.checkIn ?? "—"} · out {r.checkOut ?? "missing"}
                      </div>
                    </div>
                    {r.excused ? (
                      <Badge variant="secondary">Excused</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={excusing === r.employeeId}
                        onClick={() => handleExcuse(r)}
                      >
                        {excusing === r.employeeId ? "Saving…" : "Mark Excused"}
                      </Button>
                    )}
                  </div>
                ))}
            </CardContent>
          </Card>
        </section>

        <footer className="pt-4 text-center text-xs text-muted-foreground">
          Auto-refreshing every 60 seconds. Three-strike policy: Safe 0–1 · At Risk 2 · Critical 3.
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
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-6">
        <div className={`rounded-md bg-muted p-3 ${accent}`}>{icon}</div>
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