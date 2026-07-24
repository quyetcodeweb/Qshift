import { useEffect, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { getRole } from "../utils/auth";

function welcomeMessage(isAdmin) {
  return isAdmin
    ? {
        role: "assistant",
        content:
          "Mình là QQ. Bạn có thể tra cứu dữ liệu vận hành toàn hệ thống: nhân sự, lịch, chấm công, lương và các yêu cầu nghiệp vụ.",
        followups: ["Hãy thử một câu hỏi gợi ý bên dưới."],
      }
    : {
        role: "assistant",
        content:
          "Mình là QQ, trợ lý cá nhân của bạn. Mình chỉ tra cứu lịch, chấm công và yêu cầu gắn với tài khoản của bạn.",
        followups: ["Thông tin nhân sự, lương và dữ liệu quản trị không hiển thị trong chat này."],
      };
}

const QUICK_PROMPTS = {
  admin: [
    "Hôm nay có gì cần xử lý?",
    "Ai làm nhiều ca nhất tháng này?",
    "Ca nào đang có nhiều nhân sự nhất?",
    "Tóm tắt bảng lương gần đây",
  ],
  employee: [
    "Hôm nay tôi làm ca nào?",
    "Hiện tại tôi có đang trong ca không?",
    "Tình hình chấm công hôm nay của tôi thế nào?",
    "Tôi có yêu cầu nào đang chờ xử lý không?",
  ],
};

const LAUNCHER_POSITION_KEY = "qshift:qq-launcher-position";

function readLauncherPosition() {
  try {
    const value = JSON.parse(localStorage.getItem(LAUNCHER_POSITION_KEY));
    if (Number.isFinite(value?.left) && Number.isFinite(value?.top)) {
      return {
        left: clamp(value.left, 8, Math.max(8, window.innerWidth - 56)),
        top: clamp(value.top, 8, Math.max(8, window.innerHeight - 56)),
      };
    }
  } catch {
    // Use the default launcher position when the saved value is unavailable.
  }
  return null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AiManagerChat() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const messageEndRef = useRef(null);
  const dragStateRef = useRef(null);
  const suppressLauncherClickRef = useRef(false);
  const role = getRole();
  const isAdmin = role === "ADMIN";
  const isEmployee = role === "EMPLOYEE";
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState(() => [welcomeMessage(isAdmin)]);
  const [launcherPosition, setLauncherPosition] = useState(readLauncherPosition);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [busy, items]);

  if (!isAdmin && !isEmployee) return null;

  const focusComposer = () => window.setTimeout(() => inputRef.current?.focus(), 0);

  const sendMessage = async () => {
    const text = message.trim();
    if (!text || busy) return;

    const nextItems = [...items, { role: "user", content: text }];
    setItems(nextItems);
    setMessage("");
    setBusy(true);

    try {
      const res = await api.post(
        isAdmin ? "/ai/manager-chat" : "/ai/employee-chat",
        {
          message: text,
          history: nextItems.slice(-6).map(({ role, content }) => ({ role, content })),
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
          dataSources: data.data_sources || [],
        },
      ]);
    } catch (error) {
      setItems((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error.response?.data?.message ||
            "QQ chưa thể truy xuất dữ liệu lúc này. Vui lòng thử lại.",
        },
      ]);
    } finally {
      setBusy(false);
      focusComposer();
    }
  };

  const askQuickPrompt = (prompt) => {
    setMessage(prompt);
    focusComposer();
  };

  const runAction = (action) => {
    if (!action) return;

    if (action.type === "navigate" && action.path) {
      navigate(action.path);
      setOpen(false);
      return;
    }

    if (action.type === "prompt" && action.prompt) {
      askQuickPrompt(action.prompt);
    }
  };

  const resetConversation = () => {
    setItems([welcomeMessage(isAdmin)]);
    setMessage("");
    focusComposer();
  };

  const handleLauncherPointerDown = (event) => {
    if (open || event.button !== 0) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: bounds.left,
      startTop: bounds.top,
      width: bounds.width,
      height: bounds.height,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleLauncherPointerMove = (event) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) < 5) return;

    drag.moved = true;
    setDragging(true);
    setLauncherPosition({
      left: clamp(drag.startLeft + deltaX, 8, window.innerWidth - drag.width - 8),
      top: clamp(drag.startTop + deltaY, 8, window.innerHeight - drag.height - 8),
    });
  };

  const finishLauncherDrag = (event) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.moved) {
      suppressLauncherClickRef.current = true;
      const position = {
        left: clamp(drag.startLeft + event.clientX - drag.startX, 8, window.innerWidth - drag.width - 8),
        top: clamp(drag.startTop + event.clientY - drag.startY, 8, window.innerHeight - drag.height - 8),
      };
      setLauncherPosition(position);
      localStorage.setItem(LAUNCHER_POSITION_KEY, JSON.stringify(position));
    }
    dragStateRef.current = null;
    setDragging(false);
  };

  const handleLauncherClick = () => {
    if (suppressLauncherClickRef.current) {
      suppressLauncherClickRef.current = false;
      return;
    }
    setOpen((value) => !value);
    if (!open) focusComposer();
  };

  const useMovedLauncherPosition = Boolean(launcherPosition) && !open;
  const safeLauncherPosition = launcherPosition
    ? {
        left: clamp(launcherPosition.left, 8, Math.max(8, window.innerWidth - 56)),
        top: clamp(launcherPosition.top, 8, Math.max(8, window.innerHeight - 56)),
      }
    : undefined;

  return (
    <div
      className={`fixed z-40 ${useMovedLauncherPosition ? "" : "bottom-20 right-4 md:bottom-6"}`}
      style={useMovedLauncherPosition ? safeLauncherPosition : undefined}
    >
      {open && (
        <section
          className="ai-panel-enter mb-2 flex h-[min(600px,calc(100dvh-9.5rem))] w-[min(calc(100vw-1.5rem),440px)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_24px_70px_rgba(17,24,39,0.18)] sm:mb-3 sm:w-[min(calc(100vw-2rem),440px)] sm:rounded-2xl md:h-[min(680px,calc(100dvh-7rem))]"
          aria-label="Trợ lý QQ"
        >
          <header className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3.5">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-white shadow-lg shadow-blue-700/20 sm:h-10 sm:w-10 sm:rounded-xl">
                <SparklesIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold tracking-tight text-gray-950">
                  QQ · {isAdmin ? "Trợ lý quản trị" : "Trợ lý cá nhân"}
                </h2>
                <p className="mt-0.5 hidden text-xs font-medium text-gray-500 sm:block">
                  {isAdmin ? "Phân tích dựa trên dữ liệu Qshift" : "Chỉ tra cứu thông tin của bạn"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={resetConversation}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                aria-label="Tạo cuộc trò chuyện mới"
                title="Tạo cuộc trò chuyện mới"
              >
                <ArrowPathIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                aria-label="Đóng chat AI"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gray-50/80 p-3 sm:space-y-4 sm:p-4">
            {items.map((item, index) => (
              <article
                key={`${item.role}-${index}`}
                className={`ai-message-enter max-w-[92%] rounded-xl px-3 py-2.5 text-[13px] leading-5 shadow-sm sm:rounded-2xl sm:px-3.5 sm:py-3 sm:text-sm sm:leading-6 ${
                  item.role === "user"
                    ? "ml-auto rounded-br-md bg-blue-700 font-medium text-white"
                    : "mr-auto rounded-bl-md border border-gray-200 bg-white text-gray-800"
                }`}
              >
                {item.role === "assistant" && (
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">
                    QQ
                  </div>
                )}
                <div className="whitespace-pre-wrap">{item.content}</div>

                {item.highlights?.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-xs font-medium leading-5 text-gray-700">
                    {item.highlights.map((line) => (
                      <li key={line} className="flex gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-blue-600" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {item.dataSources?.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Dữ liệu đã kiểm tra</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.dataSources.map((source) => (
                        <span
                          key={source.key || source.label}
                          className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600"
                        >
                          {source.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {item.followups?.length > 0 && (
                  <div className="mt-3 space-y-1 text-xs font-medium leading-5 text-gray-500">
                    {item.followups.map((line) => (
                      <p key={line}>Gợi ý: {line}</p>
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
                        className="inline-flex min-h-8 items-center rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800 transition hover:border-blue-300 hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        title={action.description || action.label}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}

            {items.length === 1 && !busy && (
              <div className="space-y-2 pt-1">
                <p className="px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Câu hỏi gợi ý</p>
                <div className="flex flex-wrap gap-2">
                  {(isAdmin ? QUICK_PROMPTS.admin : QUICK_PROMPTS.employee).map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => askQuickPrompt(prompt)}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-xs font-semibold leading-5 text-gray-700 transition hover:border-blue-300 hover:text-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {busy && (
              <div className="ai-message-enter mr-auto flex items-center gap-2 rounded-2xl rounded-bl-md border border-gray-200 bg-white px-3.5 py-3 text-xs font-semibold text-gray-500 shadow-sm">
                <span className="flex gap-1" aria-hidden="true">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-600 [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-600 [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-600" />
                </span>
                Đang phân tích dữ liệu…
              </div>
            )}
            <div ref={messageEndRef} />
          </div>

          <footer className="border-t border-gray-200 bg-white p-2.5 sm:p-3">
            <div className="flex items-end gap-2 rounded-xl border border-gray-300 bg-white p-1.5 transition focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100">
              <textarea
                ref={inputRef}
                rows="1"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={isAdmin ? "Hỏi về lịch, nhân sự hoặc chấm công…" : "Hỏi về lịch hoặc chấm công của bạn…"}
                className="max-h-24 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm font-medium leading-5 text-gray-900 outline-none placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={busy || !message.trim()}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-white transition hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Gửi câu hỏi AI"
              >
                <PaperAirplaneIcon className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 hidden px-1 text-[11px] font-medium text-gray-400 sm:block">Enter để gửi · Shift + Enter để xuống dòng</p>
          </footer>
        </section>
      )}

      <button
        type="button"
        onClick={handleLauncherClick}
        onPointerDown={handleLauncherPointerDown}
        onPointerMove={handleLauncherPointerMove}
        onPointerUp={finishLauncherDrag}
        onPointerCancel={finishLauncherDrag}
        className={`ai-float relative flex h-11 w-11 touch-none items-center justify-center rounded-full bg-blue-700 text-white shadow-xl shadow-blue-950/20 transition duration-300 hover:bg-blue-800 hover:shadow-2xl hover:shadow-blue-950/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 md:h-12 md:w-12 ${
          !open ? "cursor-grab active:cursor-grabbing" : ""
        } ${dragging ? "scale-95" : ""}`}
        aria-label="Mở QQ"
      >
        <ChatBubbleLeftRightIcon className={`h-6 w-6 transition duration-300 ${open ? "rotate-12 scale-110" : ""}`} />
      </button>
    </div>
  );
}
