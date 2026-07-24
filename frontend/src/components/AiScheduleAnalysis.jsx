import { useState } from "react";
import {
  ChartBarIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import api from "../services/api";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function toneClass(level) {
  if (level === "high") return "border-red-200 bg-red-50 text-red-800";
  if (level === "medium") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

export default function AiScheduleAnalysis({ month, year }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runAnalysis = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.post(
        "/ai/schedule-analysis",
        {
          month: month || "all",
          year: year || "all",
        },
        { headers: authHeaders() },
      );
      setAnalysis(res.data || null);
    } catch (err) {
      setError(
        err.response?.data?.message || "Không thể phân tích lịch bằng AI.",
      );
    } finally {
      setLoading(false);
    }
  };

  const metrics = analysis?.metrics || {};
  const dailyLoad = analysis?.daily_load || [];
  const maxDailyLoad = Math.max(1, ...dailyLoad.map((item) => Number(item.shifts || 0)));

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)] sm:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-black text-blue-700">
            <SparklesIcon className="h-5 w-5" />
            AI phân tích lịch
          </div>
          <p className="mt-1 max-w-2xl text-sm font-medium text-gray-500">
            Đánh giá mức phủ lịch, tải nhân sự và các ngày có rủi ro từ dữ liệu của kỳ đang xem.
          </p>
        </div>
        <button
          type="button"
          onClick={runAnalysis}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
        >
          <SparklesIcon className="h-5 w-5" />
          {loading ? "Đang phân tích..." : "Phân tích lịch"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
          {error}
        </div>
      )}

      {analysis && (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              ["Sức khỏe lịch", `${metrics.health_score ?? "-"}/100`, "blue"],
              ["Ca đã công bố", metrics.published_shifts ?? 0, "green"],
              ["Lịch nháp", metrics.draft_shifts ?? 0, "amber"],
              ["Nhân sự có lịch", metrics.scheduled_employees ?? 0, "blue"],
              ["Ngày có lịch", metrics.scheduled_days ?? 0, "green"],
              ["Chênh tải", `${metrics.load_gap ?? 0} ca`, "amber"],
            ].map(([label, value, tone]) => (
              <div key={label} className={`rounded-xl border p-3 ${tone === "green" ? "border-emerald-100 bg-emerald-50/60" : tone === "amber" ? "border-amber-100 bg-amber-50/60" : "border-blue-100 bg-blue-50/60"}`}>
                <div className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-gray-500">{label}</div>
                <div className="mt-2 text-xl font-black tabular-nums text-gray-950">{value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-black uppercase text-gray-500">
              Tổng quan
            </div>
            <div className="mt-2 text-sm font-semibold leading-6 text-gray-800">
              {analysis.summary}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-black uppercase text-gray-500">
              Cân bằng
            </div>
            <div className="mt-2 text-sm font-semibold leading-6 text-gray-800">
              {analysis.fairness}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-black uppercase text-gray-500">
              Phủ ca
            </div>
            <div className="mt-2 text-sm font-semibold leading-6 text-gray-800">
              {analysis.coverage}
            </div>
          </div>
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <div className="mb-4 flex items-center gap-2"><ChartBarIcon className="h-5 w-5 text-blue-700" /><div><h3 className="font-black text-gray-950">Tải ca theo ngày</h3><p className="text-sm text-gray-500">Chỉ tính các ca đã công bố.</p></div></div>
            {dailyLoad.length ? <div className="max-h-64 space-y-3 overflow-y-auto pr-2">{dailyLoad.map((item) => <div key={item.date}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="font-bold text-gray-700">{item.date}</span><span className="font-black tabular-nums text-gray-950">{item.shifts} ca</span></div><div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(4, (Number(item.shifts || 0) / maxDailyLoad) * 100)}%` }} /></div></div>)}</div> : <div className="text-sm font-semibold text-gray-500">Chưa có ca đã công bố.</div>}
          </div>

          {analysis.warnings?.length > 0 && (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-2">
              {analysis.warnings.map((warning, index) => (
                <div
                  key={`${warning.title}-${index}`}
                  className={`rounded-xl border p-3 text-sm font-semibold ${toneClass(
                    warning.level,
                  )}`}
                >
                  <div className="flex items-start gap-2">
                    <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <div className="font-black">{warning.title}</div>
                      <div className="mt-1 leading-6">{warning.detail}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-black uppercase text-gray-500">
              Gợi ý cải thiện
            </div>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-2 text-sm font-semibold text-gray-700">
              {(analysis.suggestions || []).map((item) => (
                <div key={item}>- {item}</div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-black uppercase text-gray-500">
              Việc nên làm
            </div>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-2 text-sm font-semibold text-gray-700">
              {(analysis.next_actions || []).map((item) => (
                <div key={item}>- {item}</div>
              ))}
            </div>
          </div>
          </div>
        </div>
      )}
    </section>
  );
}
