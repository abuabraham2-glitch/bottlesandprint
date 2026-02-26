import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";

const SALES_STATUSES = ["approved_sent", "converted"];
const SALES_CATEGORIES = ["SALES"];

function useStatsData() {
  return useQuery({
    queryKey: ["stats", "live"],
    queryFn: async () => {
      const now = new Date();
      const twelveMonthsAgo = subMonths(now, 12).toISOString();

      // All SALES quotes
      const { data: allQuotes } = await supabase
        .from("emails")
        .select("id, created_at, po_received_at, converted, status")
        .eq("category", "SALES")
        .in("status", SALES_STATUSES);

      const quotes = allQuotes || [];

      // Trailing 12
      const t12Quotes = quotes.filter(q => q.created_at && q.created_at >= twelveMonthsAgo);
      const t12POs = quotes.filter(q => q.converted && q.po_received_at && q.po_received_at >= twelveMonthsAgo);

      // All time
      const allPOs = quotes.filter(q => q.converted);

      // Avg days to close
      const withBoth = quotes.filter(q => q.created_at && q.po_received_at);
      const t12WithBoth = withBoth.filter(q => q.po_received_at! >= twelveMonthsAgo);

      const calcAvg = (arr: typeof withBoth) => {
        if (!arr.length) return 0;
        const total = arr.reduce((s, e) => s + (new Date(e.po_received_at!).getTime() - new Date(e.created_at!).getTime()) / 86400000, 0);
        return Math.round((total / arr.length) * 10) / 10;
      };

      // Monthly data for chart + table (last 12 months)
      const months: { label: string; monthStart: Date; monthEnd: Date }[] = [];
      for (let i = 11; i >= 0; i--) {
        const ms = startOfMonth(subMonths(now, i));
        months.push({ label: format(ms, "MMM"), monthStart: ms, monthEnd: endOfMonth(ms) });
      }

      const monthlyData = months.map(m => {
        const msISO = m.monthStart.toISOString();
        const meISO = m.monthEnd.toISOString();
        const sent = quotes.filter(q => q.created_at && q.created_at >= msISO && q.created_at <= meISO).length;
        const received = quotes.filter(q => q.converted && q.po_received_at && q.po_received_at >= msISO && q.po_received_at <= meISO).length;
        return { month: m.label, quotesSent: sent, posReceived: received };
      });

      return {
        t12: { quotes: t12Quotes.length, pos: t12POs.length },
        allTime: { quotes: quotes.length, pos: allPOs.length },
        avgDays: { t12: calcAvg(t12WithBoth), allTime: calcAvg(withBoth) },
        monthlyData,
      };
    },
  });
}

function useInsights() {
  return useQuery({
    queryKey: ["stats", "insights"],
    queryFn: async () => {
      const { data } = await supabase
        .from("monthly_stats")
        .select("insights")
        .order("month_start", { ascending: false })
        .limit(1);
      return data?.[0]?.insights?.trim() || null;
    },
  });
}

function rateColor(rate: number) {
  if (rate >= 20) return "text-emerald-600";
  if (rate >= 10) return "text-yellow-600";
  return "text-red-600";
}

function pct(n: number, d: number) {
  return d ? Math.round((n / d) * 10000) / 100 : 0;
}

const chartConfig = {
  quotesSent: { label: "Quotes Sent", color: "#3B82F6" },
  posReceived: { label: "POs Received", color: "#22C55E" },
};

export default function Stats() {
  const { data } = useStatsData();
  const { data: insights } = useInsights();

  const t12Rate = data ? pct(data.t12.pos, data.t12.quotes) : 0;
  const allRate = data ? pct(data.allTime.pos, data.allTime.quotes) : 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      <h1 className="text-xl font-serif font-semibold">📊 Sales Stats</h1>

      {/* Top Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-sans text-muted-foreground">Trailing 12 Months</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm font-sans">Quotes Sent: <strong>{data?.t12.quotes ?? 0}</strong></p>
            <p className="text-sm font-sans">POs Received: <strong>{data?.t12.pos ?? 0}</strong></p>
            <p className={`text-lg font-bold ${rateColor(t12Rate)}`}>{t12Rate}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-sans text-muted-foreground">All Time</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm font-sans">Quotes Sent: <strong>{data?.allTime.quotes ?? 0}</strong></p>
            <p className="text-sm font-sans">POs Received: <strong>{data?.allTime.pos ?? 0}</strong></p>
            <p className={`text-lg font-bold ${rateColor(allRate)}`}>{allRate}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-sans text-muted-foreground">Avg Days to Close</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm font-sans">Trailing 12: <strong>{data?.avgDays.t12 || "—"}</strong> days</p>
            <p className="text-sm font-sans">All Time: <strong>{data?.avgDays.allTime || "—"}</strong> days</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trend Chart */}
      {data?.monthlyData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-sans">Monthly Trend (Last 12 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <LineChart data={data.monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="quotesSent" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="posReceived" stroke="#22C55E" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* AI Insights */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-sans">💡 AI Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-sans text-muted-foreground whitespace-pre-wrap">
            {insights || "Insights will appear after the first monthly stats run."}
          </p>
        </CardContent>
      </Card>

      {/* Monthly History Table */}
      {data?.monthlyData && (
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...data.monthlyData].reverse().map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-sans text-sm">{m.month}</TableCell>
                    <TableCell className="font-sans text-sm">{m.quotesSent}</TableCell>
                    <TableCell className="font-sans text-sm">{m.posReceived}</TableCell>
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
