"use client";

import { useEffect, useState } from "react";

interface AdminStats {
  today: {
    queries: number;
    ai_answers: number;
    wizard_starts: number;
    wizard_completions: number;
    upsell_clicks: number;
  };
  top_queries: Array<{ query: string; count: number }>;
  system: {
    api_status: string;
    video_count: number;
    segment_count: number;
    embedding_count: number;
    pregenerated_answers: number;
    budget_remaining: number;
  };
}

function StatCard({
  label,
  value,
  color = "text-gray-900",
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-card">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/admin/stats");
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setStats(data);
      } catch {
        setError("לא ניתן לטעון נתונים");
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">טוען נתונים...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        {error || "שגיאה בטעינת הנתונים"}
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">לוח בקרה</h1>

      {/* Today's stats */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">היום</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard label="חיפושים" value={stats.today.queries} />
          <StatCard label="תשובות AI" value={stats.today.ai_answers} />
          <StatCard label="התחלות אשף" value={stats.today.wizard_starts} />
          <StatCard label="סיומי אשף" value={stats.today.wizard_completions} />
          <StatCard label="לחיצות Upsell" value={stats.today.upsell_clicks} />
        </div>
      </section>

      {/* Top queries */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">
          חיפושים מובילים היום
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 shadow-card overflow-hidden">
          {stats.top_queries.length === 0 ? (
            <p className="text-gray-400 text-sm p-4">אין נתונים עדיין</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="text-start px-4 py-2 font-medium">שאילתה</th>
                  <th className="text-start px-4 py-2 font-medium w-20">
                    כמות
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.top_queries.map((q, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-50 last:border-b-0"
                  >
                    <td className="px-4 py-2 text-gray-800">{q.query}</td>
                    <td className="px-4 py-2 text-gray-600 font-mono">
                      {q.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* System health */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">
          מצב המערכת
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard
            label="סטטוס API"
            value={stats.system.api_status === "healthy" ? "תקין" : "תקלה"}
            color={
              stats.system.api_status === "healthy"
                ? "text-green-600"
                : "text-red-600"
            }
          />
          <StatCard label="סרטונים" value={stats.system.video_count} />
          <StatCard label="קטעים" value={stats.system.segment_count} />
          <StatCard label="Embeddings" value={stats.system.embedding_count} />
          <StatCard
            label="תשובות מוכנות"
            value={stats.system.pregenerated_answers}
          />
          <StatCard
            label="תקציב נותר ($)"
            value={`$${stats.system.budget_remaining}`}
            color={
              stats.system.budget_remaining > 5
                ? "text-green-600"
                : "text-red-600"
            }
          />
        </div>
      </section>
    </div>
  );
}
