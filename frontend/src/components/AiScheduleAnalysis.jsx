import { useState } from "react";
import {
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

  return (
    <section className="rounded-md border border-indigo-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-black uppercase text-indigo-700">
            <SparklesIcon className="h-5 w-5" />
            AI phân tích lịch
          </div>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Tóm tắt cân bằng ca, cảnh báo rủi ro và gợi ý trước khi công bố.
          </p>
        </div>
        <button
          type="button"
          onClick={runAnalysis}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60"
        >
          <SparklesIcon className="h-5 w-5" />
          {loading ? "Đang phân tích..." : "Phân tích lịch"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      {analysis && (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-black uppercase text-slate-500">
              Tổng quan
            </div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-800">
              {analysis.summary}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-black uppercase text-slate-500">
              Cân bằng
            </div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-800">
              {analysis.fairness}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-black uppercase text-slate-500">
              Phủ ca
            </div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-800">
              {analysis.coverage}
            </div>
          </div>

          {analysis.warnings?.length > 0 && (
            <div className="space-y-2 lg:col-span-3">
              {analysis.warnings.map((warning, index) => (
                <div
                  key={`${warning.title}-${index}`}
                  className={`rounded-md border p-3 text-sm font-semibold ${toneClass(
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

          <div className="rounded-md border border-slate-200 p-3 lg:col-span-2">
            <div className="text-xs font-black uppercase text-slate-500">
              Gợi ý cải thiện
            </div>
            <div className="mt-2 space-y-1 text-sm font-semibold text-slate-700">
              {(analysis.suggestions || []).map((item) => (
                <div key={item}>- {item}</div>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <div className="text-xs font-black uppercase text-slate-500">
              Việc nên làm
            </div>
            <div className="mt-2 space-y-1 text-sm font-semibold text-slate-700">
              {(analysis.next_actions || []).map((item) => (
                <div key={item}>- {item}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
