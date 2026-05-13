import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Lock,
  LogOut,
  Users,
  CreditCard,
  Mail,
  BarChart3,
  Search,
  ChevronLeft,
  ChevronRight,
  Send,
  Download,
  DollarSign,
  Activity,
  UserCheck,
  MessageSquare,
  Eye,
  Plus,
  Loader2,
  Shield,
  RefreshCw,
  MessagesSquare,
  ArrowLeft,
  Bot,
  User,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN_KEY = "metallm_admin_token";

function getToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

function setToken(token: string) {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

function clearToken() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function adminFetch(url: string, options: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token || "",
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    clearToken();
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(data.message || "Request failed");
  }
  return res.json();
}

// ─── Login Screen ─────────────────────────────────────────────────
function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }).then((r) => r.json());

      if (data.token) {
        setToken(data.token);
        onLogin();
      } else {
        setError(data.message || "Invalid password");
      }
    } catch {
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
      <div className="w-full max-w-sm p-8 rounded-2xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">MetaLLM Admin</h1>
          <p className="text-sm text-zinc-400">Enter admin password to continue</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-zinc-300">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                placeholder="Enter admin password"
                autoFocus
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Login"}
          </Button>
        </form>
      </div>
    </div>
  );
}

// ─── Stats Cards ──────────────────────────────────────────────────
interface Stats {
  totalUsers: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  businessSubscriptions: number;
  newUsersToday: number;
  newUsersWeek: number;
  newUsersMonth: number;
  verifiedUsers: number;
  totalRevenue: string;
  totalConversations: number;
  totalMessages: number;
}

function StatsCards({ stats }: { stats: Stats | null }) {
  if (!stats) return <div className="text-center text-zinc-500 py-8">Loading stats...</div>;

  const cards = [
    { label: "Total Users", value: stats.totalUsers, icon: Users, color: "text-blue-400" },
    { label: "Verified", value: stats.verifiedUsers, icon: UserCheck, color: "text-green-400" },
    { label: "New Today", value: stats.newUsersToday, icon: Plus, color: "text-emerald-400" },
    { label: "New This Week", value: stats.newUsersWeek, icon: Activity, color: "text-cyan-400" },
    { label: "New This Month", value: stats.newUsersMonth, icon: BarChart3, color: "text-indigo-400" },
    { label: "Active Subs", value: stats.activeSubscriptions, icon: CreditCard, color: "text-purple-400" },
    { label: "Business Subs", value: stats.businessSubscriptions, icon: CreditCard, color: "text-pink-400" },
    { label: "Revenue", value: `$${Number(stats.totalRevenue || 0).toFixed(2)}`, icon: DollarSign, color: "text-yellow-400" },
    { label: "Conversations", value: stats.totalConversations, icon: MessageSquare, color: "text-orange-400" },
    { label: "Messages", value: stats.totalMessages, icon: MessageSquare, color: "text-rose-400" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2"
        >
          <div className="flex items-center gap-2">
            <card.icon className={`w-4 h-4 ${card.color}`} />
            <span className="text-xs text-zinc-400">{card.label}</span>
          </div>
          <p className="text-xl font-bold text-white">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Charts ───────────────────────────────────────────────────────
const PIE_COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16"];

interface ChartData {
  signupChart: { date: string; users: number }[];
  revenueChart: { date: string; revenue: number }[];
  messagesChart: { date: string; messages: number }[];
  providerBreakdown: { name: string; value: number }[];
  verificationBreakdown: { name: string; value: number }[];
  subscriptionBreakdown: { name: string; value: number }[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-xl">
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-sm font-medium" style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" && p.name === "revenue" ? `$${p.value.toFixed(2)}` : p.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-xl">
      <p className="text-sm font-medium text-zinc-200">{d.name}</p>
      <p className="text-xs text-zinc-400">{d.value.toLocaleString()}</p>
    </div>
  );
}

function DashboardCharts({ charts }: { charts: ChartData | null }) {
  if (!charts) return (
    <div className="text-center text-zinc-500 py-8">
      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
      Loading charts...
    </div>
  );

  const formatDate = (date: string) => {
    const d = new Date(date);
    return `${d.getDate()} ${d.toLocaleString("default", { month: "short" })}`;
  };

  return (
    <div className="space-y-6">
      {/* Row 1: Signups Area + Messages Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily Signups */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h4 className="text-sm font-semibold text-zinc-300 mb-4">User Signups (30 days)</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.signupChart}>
                <defs>
                  <linearGradient id="signupGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#27272a" }} tickLine={false} />
                <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#27272a" }} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="users" stroke="#8b5cf6" fill="url(#signupGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Messages */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h4 className="text-sm font-semibold text-zinc-300 mb-4">Messages (30 days)</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.messagesChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#27272a" }} tickLine={false} />
                <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#27272a" }} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="messages" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2: Revenue Area */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h4 className="text-sm font-semibold text-zinc-300 mb-4">Revenue (30 days)</h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={charts.revenueChart}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#27272a" }} tickLine={false} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#27272a" }} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="url(#revenueGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 3: Pie Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Auth Provider */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h4 className="text-sm font-semibold text-zinc-300 mb-4">Auth Providers</h4>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={charts.providerBreakdown} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value" nameKey="name">
                  {charts.providerBreakdown.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend
                  formatter={(value: string) => <span className="text-xs text-zinc-400">{value}</span>}
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Verification */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h4 className="text-sm font-semibold text-zinc-300 mb-4">Verification Status</h4>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={charts.verificationBreakdown} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value" nameKey="name">
                  <Cell fill="#10b981" />
                  <Cell fill="#ef4444" />
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend
                  formatter={(value: string) => <span className="text-xs text-zinc-400">{value}</span>}
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Subscriptions */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h4 className="text-sm font-semibold text-zinc-300 mb-4">Subscription Status</h4>
          <div className="h-52">
            {charts.subscriptionBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={charts.subscriptionBreakdown} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value" nameKey="name">
                    {charts.subscriptionBreakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                  <Legend
                    formatter={(value: string) => <span className="text-xs text-zinc-400">{value}</span>}
                    iconSize={8}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500 text-sm">No subscriptions yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Model Analytics Charts ──────────────────────────────────────
const MODEL_COLORS = [
  "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#a855f7",
];

function ModelAnalyticsCharts() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await adminFetch("/api/admin/model-analytics");
        setData(result);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return (
    <div className="text-center text-zinc-500 py-8">
      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
      Loading model analytics...
    </div>
  );

  if (!data || !data.modelUsage?.length) return (
    <div className="text-center text-zinc-500 py-6 rounded-xl border border-zinc-800">
      No model usage data yet
    </div>
  );

  const formatDate = (date: string) => {
    const d = new Date(date);
    return `${d.getDate()} ${d.toLocaleString("default", { month: "short" })}`;
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-zinc-200">Model Usage Analytics</h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bar Chart: Messages per Model */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h4 className="text-sm font-semibold text-zinc-300 mb-4">Messages per Model (All Time)</h4>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.modelUsage.slice(0, 12)} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#27272a" }} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  axisLine={{ stroke: "#27272a" }}
                  tickLine={false}
                  width={120}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-xl">
                        <p className="text-sm font-medium text-zinc-200">{payload[0].payload.name}</p>
                        <p className="text-xs text-violet-400">{Number(payload[0].value).toLocaleString()} messages</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="messages" radius={[0, 4, 4, 0]}>
                  {data.modelUsage.slice(0, 12).map((_: any, i: number) => (
                    <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart: Model Distribution */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h4 className="text-sm font-semibold text-zinc-300 mb-4">Model Distribution</h4>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.modelUsage.slice(0, 8)}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="messages"
                  nameKey="name"
                >
                  {data.modelUsage.slice(0, 8).map((_: any, i: number) => (
                    <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend
                  formatter={(value: string) => <span className="text-xs text-zinc-400">{value}</span>}
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Area Chart: Model Usage Trend (30 days) */}
      {data.trendChart?.length > 0 && data.topModels?.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h4 className="text-sm font-semibold text-zinc-300 mb-4">Model Usage Trends (30 days)</h4>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trendChart}>
                <defs>
                  {data.topModels.map((model: string, i: number) => (
                    <linearGradient key={model} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={MODEL_COLORS[i % MODEL_COLORS.length]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={MODEL_COLORS[i % MODEL_COLORS.length]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#27272a" }} tickLine={false} />
                <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#27272a" }} tickLine={false} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-xl max-w-xs">
                        <p className="text-xs text-zinc-400 mb-1">{label}</p>
                        {payload.filter((p: any) => p.value > 0).map((p: any, i: number) => (
                          <p key={i} className="text-xs font-medium" style={{ color: p.color }}>
                            {p.dataKey}: {p.value}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend
                  formatter={(value: string) => <span className="text-xs text-zinc-400">{value}</span>}
                  iconSize={8}
                />
                {data.topModels.map((model: string, i: number) => (
                  <Area
                    key={model}
                    type="monotone"
                    dataKey={model}
                    stroke={MODEL_COLORS[i % MODEL_COLORS.length]}
                    fill={`url(#grad-${i})`}
                    strokeWidth={2}
                    stackId="1"
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Users per Model */}
      {data.modelUsers?.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h4 className="text-sm font-semibold text-zinc-300 mb-4">Unique Users per Model (30 days)</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.modelUsers.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#27272a" }} tickLine={false} interval={0} angle={-30} textAnchor="end" height={60} />
                <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#27272a" }} tickLine={false} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-xl">
                        <p className="text-sm font-medium text-zinc-200">{payload[0].payload.name}</p>
                        <p className="text-xs text-cyan-400">{payload[0].value} users</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="users" radius={[4, 4, 0, 0]}>
                  {data.modelUsers.slice(0, 10).map((_: any, i: number) => (
                    <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────
interface UserRow {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  authProvider: string | null;
  isVerified: boolean | null;
  credits: string;
  profileImageUrl: string | null;
  createdAt: string;
}

function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [creditUserId, setCreditUserId] = useState<string | null>(null);
  const [userDetailOpen, setUserDetailOpen] = useState(false);
  const [selectedUserDetail, setSelectedUserDetail] = useState<any>(null);
  const { toast } = useToast();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch(`/api/admin/users?page=${page}&limit=25&search=${encodeURIComponent(search)}`);
      setUsers(data.users);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, search, toast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const toggleSelect = (id: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(users.map((u) => u.id)));
    }
  };

  const viewUser = async (id: string) => {
    try {
      const data = await adminFetch(`/api/admin/users/${id}`);
      setSelectedUserDetail(data);
      setUserDetailOpen(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <form onSubmit={handleSearch} className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by email or name..."
              className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
            />
          </div>
          <Button type="submit" variant="outline" className="border-zinc-700 text-zinc-300">
            Search
          </Button>
        </form>
        <div className="flex gap-2">
          {selectedUsers.size > 0 && (
            <Button
              onClick={() => setEmailDialogOpen(true)}
              className="bg-violet-600 hover:bg-violet-500"
            >
              <Mail className="w-4 h-4 mr-2" /> Email ({selectedUsers.size})
            </Button>
          )}
          <span className="text-sm text-zinc-400 self-center">{total} users</span>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400 w-10">
                <Checkbox
                  checked={users.length > 0 && selectedUsers.size === users.length}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="text-zinc-400">Email</TableHead>
              <TableHead className="text-zinc-400">Name</TableHead>
              <TableHead className="text-zinc-400">Provider</TableHead>
              <TableHead className="text-zinc-400">Verified</TableHead>
              <TableHead className="text-zinc-400">Credits</TableHead>
              <TableHead className="text-zinc-400">Joined</TableHead>
              <TableHead className="text-zinc-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-zinc-500 py-8">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-zinc-500 py-8">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id} className="border-zinc-800">
                  <TableCell>
                    <Checkbox
                      checked={selectedUsers.has(user.id)}
                      onCheckedChange={() => toggleSelect(user.id)}
                    />
                  </TableCell>
                  <TableCell className="text-zinc-200 text-sm">{user.email || "—"}</TableCell>
                  <TableCell className="text-zinc-300 text-sm">
                    {[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-400">
                      {user.authProvider || "email"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.isVerified ? (
                      <Badge className="bg-green-600/20 text-green-400 text-xs">Yes</Badge>
                    ) : (
                      <Badge className="bg-red-600/20 text-red-400 text-xs">No</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-300 text-sm font-mono">
                    ${Number(user.credits || 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-zinc-400 text-xs">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => viewUser(user.id)}
                        className="text-zinc-400 hover:text-white h-7 w-7 p-0"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setCreditUserId(user.id); setCreditDialogOpen(true); }}
                        className="text-zinc-400 hover:text-white h-7 w-7 p-0"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="border-zinc-700 text-zinc-300"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="border-zinc-700 text-zinc-300"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Email Dialog */}
      <EmailDialog
        open={emailDialogOpen}
        onClose={() => setEmailDialogOpen(false)}
        userIds={Array.from(selectedUsers)}
      />

      {/* Credit Dialog */}
      <CreditDialog
        open={creditDialogOpen}
        onClose={() => { setCreditDialogOpen(false); setCreditUserId(null); fetchUsers(); }}
        userId={creditUserId}
      />

      {/* User Detail Dialog */}
      <UserDetailDialog
        open={userDetailOpen}
        onClose={() => { setUserDetailOpen(false); setSelectedUserDetail(null); }}
        data={selectedUserDetail}
      />
    </div>
  );
}

// ─── Email Dialog ─────────────────────────────────────────────────
function EmailDialog({
  open,
  onClose,
  userIds,
}: {
  open: boolean;
  onClose: () => void;
  userIds: string[];
}) {
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [sendToAll, setSendToAll] = useState(false);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!subject.trim() || !html.trim()) {
      toast({ title: "Error", description: "Subject and body are required", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const result = await adminFetch("/api/admin/send-email", {
        method: "POST",
        body: JSON.stringify({
          userIds: sendToAll ? [] : userIds,
          subject,
          html,
          text: html.replace(/<[^>]*>/g, ""),
          sendToAll,
        }),
      });
      toast({
        title: "Email Sent",
        description: `Sent: ${result.sent}, Failed: ${result.failed}`,
      });
      setSubject("");
      setHtml("");
      setSendToAll(false);
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Send Email</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50">
            <Checkbox
              id="sendToAll"
              checked={sendToAll}
              onCheckedChange={(v) => setSendToAll(!!v)}
            />
            <label htmlFor="sendToAll" className="text-sm text-zinc-300 cursor-pointer">
              Send to all verified users (ignores selection)
            </label>
          </div>
          {!sendToAll && (
            <p className="text-sm text-zinc-400">
              Sending to {userIds.length} selected user(s)
            </p>
          )}
          <div className="space-y-2">
            <Label className="text-zinc-300">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject..."
              className="bg-zinc-800 border-zinc-700 text-white"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-300">
              HTML Body <span className="text-zinc-500">(use {"{{name}}"} for personalization)</span>
            </Label>
            <Textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              placeholder="<h2>Hi {{name}},</h2><p>Your email content here...</p>"
              className="bg-zinc-800 border-zinc-700 text-white min-h-[200px] font-mono text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-zinc-700 text-zinc-300">
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending}
            className="bg-violet-600 hover:bg-violet-500"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Credit Dialog ────────────────────────────────────────────────
function CreditDialog({
  open,
  onClose,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  userId: string | null;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!userId || !amount) return;
    setSaving(true);
    try {
      const result = await adminFetch(`/api/admin/users/${userId}/credits`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount), description }),
      });
      toast({ title: "Credits Updated", description: `New balance: $${result.newBalance}` });
      setAmount("");
      setDescription("");
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Adjust Credits</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-zinc-300">Amount (positive = add, negative = deduct)</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 5.00 or -2.50"
              className="bg-zinc-800 border-zinc-700 text-white"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-300">Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Reason for adjustment..."
              className="bg-zinc-800 border-zinc-700 text-white"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-zinc-700 text-zinc-300">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !amount}
            className="bg-violet-600 hover:bg-violet-500"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update Credits"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── User Detail Dialog ───────────────────────────────────────────
function UserDetailDialog({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: any;
}) {
  const [detailTab, setDetailTab] = useState<"info" | "conversations">("info");
  const [userConvos, setUserConvos] = useState<any[]>([]);
  const [convosLoading, setConvosLoading] = useState(false);
  const [convoPage, setConvoPage] = useState(1);
  const [convoTotalPages, setConvoTotalPages] = useState(1);
  const [convoTotal, setConvoTotal] = useState(0);
  const [viewingMsgs, setViewingMsgs] = useState<any>(null);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const { toast } = useToast();

  const fetchUserConvos = useCallback(async (userId: string, pg: number) => {
    setConvosLoading(true);
    try {
      const data = await adminFetch(`/api/admin/users/${userId}/conversations?page=${pg}&limit=15`);
      setUserConvos(data.conversations);
      setConvoTotal(data.total);
      setConvoTotalPages(data.totalPages);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setConvosLoading(false);
    }
  }, [toast]);

  const fetchConvoMessages = async (convoId: number) => {
    setMsgsLoading(true);
    try {
      const result = await adminFetch(`/api/admin/conversations/${convoId}/messages`);
      setViewingMsgs(result);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setMsgsLoading(false);
    }
  };

  useEffect(() => {
    if (data && detailTab === "conversations") {
      fetchUserConvos(data.user.id, convoPage);
    }
  }, [data, detailTab, convoPage, fetchUserConvos]);

  useEffect(() => {
    if (!open) {
      setDetailTab("info");
      setUserConvos([]);
      setViewingMsgs(null);
      setConvoPage(1);
    }
  }, [open]);

  if (!data) return null;

  const { user, transactions, subscription } = data;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">User Details — {user.email || user.id.slice(0, 8)}</DialogTitle>
        </DialogHeader>

        {/* Sub-tabs */}
        <div className="flex gap-2 border-b border-zinc-800 pb-2 mb-4">
          <button
            onClick={() => { setDetailTab("info"); setViewingMsgs(null); }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              detailTab === "info"
                ? "bg-violet-600/20 text-violet-400"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Info & Transactions
          </button>
          <button
            onClick={() => { setDetailTab("conversations"); setViewingMsgs(null); }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              detailTab === "conversations"
                ? "bg-violet-600/20 text-violet-400"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Conversations {convoTotal > 0 ? `(${convoTotal})` : ""}
          </button>
        </div>

        {detailTab === "info" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-zinc-500">Email</span>
                <p className="text-sm text-zinc-200">{user.email || "—"}</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Name</span>
                <p className="text-sm text-zinc-200">
                  {[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"}
                </p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Credits</span>
                <p className="text-sm text-zinc-200 font-mono">${Number(user.credits || 0).toFixed(4)}</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Provider</span>
                <p className="text-sm text-zinc-200">{user.authProvider}</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Verified</span>
                <p className="text-sm">{user.isVerified ? <Badge className="bg-green-600/20 text-green-400">Yes</Badge> : <Badge className="bg-red-600/20 text-red-400">No</Badge>}</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Joined</span>
                <p className="text-sm text-zinc-200">{new Date(user.createdAt).toLocaleString()}</p>
              </div>
            </div>

            {subscription && (
              <div>
                <h4 className="text-sm font-semibold text-zinc-300 mb-2">Subscription</h4>
                <div className="p-3 rounded-lg bg-zinc-800/50 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Status</span>
                    <Badge variant="outline" className="text-xs">{subscription.status}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Plan</span>
                    <span className="text-zinc-200">{subscription.planInterval}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Provider</span>
                    <span className="text-zinc-200">{subscription.provider}</span>
                  </div>
                </div>
              </div>
            )}

            {transactions && transactions.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-zinc-300 mb-2">Recent Transactions</h4>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-zinc-400 text-xs">Type</TableHead>
                        <TableHead className="text-zinc-400 text-xs">Amount</TableHead>
                        <TableHead className="text-zinc-400 text-xs">Balance</TableHead>
                        <TableHead className="text-zinc-400 text-xs">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx: any) => (
                        <TableRow key={tx.id} className="border-zinc-800">
                          <TableCell>
                            <Badge variant="outline" className="text-xs border-zinc-700">{tx.type}</Badge>
                          </TableCell>
                          <TableCell className={`text-xs font-mono ${Number(tx.amount) >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {Number(tx.amount) >= 0 ? "+" : ""}{Number(tx.amount).toFixed(4)}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-zinc-300">${Number(tx.balanceAfter).toFixed(4)}</TableCell>
                          <TableCell className="text-xs text-zinc-400">{new Date(tx.createdAt).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        {detailTab === "conversations" && !viewingMsgs && (
          <div className="space-y-3">
            {convosLoading ? (
              <div className="text-center text-zinc-500 py-8">
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              </div>
            ) : userConvos.length === 0 ? (
              <div className="text-center text-zinc-500 py-8">No conversations found for this user</div>
            ) : (
              <>
                <div className="space-y-2">
                  {userConvos.map((c: any) => (
                    <div
                      key={c.id}
                      onClick={() => fetchConvoMessages(c.id)}
                      className="p-3 rounded-lg border border-zinc-800 hover:border-violet-500/30 bg-zinc-800/30 hover:bg-zinc-800/60 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-zinc-200 font-medium truncate max-w-[300px]">
                          {c.title || "Untitled"}
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
                            {c.messageCount} msgs
                          </Badge>
                          {c.lastModel && (
                            <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-400">
                              {c.lastModel}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-600 mt-1">
                        {new Date(c.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-zinc-500">Page {convoPage} of {convoTotalPages}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={convoPage <= 1} onClick={() => setConvoPage((p) => p - 1)} className="border-zinc-700 text-zinc-300 h-7 text-xs">
                      <ChevronLeft className="w-3 h-3" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={convoPage >= convoTotalPages} onClick={() => setConvoPage((p) => p + 1)} className="border-zinc-700 text-zinc-300 h-7 text-xs">
                      <ChevronRight className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {detailTab === "conversations" && viewingMsgs && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setViewingMsgs(null)} className="text-zinc-400 hover:text-white h-7">
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
              </Button>
              <span className="text-sm font-medium text-zinc-300 truncate">
                {viewingMsgs.conversation.title}
              </span>
              <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-500">
                {viewingMsgs.messages.length} msgs
              </Badge>
            </div>
            {msgsLoading ? (
              <div className="text-center py-6">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-zinc-500" />
              </div>
            ) : (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {viewingMsgs.messages.map((msg: any) => (
                  <div
                    key={msg.id}
                    className={`rounded-lg p-3 ${
                      msg.role === "user"
                        ? "bg-zinc-800/60 border border-zinc-700/50 ml-6"
                        : msg.role === "assistant"
                          ? "bg-violet-600/10 border border-violet-500/20 mr-6"
                          : "bg-zinc-900/60 border border-zinc-800 mx-12"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {msg.role === "user" ? (
                        <User className="w-3 h-3 text-blue-400" />
                      ) : msg.role === "assistant" ? (
                        <Bot className="w-3 h-3 text-violet-400" />
                      ) : (
                        <Shield className="w-3 h-3 text-zinc-400" />
                      )}
                      <span className="text-[10px] font-medium text-zinc-500 capitalize">{msg.role}</span>
                      {msg.modelName && (
                        <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-400 px-1 py-0">
                          {msg.modelName}
                        </Badge>
                      )}
                      <span className="text-[10px] text-zinc-600 ml-auto">{new Date(msg.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-xs text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                      {msg.content.length > 2000 ? msg.content.slice(0, 2000) + "..." : msg.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Subscriptions Tab ────────────────────────────────────────────
function SubscriptionsTab() {
  const [subs, setSubs] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch(`/api/admin/subscriptions?page=${page}&limit=25`);
      setSubs(data.subscriptions);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, toast]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-200">Subscriptions ({total})</h3>
      </div>
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400">User</TableHead>
              <TableHead className="text-zinc-400">Plan</TableHead>
              <TableHead className="text-zinc-400">Status</TableHead>
              <TableHead className="text-zinc-400">Provider</TableHead>
              <TableHead className="text-zinc-400">Renews At</TableHead>
              <TableHead className="text-zinc-400">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : subs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                  No subscriptions found
                </TableCell>
              </TableRow>
            ) : (
              subs.map((sub: any) => (
                <TableRow key={sub.subscriptionId} className="border-zinc-800">
                  <TableCell className="text-zinc-200 text-sm">{sub.userEmail || sub.userId}</TableCell>
                  <TableCell className="text-zinc-300 text-sm">{sub.planInterval}</TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${
                      sub.status === "active"
                        ? "bg-green-600/20 text-green-400"
                        : sub.status === "cancelled"
                          ? "bg-red-600/20 text-red-400"
                          : "bg-yellow-600/20 text-yellow-400"
                    }`}>
                      {sub.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-400 text-sm">{sub.provider}</TableCell>
                  <TableCell className="text-zinc-400 text-xs">
                    {sub.renewsAt ? new Date(sub.renewsAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-zinc-400 text-xs">
                    {new Date(sub.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="border-zinc-700 text-zinc-300">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="border-zinc-700 text-zinc-300">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Business Trial Tab ───────────────────────────────────────────
function BusinessTrialTab() {
  const [subs, setSubs] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch(`/api/admin/business-subscriptions?page=${page}&limit=25`);
      setSubs(data.subscriptions);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, toast]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-200">Business Agent Subscriptions ({total})</h3>
      </div>
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400">User ID</TableHead>
              <TableHead className="text-zinc-400">Agent ID</TableHead>
              <TableHead className="text-zinc-400">Plan</TableHead>
              <TableHead className="text-zinc-400">Status</TableHead>
              <TableHead className="text-zinc-400">Messages</TableHead>
              <TableHead className="text-zinc-400">Period End</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : subs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                  No business subscriptions found
                </TableCell>
              </TableRow>
            ) : (
              subs.map((sub: any) => (
                <TableRow key={sub.id} className="border-zinc-800">
                  <TableCell className="text-zinc-200 text-sm font-mono text-xs">{sub.userId.slice(0, 8)}...</TableCell>
                  <TableCell className="text-zinc-300 text-sm font-mono text-xs">{sub.agentId.slice(0, 8)}...</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-400">{sub.planCode}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${
                      sub.status === "active" ? "bg-green-600/20 text-green-400"
                        : sub.status === "trialing" ? "bg-blue-600/20 text-blue-400"
                          : "bg-yellow-600/20 text-yellow-400"
                    }`}>
                      {sub.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-300 text-sm">{sub.usedMessages}/{sub.monthlyMessageLimit}</TableCell>
                  <TableCell className="text-zinc-400 text-xs">
                    {sub.periodEnd ? new Date(sub.periodEnd).toLocaleDateString() : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="border-zinc-700 text-zinc-300">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="border-zinc-700 text-zinc-300">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Transactions Tab ─────────────────────────────────────────────
function TransactionsTab() {
  const [txns, setTxns] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTxns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (typeFilter) params.set("type", typeFilter);
      const data = await adminFetch(`/api/admin/transactions?${params}`);
      setTxns(data.transactions);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, toast]);

  useEffect(() => { fetchTxns(); }, [fetchTxns]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <h3 className="text-lg font-semibold text-zinc-200">Transactions ({total})</h3>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700 text-zinc-300">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="purchase">Purchase</SelectItem>
            <SelectItem value="usage">Usage</SelectItem>
            <SelectItem value="refund">Refund</SelectItem>
            <SelectItem value="admin_credit">Admin Credit</SelectItem>
            <SelectItem value="admin_debit">Admin Debit</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400">User ID</TableHead>
              <TableHead className="text-zinc-400">Type</TableHead>
              <TableHead className="text-zinc-400">Amount</TableHead>
              <TableHead className="text-zinc-400">Balance After</TableHead>
              <TableHead className="text-zinc-400">Description</TableHead>
              <TableHead className="text-zinc-400">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : txns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              txns.map((tx: any) => (
                <TableRow key={tx.id} className="border-zinc-800">
                  <TableCell className="text-zinc-400 text-xs font-mono">{tx.userId.slice(0, 8)}...</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs border-zinc-700 ${
                      tx.type === "purchase" ? "text-green-400"
                        : tx.type === "usage" ? "text-orange-400"
                          : tx.type === "refund" ? "text-blue-400"
                            : "text-zinc-400"
                    }`}>
                      {tx.type}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-xs font-mono ${Number(tx.amount) >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {Number(tx.amount) >= 0 ? "+" : ""}{Number(tx.amount).toFixed(4)}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-zinc-300">${Number(tx.balanceAfter).toFixed(2)}</TableCell>
                  <TableCell className="text-zinc-400 text-xs max-w-[200px] truncate">{tx.description || "—"}</TableCell>
                  <TableCell className="text-zinc-400 text-xs">{new Date(tx.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="border-zinc-700 text-zinc-300">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="border-zinc-700 text-zinc-300">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Conversation Messages Viewer ─────────────────────────────────
function ConversationMessagesView({
  conversationId,
  onBack,
}: {
  conversationId: number;
  onBack: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await adminFetch(`/api/admin/conversations/${conversationId}/messages`);
        setData(result);
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [conversationId, toast]);

  if (loading) {
    return (
      <div className="text-center text-zinc-500 py-12">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        Loading messages...
      </div>
    );
  }

  if (!data) return null;

  const { conversation, messages: msgs } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-zinc-400 hover:text-white">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-zinc-200 truncate">{conversation.title}</h3>
          <p className="text-xs text-zinc-500">
            {conversation.userEmail || conversation.userName || conversation.userId} &middot; {msgs.length} messages &middot; {new Date(conversation.createdAt).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
        {msgs.map((msg: any) => (
          <div
            key={msg.id}
            className={`rounded-xl p-4 ${
              msg.role === "user"
                ? "bg-zinc-800/60 border border-zinc-700/50 ml-8"
                : msg.role === "assistant"
                  ? "bg-violet-600/10 border border-violet-500/20 mr-8"
                  : "bg-zinc-900/60 border border-zinc-800 mx-16 text-center"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {msg.role === "user" ? (
                <div className="w-6 h-6 rounded-full bg-blue-600/20 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-blue-400" />
                </div>
              ) : msg.role === "assistant" ? (
                <div className="w-6 h-6 rounded-full bg-violet-600/20 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-violet-400" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-zinc-700/50 flex items-center justify-center">
                  <Shield className="w-3.5 h-3.5 text-zinc-400" />
                </div>
              )}
              <span className="text-xs font-medium text-zinc-400 capitalize">{msg.role}</span>
              {msg.modelName && (
                <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-400 px-1.5 py-0">
                  {msg.modelName}
                </Badge>
              )}
              <span className="text-[10px] text-zinc-600 ml-auto">
                {new Date(msg.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="text-sm text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
              {msg.content.length > 3000 ? msg.content.slice(0, 3000) + "..." : msg.content}
            </div>
          </div>
        ))}
        {msgs.length === 0 && (
          <div className="text-center text-zinc-500 py-8">No messages in this conversation</div>
        )}
      </div>
    </div>
  );
}

// ─── Conversations Tab ───────────────────────────────────────────
function ConversationsTab() {
  const [convos, setConvos] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewingConvoId, setViewingConvoId] = useState<number | null>(null);
  const { toast } = useToast();

  const fetchConvos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (search) params.set("search", search);
      const data = await adminFetch(`/api/admin/conversations?${params}`);
      setConvos(data.conversations);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, search, toast]);

  useEffect(() => { fetchConvos(); }, [fetchConvos]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  if (viewingConvoId !== null) {
    return (
      <ConversationMessagesView
        conversationId={viewingConvoId}
        onBack={() => setViewingConvoId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <form onSubmit={handleSearch} className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by user email or name..."
              className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
            />
          </div>
          <Button type="submit" variant="outline" className="border-zinc-700 text-zinc-300">
            Search
          </Button>
        </form>
        <span className="text-sm text-zinc-400">{total} conversations</span>
      </div>

      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400">Title</TableHead>
              <TableHead className="text-zinc-400">User</TableHead>
              <TableHead className="text-zinc-400">Messages</TableHead>
              <TableHead className="text-zinc-400">Last Model</TableHead>
              <TableHead className="text-zinc-400">Updated</TableHead>
              <TableHead className="text-zinc-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : convos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                  No conversations found
                </TableCell>
              </TableRow>
            ) : (
              convos.map((convo: any) => (
                <TableRow
                  key={convo.id}
                  className="border-zinc-800 cursor-pointer hover:bg-zinc-800/40 transition-colors"
                  onClick={() => setViewingConvoId(convo.id)}
                >
                  <TableCell className="text-zinc-200 text-sm max-w-[250px] truncate">
                    {convo.title || "Untitled"}
                  </TableCell>
                  <TableCell className="text-zinc-400 text-sm">
                    {convo.userEmail || convo.userId?.slice(0, 8) + "..."}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-300">
                      {convo.messageCount}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {convo.lastModel ? (
                      <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-400">
                        {convo.lastModel}
                      </Badge>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-400 text-xs">
                    {new Date(convo.updatedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setViewingConvoId(convo.id); }}
                      className="text-zinc-400 hover:text-white h-7 w-7 p-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="border-zinc-700 text-zinc-300">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="border-zinc-700 text-zinc-300">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Email Broadcast Tab ──────────────────────────────────────────
type EmailFilter = "all" | "used" | "paid" | "business";

function EmailBroadcastTab() {
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [emails, setEmails] = useState<any[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [emailSearch, setEmailSearch] = useState("");
  const [emailFilter, setEmailFilter] = useState<EmailFilter>("all");
  const [sendMode, setSendMode] = useState<"selected" | "all">("selected");
  const [senderEmails, setSenderEmails] = useState<{ id: string; email: string; label: string }[]>([]);
  const [selectedSender, setSelectedSender] = useState("");
  const { toast } = useToast();

  const fetchSenderEmails = async () => {
    try {
      const data = await adminFetch("/api/admin/sender-emails");
      setSenderEmails(data);
      if (data.length > 0) {
        const promo = data.find((s: any) => s.id === "promotion");
        setSelectedSender(promo ? promo.id : data[0].id);
      }
    } catch {
      // ignore
    }
  };

  const fetchEmails = async () => {
    setLoadingEmails(true);
    try {
      const data = await adminFetch("/api/admin/emails");
      setEmails(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingEmails(false);
    }
  };

  useEffect(() => { fetchEmails(); fetchSenderEmails(); }, []);

  const filteredEmails = emails.filter((e: any) => {
    // Apply category filter first
    if (emailFilter === "used" && (!e.totalMessages || e.totalMessages === 0)) return false;
    if (emailFilter === "paid" && !e.isPaidSubscriber) return false;
    if (emailFilter === "business" && !e.hasBusinessProfile) return false;

    // Then apply search
    if (!emailSearch) return true;
    const q = emailSearch.toLowerCase();
    return (
      (e.email && e.email.toLowerCase().includes(q)) ||
      (e.firstName && e.firstName.toLowerCase().includes(q)) ||
      (e.lastName && e.lastName.toLowerCase().includes(q))
    );
  });

  const toggleEmail = (id: string) => {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedEmails.size === filteredEmails.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(filteredEmails.map((e: any) => e.id)));
    }
  };

  const exportEmails = () => {
    const exportList = selectedEmails.size > 0
      ? emails.filter((e: any) => selectedEmails.has(e.id))
      : emails;
    const csv = "Email,First Name,Last Name,Verified,Joined\n" +
      exportList.map((e: any) =>
        `${e.email || ""},${e.firstName || ""},${e.lastName || ""},${e.isVerified ? "Yes" : "No"},${new Date(e.createdAt).toLocaleDateString()}`
      ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "metallm_users.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const sendEmails = async () => {
    if (!subject.trim() || !html.trim()) {
      toast({ title: "Error", description: "Subject and body are required", variant: "destructive" });
      return;
    }
    if (sendMode === "selected" && selectedEmails.size === 0) {
      toast({ title: "Error", description: "Select at least one user or switch to 'Send to All'", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const result = await adminFetch("/api/admin/send-email", {
        method: "POST",
        body: JSON.stringify({
          userIds: sendMode === "selected" ? Array.from(selectedEmails) : [],
          subject,
          html,
          text: html.replace(/<[^>]*>/g, ""),
          sendToAll: sendMode === "all",
          fromEmailId: selectedSender || undefined,
        }),
      });
      toast({
        title: "Email Sent",
        description: `Sent: ${result.sent}, Failed: ${result.failed}, Total: ${result.total}`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top: Email List with selection */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-zinc-200">Email List</h3>
            {emails.length > 0 && (
              <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                {filteredEmails.length}{filteredEmails.length !== emails.length ? `/${emails.length}` : ""} users
              </Badge>
            )}
            {selectedEmails.size > 0 && (
              <Badge className="bg-violet-600/20 text-violet-400">
                {selectedEmails.size} selected
              </Badge>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                value={emailSearch}
                onChange={(e) => setEmailSearch(e.target.value)}
                placeholder="Search emails..."
                className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 h-8 text-sm"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchEmails}
              disabled={loadingEmails}
              className="border-zinc-700 text-zinc-300 h-8"
            >
              {loadingEmails ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportEmails}
              disabled={emails.length === 0}
              className="border-zinc-700 text-zinc-300 h-8"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {([
            { id: "all", label: "All Users", count: emails.length },
            { id: "used", label: "Used Platform", count: emails.filter((e: any) => e.totalMessages > 0).length },
            { id: "paid", label: "Paid Subscribers", count: emails.filter((e: any) => e.isPaidSubscriber).length },
            { id: "business", label: "Business Profile", count: emails.filter((e: any) => e.hasBusinessProfile).length },
          ] as { id: EmailFilter; label: string; count: number }[]).map((f) => (
            <button
              key={f.id}
              onClick={() => { setEmailFilter(f.id); setSelectedEmails(new Set()); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                emailFilter === f.id
                  ? "border-violet-500 bg-violet-600/20 text-violet-300"
                  : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
              }`}
            >
              {f.label} <span className="ml-1 text-xs opacity-70">({f.count})</span>
            </button>
          ))}
        </div>

        {loadingEmails ? (
          <div className="text-center text-zinc-500 py-8 rounded-xl border border-zinc-800">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Loading emails...
          </div>
        ) : emails.length === 0 ? (
          <div className="text-center text-zinc-500 py-8 rounded-xl border border-zinc-800">
            No emails found
          </div>
        ) : (
          <div className="max-h-[350px] overflow-y-auto rounded-xl border border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400 w-10">
                    <Checkbox
                      checked={filteredEmails.length > 0 && selectedEmails.size === filteredEmails.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="text-zinc-400">Email</TableHead>
                  <TableHead className="text-zinc-400">Name</TableHead>
                  <TableHead className="text-zinc-400">Messages</TableHead>
                  <TableHead className="text-zinc-400">Convos</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmails.map((e: any) => (
                  <TableRow
                    key={e.id}
                    className={`border-zinc-800 cursor-pointer transition-colors ${selectedEmails.has(e.id) ? "bg-violet-600/10" : ""}`}
                    onClick={() => toggleEmail(e.id)}
                  >
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      <Checkbox
                        checked={selectedEmails.has(e.id)}
                        onCheckedChange={() => toggleEmail(e.id)}
                      />
                    </TableCell>
                    <TableCell className="text-zinc-200 text-sm">{e.email || "—"}</TableCell>
                    <TableCell className="text-zinc-300 text-sm">
                      {[e.firstName, e.lastName].filter(Boolean).join(" ") || "—"}
                    </TableCell>
                    <TableCell className="text-zinc-300 text-sm">{e.totalMessages || 0}</TableCell>
                    <TableCell className="text-zinc-300 text-sm">{e.totalConversations || 0}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {e.isPaidSubscriber && (
                          <Badge className="bg-emerald-600/20 text-emerald-400 text-[10px] px-1.5">Paid</Badge>
                        )}
                        {e.hasBusinessProfile && (
                          <Badge className="bg-blue-600/20 text-blue-400 text-[10px] px-1.5">Business</Badge>
                        )}
                        {!e.isPaidSubscriber && !e.hasBusinessProfile && (
                          <Badge className="bg-zinc-700/50 text-zinc-500 text-[10px] px-1.5">Free</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-zinc-400 text-xs">
                      {new Date(e.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {filteredEmails.length === 0 && emailFilter !== "all" && (
          <p className="text-sm text-zinc-500 text-center py-4">
            No users match the "{emailFilter === "used" ? "Used Platform" : emailFilter === "paid" ? "Paid Subscribers" : "Business Profile"}" filter
          </p>
        )}
      </div>

      {/* Bottom: Compose & Send */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
        <h3 className="text-lg font-semibold text-zinc-200">Compose Email</h3>

        {/* Send Mode Toggle */}
        <div className="flex items-center gap-4 p-3 rounded-lg bg-zinc-800/50">
          <span className="text-sm text-zinc-400">Send to:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSendMode("selected")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                sendMode === "selected"
                  ? "bg-violet-600 text-white"
                  : "bg-zinc-700/50 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Selected Users ({selectedEmails.size})
            </button>
            <button
              onClick={() => setSendMode("all")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                sendMode === "all"
                  ? "bg-violet-600 text-white"
                  : "bg-zinc-700/50 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              All Verified Users
            </button>
          </div>
        </div>

        {sendMode === "selected" && selectedEmails.size > 0 && (
          <div className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-zinc-800/30 max-h-24 overflow-y-auto">
            {emails
              .filter((e: any) => selectedEmails.has(e.id))
              .map((e: any) => (
                <Badge
                  key={e.id}
                  variant="outline"
                  className="border-zinc-700 text-zinc-300 text-xs cursor-pointer hover:border-red-500 hover:text-red-400 transition-colors"
                  onClick={() => toggleEmail(e.id)}
                >
                  {e.email} &times;
                </Badge>
              ))}
          </div>
        )}

        {sendMode === "selected" && selectedEmails.size === 0 && (
          <p className="text-sm text-yellow-400/80 px-1">
            Select users from the list above to send email
          </p>
        )}

        {/* Sender Email Selection */}
        {senderEmails.length > 0 && (
          <div className="space-y-2">
            <Label className="text-zinc-300">Send From</Label>
            <div className="flex flex-wrap gap-2">
              {senderEmails.map((sender) => (
                <button
                  key={sender.id}
                  onClick={() => setSelectedSender(sender.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
                    selectedSender === sender.id
                      ? "border-violet-500 bg-violet-600/20 text-violet-300"
                      : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span className="font-medium">{sender.label}</span>
                  <span className="text-xs opacity-70">{sender.email}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-zinc-300">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject..."
              className="bg-zinc-800 border-zinc-700 text-white"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-zinc-300">
            HTML Body <span className="text-zinc-500">({"{{name}}"} = user's first name)</span>
          </Label>
          <Textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder={'<h2>Hi {{name}},</h2>\n<p>We have exciting news...</p>'}
            className="bg-zinc-800 border-zinc-700 text-white min-h-[200px] font-mono text-sm"
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            {sendMode === "all"
              ? "Will send to all verified users"
              : `Will send to ${selectedEmails.size} selected user(s)`}
            {selectedSender && senderEmails.length > 0 && (
              <span> via <span className="text-zinc-300">{senderEmails.find((s) => s.id === selectedSender)?.email}</span></span>
            )}
          </p>
          <Button
            onClick={sendEmails}
            disabled={sending || !subject || !html || (sendMode === "selected" && selectedEmails.size === 0)}
            className="bg-violet-600 hover:bg-violet-500"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            {sendMode === "all" ? "Send to All" : `Send to ${selectedEmails.size} User(s)`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Admin Dashboard ─────────────────────────────────────────
type Tab = "dashboard" | "users" | "conversations" | "subscriptions" | "business" | "transactions" | "email";

const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "users", label: "Users", icon: Users },
  { id: "conversations", label: "Conversations", icon: MessagesSquare },
  { id: "subscriptions", label: "Subscriptions", icon: CreditCard },
  { id: "business", label: "Business Trial", icon: Activity },
  { id: "transactions", label: "Transactions", icon: DollarSign },
  { id: "email", label: "Email", icon: Mail },
];

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [stats, setStats] = useState<Stats | null>(null);
  const [charts, setCharts] = useState<ChartData | null>(null);
  const { toast } = useToast();

  const fetchStats = useCallback(async () => {
    try {
      const data = await adminFetch("/api/admin/stats");
      setStats(data);
    } catch (err: any) {
      if (err.message === "Session expired") {
        onLogout();
      } else {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    }
  }, [onLogout, toast]);

  const fetchCharts = useCallback(async () => {
    try {
      const data = await adminFetch("/api/admin/charts");
      setCharts(data);
    } catch {
      // ignore chart errors
    }
  }, []);

  useEffect(() => { fetchStats(); fetchCharts(); }, [fetchStats, fetchCharts]);

  const handleLogout = async () => {
    try {
      await adminFetch("/api/admin/logout", { method: "POST" });
    } catch {
      // ignore
    }
    clearToken();
    onLogout();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">MetaLLM Admin</h1>
              <p className="text-xs text-zinc-500">Management Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { fetchStats(); fetchCharts(); }}
              className="text-zinc-400 hover:text-white"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-zinc-400 hover:text-red-400"
            >
              <LogOut className="w-4 h-4 mr-2" /> Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Nav Tabs */}
      <div className="border-b border-zinc-800 bg-zinc-950/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-1 overflow-x-auto py-2 scrollbar-none">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "bg-violet-600/20 text-violet-400"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {activeTab === "dashboard" && (
          <>
            <StatsCards stats={stats} />
            <DashboardCharts charts={charts} />
            <ModelAnalyticsCharts />
          </>
        )}
        {activeTab === "users" && <UsersTab />}
        {activeTab === "conversations" && <ConversationsTab />}
        {activeTab === "subscriptions" && <SubscriptionsTab />}
        {activeTab === "business" && <BusinessTrialTab />}
        {activeTab === "transactions" && <TransactionsTab />}
        {activeTab === "email" && <EmailBroadcastTab />}
      </main>
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────
export default function Admin() {
  const [authenticated, setAuthenticated] = useState(!!getToken());

  if (!authenticated) {
    return <AdminLogin onLogin={() => setAuthenticated(true)} />;
  }

  return <AdminDashboard onLogout={() => setAuthenticated(false)} />;
}
