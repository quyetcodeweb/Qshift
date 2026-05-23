import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  QuestionMarkCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

const alertTone = {
  success: {
    icon: CheckCircleIcon,
    ring: "ring-emerald-100",
    iconBox: "bg-emerald-50 text-emerald-700",
    button: "bg-emerald-600 hover:bg-emerald-700",
  },
  error: {
    icon: XCircleIcon,
    ring: "ring-red-100",
    iconBox: "bg-red-50 text-red-700",
    button: "bg-red-600 hover:bg-red-700",
  },
  warning: {
    icon: ExclamationTriangleIcon,
    ring: "ring-amber-100",
    iconBox: "bg-amber-50 text-amber-700",
    button: "bg-amber-600 hover:bg-amber-700",
  },
  info: {
    icon: InformationCircleIcon,
    ring: "ring-blue-100",
    iconBox: "bg-blue-50 text-blue-700",
    button: "bg-blue-600 hover:bg-blue-700",
  },
};

function guessTone(message, requestedType) {
  if (requestedType) return requestedType;

  const text = String(message || "").toLowerCase();
  if (text.includes("lỗi") || text.includes("không thể") || text.includes("thất bại")) return "error";
  if (text.includes("vui lòng") || text.includes("cảnh báo")) return "warning";
  if (text.includes("đã") || text.includes("thành công")) return "success";
  return "info";
}

function normalizePopup(input, fallbackType = "info") {
  if (typeof input === "object" && input !== null) {
    const type = input.type || guessTone(input.message || input.title) || fallbackType;
    return {
      title: input.title || "Thông báo",
      message: input.message || "",
      type,
      confirmText: input.confirmText || "Đã hiểu",
      cancelText: input.cancelText || "Hủy",
      mode: input.mode || "alert",
      resolve: input.resolve,
    };
  }

  const message = String(input ?? "");
  return {
    title: guessTone(message) === "error" ? "Có lỗi xảy ra" : "Thông báo",
    message,
    type: guessTone(message) || fallbackType,
    confirmText: "Đã hiểu",
    cancelText: "Hủy",
    mode: "alert",
  };
}

function PopupDialog({ popup, onClose, onConfirm, onCancel }) {
  if (!popup) return null;

  const tone = alertTone[popup.type] || alertTone.info;
  const ToneIcon = popup.mode === "confirm" ? QuestionMarkCircleIcon : tone.icon;

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-slate-950/35 p-3 backdrop-blur-sm sm:items-center">
      <div
        className={`w-full max-w-md rounded-md border border-slate-200 bg-white shadow-2xl ring-4 ${tone.ring}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3 p-4 sm:p-5">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${tone.iconBox}`}>
            <ToneIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-black text-slate-950">{popup.title}</div>
            <div className="mt-1 whitespace-pre-line text-sm font-medium leading-6 text-slate-600">
              {popup.message}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 p-4 sm:flex-row sm:justify-end">
          {popup.mode === "confirm" && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              {popup.cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-bold text-white transition ${tone.button}`}
          >
            {popup.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppPopupProvider({ children }) {
  const [queue, setQueue] = useState([]);
  const nativeAlertRef = useRef(null);

  const pushPopup = useCallback((input, fallbackType) => {
    setQueue((current) => [...current, normalizePopup(input, fallbackType)]);
  }, []);

  const current = queue[0] || null;

  const closeCurrent = useCallback(
    (value) => {
      if (current?.resolve) current.resolve(value);
      setQueue((items) => items.slice(1));
    },
    [current],
  );

  useEffect(() => {
    nativeAlertRef.current = window.alert;

    window.appPopup = (input) => pushPopup(input, "info");
    window.appConfirm = (input) =>
      new Promise((resolve) => {
        setQueue((currentQueue) => [
          ...currentQueue,
          normalizePopup({ ...normalizePopup(input, "warning"), mode: "confirm", resolve }, "warning"),
        ]);
      });
    window.alert = (message) => {
      pushPopup(message, "info");
    };

    return () => {
      if (nativeAlertRef.current) window.alert = nativeAlertRef.current;
      delete window.appPopup;
      delete window.appConfirm;
    };
  }, [pushPopup]);

  return (
    <>
      {children}
      <PopupDialog
        popup={current}
        onClose={() => closeCurrent(false)}
        onCancel={() => closeCurrent(false)}
        onConfirm={() => closeCurrent(true)}
      />
    </>
  );
}
