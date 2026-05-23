import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion as Motion } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Info,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";

const DEFAULT_DURATION = 5200;
const MAX_TOASTS = 5;

const typeConfig = {
  success: {
    icon: CheckCircle2,
    label: "Thành công",
    accent: "#059669",
    accentSoft: "#ecfdf5",
    accentBorder: "#a7f3d0",
    accentText: "#047857",
    accentTrack: "#d1fae5",
  },
  error: {
    icon: XCircle,
    label: "Lỗi",
    accent: "#dc2626",
    accentSoft: "#fef2f2",
    accentBorder: "#fecaca",
    accentText: "#b91c1c",
    accentTrack: "#fee2e2",
  },
  warning: {
    icon: AlertTriangle,
    label: "Cảnh báo",
    accent: "#d97706",
    accentSoft: "#fffbeb",
    accentBorder: "#fde68a",
    accentText: "#b45309",
    accentTrack: "#fef3c7",
  },
  info: {
    icon: Info,
    label: "Thông tin",
    accent: "#0284c7",
    accentSoft: "#f0f9ff",
    accentBorder: "#bae6fd",
    accentText: "#0369a1",
    accentTrack: "#e0f2fe",
  },
  default: {
    icon: Bell,
    label: "Thông báo",
    accent: "#7c3aed",
    accentSoft: "#f5f3ff",
    accentBorder: "#ddd6fe",
    accentText: "#6d28d9",
    accentTrack: "#ede9fe",
  },
};

function guessType(message, requestedType) {
  if (requestedType && typeConfig[requestedType]) return requestedType;

  const text = String(message || "").toLowerCase();
  if (text.includes("lỗi") || text.includes("không thể") || text.includes("thất bại")) return "error";
  if (text.includes("vui lòng") || text.includes("cảnh báo") || text.includes("sắp")) return "warning";
  if (text.includes("đã") || text.includes("thành công") || text.includes("hoàn tất")) return "success";
  return "default";
}

function defaultTitle(type) {
  if (type === "error") return "Có lỗi xảy ra";
  if (type === "warning") return "Cần chú ý";
  return typeConfig[type]?.label || "Thông báo";
}

function normalizeToast(input) {
  if (typeof input === "object" && input !== null) {
    const message = input.message || input.title || "";
    const type = guessType(message, input.type);
    return {
      id: input.id || Date.now() + Math.random(),
      type,
      title: input.title || defaultTitle(type),
      message: input.message || "",
      duration: input.duration ?? DEFAULT_DURATION,
      action: input.action,
    };
  }

  const message = String(input ?? "");
  const type = guessType(message);
  return {
    id: Date.now() + Math.random(),
    type,
    title: defaultTitle(type),
    message,
    duration: DEFAULT_DURATION,
  };
}

function normalizeConfirm(input) {
  if (typeof input === "object" && input !== null) {
    const message = input.message || "";
    const type = guessType(message || input.title, input.type || "warning");
    return {
      title: input.title || "Xác nhận thao tác",
      message,
      type,
      confirmText: input.confirmText || "Xác nhận",
      cancelText: input.cancelText || "Hủy",
      resolve: input.resolve,
    };
  }

  return {
    title: "Xác nhận thao tác",
    message: String(input ?? ""),
    type: "warning",
    confirmText: "Xác nhận",
    cancelText: "Hủy",
  };
}

function NotificationItem({ toast, onDismiss }) {
  const cfg = typeConfig[toast.type] || typeConfig.default;
  const Icon = cfg.icon;
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const start = Date.now();
    const duration = Math.max(toast.duration || DEFAULT_DURATION, 800);
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) window.clearInterval(interval);
    }, 24);
    const timer = window.setTimeout(() => onDismiss(toast.id), duration);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timer);
    };
  }, [onDismiss, toast.duration, toast.id]);

  return (
    <Motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.16 } }}
      transition={{ type: "spring", stiffness: 430, damping: 34 }}
      className="w-full max-w-[380px] overflow-hidden rounded-2xl border bg-white shadow-xl shadow-slate-950/10"
      style={{ borderColor: cfg.accentBorder }}
      role="status"
    >
      <div className="flex gap-3 px-4 pb-3 pt-4">
        <div
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: cfg.accentSoft }}
        >
          <Icon className="h-5 w-5" style={{ color: cfg.accent }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-sm font-bold leading-snug text-slate-950">
              {toast.title}
            </p>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-black"
              style={{ backgroundColor: cfg.accentSoft, color: cfg.accentText }}
            >
              {cfg.label}
            </span>
          </div>
          {toast.message && (
            <p className="mt-1 whitespace-pre-line text-xs font-medium leading-5 text-slate-500">
              {toast.message}
            </p>
          )}
          {toast.action?.label && (
            <button
              type="button"
              onClick={toast.action.onClick}
              className="mt-2.5 inline-flex items-center gap-1 text-xs font-black transition hover:opacity-75"
              style={{ color: cfg.accentText }}
            >
              {toast.action.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Đóng thông báo"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="h-[3px] w-full" style={{ backgroundColor: cfg.accentTrack }}>
        <Motion.div
          className="h-full rounded-full"
          style={{ width: `${progress}%`, backgroundColor: cfg.accent }}
        />
      </div>
    </Motion.div>
  );
}

function NotificationStack({ toasts, onDismiss }) {
  return (
    <div className="fixed right-3 top-3 z-[10000] flex w-[calc(100vw-1.5rem)] max-w-[380px] flex-col items-end gap-2.5 sm:right-4 sm:top-4 sm:w-auto">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <NotificationItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ConfirmDialog({ confirm, onClose }) {
  const cfg = typeConfig[confirm?.type] || typeConfig.warning;
  const Icon = confirm?.type === "warning" ? Sparkles : ShieldCheck;

  return (
    <AnimatePresence>
      {confirm && (
        <Motion.div
          className="fixed inset-0 z-[10001] flex items-end justify-center bg-slate-950/35 p-3 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <Motion.div
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className="w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-2xl shadow-slate-950/20"
            style={{ borderColor: cfg.accentBorder }}
          >
            <div className="flex gap-3 px-4 pb-4 pt-5 sm:px-5">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: cfg.accentSoft }}
              >
                <Icon className="h-6 w-6" style={{ color: cfg.accent }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-black text-slate-950">{confirm.title}</div>
                <div className="mt-1 whitespace-pre-line text-sm font-medium leading-6 text-slate-600">
                  {confirm.message}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onClose(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Đóng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => onClose(false)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                {confirm.cancelText}
              </button>
              <button
                type="button"
                onClick={() => onClose(true)}
                className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-black text-white transition hover:brightness-95"
                style={{ backgroundColor: cfg.accent }}
              >
                {confirm.confirmText}
              </button>
            </div>
          </Motion.div>
        </Motion.div>
      )}
    </AnimatePresence>
  );
}

export default function AppPopupProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmQueue, setConfirmQueue] = useState([]);
  const nativeAlertRef = useRef(null);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((input) => {
    const nextToast = normalizeToast(input);
    setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), nextToast]);
    return nextToast.id;
  }, []);

  const currentConfirm = confirmQueue[0] || null;

  const closeConfirm = useCallback(
    (value) => {
      if (currentConfirm?.resolve) currentConfirm.resolve(value);
      setConfirmQueue((current) => current.slice(1));
    },
    [currentConfirm],
  );

  const api = useMemo(
    () => ({
      notify: pushToast,
      confirm: (input) =>
        new Promise((resolve) => {
          setConfirmQueue((current) => [
            ...current,
            normalizeConfirm({ ...normalizeConfirm(input), resolve }),
          ]);
        }),
    }),
    [pushToast],
  );

  useEffect(() => {
    nativeAlertRef.current = window.alert;

    window.appPopup = api.notify;
    window.appConfirm = api.confirm;
    window.alert = (message) => {
      api.notify(message);
    };

    return () => {
      if (nativeAlertRef.current) window.alert = nativeAlertRef.current;
      delete window.appPopup;
      delete window.appConfirm;
    };
  }, [api]);

  return (
    <>
      {children}
      <NotificationStack toasts={toasts} onDismiss={dismissToast} />
      <ConfirmDialog confirm={currentConfirm} onClose={closeConfirm} />
    </>
  );
}
