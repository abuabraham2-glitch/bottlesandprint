import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, startOfMonth, subMonths } from "date-fns";

interface MonthlyStats {
  id: string;
  month_start: string;
  quotes_sent: number;
  po_received: number;
  conversion_pct: number;
  avg_days_to_close: number;
  insights: string;
  created_at: string;
}

function useCurrentMonthLive() {
  return useQuery({
    queryKey: ["stats", "current_month_live"],
    queryFn: async () => {
      const monthStart = startOfMonth(new Date()).toISOString();
      const { count: quotes } = await supabase
        .from("emails")
        .select("*", { count: "exact", head: true })
        .eq("category", "SALES")
        .in("status", ["approved_sent", "converted"])
        .gte("created_at", monthStart);

      const { data: convertedEmails } = await supabase
        .from("emails")
        .select("created_at, po_received_at")
        .eq("converted", true)
        .gte("po_received_at", monthStart);

      const converted = convertedEmails?.length || 0;
      const rate = quotes ? Math.round((converted / quotes) * 10000) / 100 : 0;

      let avgDays = 0;
      if (convertedEmails && convertedEmails.length > 0) {
        const totalDays = convertedEmails.reduce((sum, e) => {
          if (e.created_at && e.po_received_at) {
            return sum + (new Date(e.po_received_at).getTime() - new Date(e.created_at).getTime()) / (1000 * 60 * 60 * 24);
          }
          return sum;
        }, 0);
        avgDays = Math.round((totalDays / convertedEmails.length) * 10) / 10;
      }

      return { quotes: quotes || 0, converted, rate, avgDays };
    },
  });
}

function useMonthlyStats() {
  return useQuery({
    queryKey: ["stats", "monthly_stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_stats")
        .select("*")
        .order("month_start", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data || []) as unknown as MonthlyStats[];
    },
  });
}

function useAllTimeStats() {
  return useQuery({
    queryKey: ["stats", "all_time"],
    queryFn: async () => {
      const { data: convertedEmails } = await supabase
        .from("emails")
        .select("created_at, po_received_at")
        .eq("converted", true);

      let avgDays = 0;
      if (convertedEmails && convertedEmails.length > 0) {
        const totalDays = convertedEmails.reduce((sum, e) => {
          if (e.created_at && e.po_received_at) {
            return sum + (new Date(e.po_received_at).getTime() - new Date(e.created_at).getTime()) / (1000 * 60 * 60 * 24);
          }
          return sum;
        }, 0);
        avgDays = Math.round((totalDays / convertedEmails.length) * 10) / 10;
      }

      return { avgDays };
    },
  });
}

function rateColor(rate: number) {
  if (rate >= 20) return "text-emerald-600";
  if (rate >= 10) return "text-yellow-600";
  return "text-red-600";
}

export default function Stats() {
  const { data: currentMonth } = useCurrentMonthLive();
  const { data: monthlyStats = [] } = useMonthlyStats();
  const { data: allTime } = useAllTimeStats();

  // Trailing 12 from monthly_stats
  const trailing12 = monthlyStats.reduce(
    (acc, m) => ({
      quotes: acc.quotes + (m.quotes_sent || 0),
      converted: acc.converted + (m.po_received || 0),
    }),
    { quotes: 0, converted: 0 }
  );
  // Add current month live data to trailing 12 and all time
  const t12Quotes = trailing12.quotes + (currentMonth?.quotes || 0);
  const t12Converted = trailing12.converted + (currentMonth?.converted || 0);
  const t12Rate = t12Quotes ? Math.round((t12Converted / t12Quotes) * 10000) / 100 : 0;

  const allQuotes = t12Quotes; // monthly_stats already covers history + current month
  const allConverted = t12Converted;
  const allRate = allQuotes ? Math.round((allConverted / allQuotes) * 10000) / 100 : 0;

  // Trailing 12 avg days
  const t12AvgDays = monthlyStats.length > 0
    ? Math.round(monthlyStats.reduce((s, m) => s + (m.avg_days_to_close || 0), 0) / monthlyStats.length * 10) / 10
    : 0;

  const latestInsights = monthlyStats.find(m => m.insights && m.insights.trim())?.insights;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      <h1 className="text-xl font-serif font-semibold">📊 Sales Stats</h1>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-sans text-muted-foreground">This Month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm font-sans">Quotes: <strong>{currentMonth?.quotes || 0}</strong> &nbsp;|&nbsp; Converted: <strong>{currentMonth?.converted || 0}</strong></p>
            <p className={`text-lg font-bold ${rateColor(currentMonth?.rate || 0)}`}>{currentMonth?.rate || 0}%</p>
            <p className="text-xs text-muted-foreground">Avg days to close: {currentMonth?.avgDays || "—"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-sans text-muted-foreground">Trailing 12 Months</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm font-sans">Quotes: <strong>{t12Quotes}</strong> &nbsp;|&nbsp; Converted: <strong>{t12Converted}</strong></p>
            <p className={`text-lg font-bold ${rateColor(t12Rate)}`}>{t12Rate}%</p>
            <p className="text-xs text-muted-foreground">Avg days to close: {t12AvgDays || "—"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-sans text-muted-foreground">All Time</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm font-sans">Quotes: <strong>{allQuotes}</strong> &nbsp;|&nbsp; Converted: <strong>{allConverted}</strong></p>
            <p className={`text-lg font-bold ${rateColor(allRate)}`}>{allRate}%</p>
            <p className="text-xs text-muted-foreground">Avg days to close: {allTime?.avgDays || "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* AI Insights */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-sans">💡 AI Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-sans text-muted-foreground whitespace-pre-wrap">
            {latestInsights || "Insights will appear after the first monthly stats run."}
          </p>
        </CardContent>
      </Card>

      {/* Monthly History Table */}
      {monthlyStats.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-sans">Monthly History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-sans text-xs">Month</TableHead>
                  <TableHead className="font-sans text-xs">Quotes Sent</TableHead>
                  <TableHead className="font-sans text-xs">POs Received</TableHead>
                  <TableHead className="font-sans text-xs">Conversion %</TableHead>
                  <TableHead className="font-sans text-xs">Avg Days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyStats.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-sans text-sm">{format(new Date(m.month_start), "MMM yyyy")}</TableCell>
                    <TableCell className="font-sans text-sm">{m.quotes_sent}</TableCell>
                    <TableCell className="font-sans text-sm">{m.po_received}</TableCell>
                    <TableCell className={`font-sans text-sm font-medium ${rateColor(m.conversion_pct)}`}>{m.conversion_pct}%</TableCell>
                    <TableCell className="font-sans text-sm">{m.avg_days_to_close || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
