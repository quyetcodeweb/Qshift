import { useState } from "react";
import {
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { getRole } from "../utils/auth";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AiManagerChat() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState([
    {
      role: "assistant",
      content: "Mình là QQ, AI quản lý Qshift. Bạn có thể hỏi nhanh về lịch, chấm công, nhân sự hoặc các yêu cầu đang chờ xử lý.",
    },
  ]);

  if (getRole() !== "ADMIN") return null;

  const sendMessage = async () => {
    const text = message.trim();
    if (!text || busy) return;

    const nextItems = [...items, { role: "user", content: text }];
    setItems(nextItems);
    setMessage("");
    setBusy(true);

    try {
      const res = await api.post(
        "/ai/manager-chat",
        {
          message: text,
          history: nextItems.slice(-6),
        },
        { headers: authHeaders() },
      );
      const data = res.data || {};
      setItems((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer || "QQ chưa có phản hồi phù hợp.",
          highlights: data.highlights || [],
          followups: data.followups || [],
          actions: data.actions || [],
        },
      ]);
    } catch (error) {
      setItems((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error.response?.data?.message ||
            "QQ chưa thể phản hồi lúc này.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const runAction = (action) => {
    if (!action) return;

    if (action.type === "navigate" && action.path) {
      navigate(action.path);
      setOpen(false);
      return;
    }

    if (action.type === "prompt" && action.prompt) {
      setMessage(action.prompt);
    }
  };

  return (
    <div className="fixed bottom-20 right-4 z-40 md:bottom-6">
      {open && (
        <div className="ai-panel-enter mb-3 flex h-[520px] w-[min(calc(100vw-2rem),380px)] flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-2xl shadow-slate-950/20">
          <div className="ai-shimmer relative flex items-center justify-between overflow-hidden border-b border-slate-100 px-4 py-3 after:pointer-events-none after:absolute after:inset-y-0 after:w-24 after:bg-gradient-to-r after:from-transparent after:via-indigo-100/70 after:to-transparent">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-white shadow-lg shadow-indigo-600/20">
                <SparklesIcon className="h-4 w-4 animate-pulse" />
              </span>
              <div>
                <div className="text-sm font-black text-slate-950">
                  QQ
                </div>
                <div className="text-xs font-semibold text-slate-500">
                  AI quản lý Qshift
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Đóng chat AI"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
            {items.map((item, index) => (
              <div
                key={`${item.role}-${index}`}
                className={`ai-message-enter rounded-md px-3 py-2 text-sm font-medium leading-6 shadow-sm transition duration-200 hover:-translate-y-0.5 ${
                  item.role === "user"
                    ? "ml-8 bg-indigo-600 text-white"
                    : "mr-8 border border-slate-200 bg-white text-slate-800"
                }`}
              >
                <div className="whitespace-pre-wrap">{item.content}</div>
                {item.highlights?.length > 0 && (
                  <div className="mt-2 border-t border-slate-100 pt-2 text-xs font-bold text-slate-600">
                    {item.highlights.map((line) => (
                      <div key={line}>- {line}</div>
                    ))}
                  </div>
                )}
                {item.followups?.length > 0 && (
                  <div className="mt-2 text-xs font-semibold text-slate-500">
                    {item.followups.map((line) => (
                      <div key={line}>Gợi ý: {line}</div>
                    ))}
                  </div>
                )}
                {item.actions?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.actions.map((action, actionIndex) => (
                      <button
                        key={`${action.label}-${actionIndex}`}
                        type="button"
                        onClick={() => runAction(action)}
                        className="inline-flex min-h-8 items-center rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-700 transition duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-100 hover:shadow-md hover:shadow-indigo-950/10"
                        title={action.description || action.label}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="ai-message-enter ai-busy-bubble mr-8 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-500 shadow-sm">
                AI đang phân tích...
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 bg-white p-3">
            <div className="flex gap-2">
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") sendMessage();
                }}
                placeholder="Ví dụ: Ai đang làm nhiều ca nhất?"
                className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-indigo-600"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={busy || !message.trim()}
                className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-600 text-white transition duration-200 hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-950/20 disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
                aria-label="Gửi câu hỏi AI"
              >
                <PaperAirplaneIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="ai-float ai-ring-pulse relative flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xl shadow-indigo-950/20 transition duration-300 before:absolute before:inset-0 before:rounded-full before:border before:border-indigo-300 hover:bg-indigo-700 hover:shadow-2xl hover:shadow-indigo-950/30"
        aria-label="Mở QQ"
      >
        <ChatBubbleLeftRightIcon
          className={`h-6 w-6 transition duration-300 ${open ? "rotate-12 scale-110" : ""}`}
        />
      </button>
    </div>
  );
}
