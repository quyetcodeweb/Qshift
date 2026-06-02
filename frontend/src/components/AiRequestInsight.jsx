import { useState } from "react";
import { SparklesIcon } from "@heroicons/react/24/outline";
import api from "../services/api";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const recommendationLabel = {
  approve: "Nên duyệt",
  reject: "Nên từ chối",
  remind: "Nên nhắc nhở",
  needs_review: "Cần xem lại",
  no_action: "Không cần xử lý",
};

export default function AiRequestInsight({ request }) {
  const [open, setOpen] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const analyze = async () => {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const res = await api.post(
        "/ai/request-analysis",
        { request },
        { headers: authHeaders() },
      );
      setAnalysis(res.data || null);
    } catch (err) {
      setError(
        err.response?.data?.message || "Không thể phân tích yêu cầu bằng AI.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-indigo-100 bg-indigo-50/50 p-3">
      <button
        type="button"
        onClick={analyze}
        disabled={loading}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60"
      >
        <SparklesIcon className="h-4 w-4" />
        {loading ? "AI đang phân tích..." : "AI gợi ý xử lý"}
      </button>

      {open && (
        <div className="mt-3 rounded-md border border-indigo-100 bg-white p-3 text-sm">
          {error ? (
            <div className="font-bold text-red-700">{error}</div>
          ) : loading ? (
            <div className="font-bold text-slate-500">
              Đang kiểm tra trạng thái và rủi ro...
            </div>
          ) : analysis ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-indigo-100 px-2 py-1 text-xs font-black uppercase text-indigo-800">
                  {recommendationLabel[analysis.recommendation] ||
                    analysis.recommendation}
                </span>
                <span className="text-xs font-bold text-slate-500">
                  Độ tin cậy: {analysis.confidence}
                </span>
              </div>
              <div className="font-semibold leading-6 text-slate-800">
                {analysis.summary}
              </div>
              {analysis.risks?.length > 0 && (
                <div>
                  <div className="text-xs font-black uppercase text-slate-500">
                    Rủi ro
                  </div>
                  <div className="mt-1 space-y-1 font-semibold text-slate-700">
                    {analysis.risks.map((item) => (
                      <div key={item}>- {item}</div>
                    ))}
                  </div>
                </div>
              )}
              {analysis.checklist?.length > 0 && (
                <div>
                  <div className="text-xs font-black uppercase text-slate-500">
                    Checklist
                  </div>
                  <div className="mt-1 space-y-1 font-semibold text-slate-700">
                    {analysis.checklist.map((item) => (
                      <div key={item}>- {item}</div>
                    ))}
                  </div>
                </div>
              )}
              {analysis.suggested_reply && (
                <div className="rounded-md bg-slate-50 p-2 font-semibold leading-6 text-slate-700">
                  Phản hồi gợi ý: {analysis.suggested_reply}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
