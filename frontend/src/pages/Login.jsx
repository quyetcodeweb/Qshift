import { useState } from "react";
import axios from "axios";
import {
  ArrowRightIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { API_URL } from "../services/api";

function loginErrorMessage(error) {
  const status = Number(error.response?.status || 0);
  const rawMessage = String(
    error.response?.data?.message || error.response?.data?.detail || error.message || "",
  ).toLowerCase();

  if (
    status === 400 ||
    status === 401 ||
    rawMessage.includes("user not found") ||
    rawMessage.includes("wrong password") ||
    rawMessage.includes("missing data")
  ) {
    return "Tên đăng nhập hoặc mật khẩu không đúng.";
  }

  if (status === 403 || rawMessage.includes("vô hiệu hóa")) {
    return "Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.";
  }

  if (!error.response || status >= 500 || /econn|enotfound|socket|database|sql|jwt|read /.test(rawMessage)) {
    return "Lỗi hệ thống. Vui lòng thử lại sau hoặc liên hệ quản trị viên.";
  }

  return "Không thể đăng nhập. Vui lòng thử lại.";
}

export default function Login() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (error) setError("");
  };

  const handleLogin = async () => {
    if (!form.username.trim() || !form.password) {
      setError("Vui lòng nhập tên đăng nhập và mật khẩu.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const res = await axios.post(`${API_URL}/auth/login`, {
        username: form.username.trim(),
        password: form.password,
      });

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      window.location.href = "/";
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gray-50 px-4 py-6 sm:px-6 lg:p-8">
      <div className="pointer-events-none absolute -left-20 top-16 h-64 w-64 rounded-full bg-blue-100/70 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-sky-100/70 blur-3xl" />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[0_24px_64px_rgba(30,64,175,0.12)] lg:grid-cols-[0.92fr_1.08fr]">
        <section className="relative hidden overflow-hidden border-r border-blue-100 bg-blue-50 p-9 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute left-0 top-0 h-full w-1 bg-blue-700" />
          <div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-white/80 px-3 py-2 text-xs font-extrabold tracking-[0.08em] text-blue-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              CỔNG VẬN HÀNH
            </div>
            <h1 className="mt-8 max-w-sm text-4xl font-black leading-tight tracking-tight text-gray-950">
              Quản lý ca làm với thông tin luôn rõ ràng.
            </h1>
            <p className="mt-4 max-w-sm text-sm font-medium leading-6 text-gray-600">
              Đăng nhập để tiếp tục theo dõi lịch làm, nhân sự và các công việc vận hành của bạn.
            </p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-white/80 p-4">
            <div className="text-xs font-extrabold uppercase tracking-[0.1em] text-blue-700">Qshift</div>
            <div className="mt-1 text-sm font-semibold leading-6 text-gray-700">Một nơi làm việc gọn gàng cho lịch, chấm công và phối hợp đội ngũ.</div>
          </div>
        </section>

        <section className="flex min-h-[calc(100dvh-3rem)] flex-col justify-center px-5 py-8 sm:px-10 lg:min-h-0 lg:px-12 lg:py-12">
          <div className="mx-auto w-full max-w-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-[0_10px_24px_rgba(29,78,216,0.28)]">
              <LockClosedIcon className="h-6 w-6" />
            </div>
            <h2 className="mt-6 text-3xl font-black tracking-tight text-gray-950">Đăng nhập</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-gray-600">Nhập thông tin tài khoản để vào không gian làm việc của bạn.</p>

            <form className="mt-8 space-y-5" onSubmit={(event) => { event.preventDefault(); handleLogin(); }}>
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-800"><UserCircleIcon className="h-4 w-4 text-blue-700" />Tên đăng nhập</span>
                <input
                  value={form.username}
                  onChange={(event) => updateField("username", event.target.value)}
                  autoComplete="username"
                  placeholder="Nhập tên đăng nhập"
                  className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-950 outline-none transition placeholder:font-medium placeholder:text-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                />
              </label>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-800"><LockClosedIcon className="h-4 w-4 text-blue-700" />Mật khẩu</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => updateField("password", event.target.value)}
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu"
                  className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-950 outline-none transition placeholder:font-medium placeholder:text-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                />
              </label>

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-semibold leading-5 text-rose-800">
                  <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-blue-800 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-65">
                {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />Đang đăng nhập...</> : <>Đăng nhập<ArrowRightIcon className="h-4 w-4" /></>}
              </button>
            </form>

            <p className="mt-4 flex items-center gap-2 text-xs font-medium text-gray-500"><ClockIcon className="h-4 w-4 text-blue-600" />Nếu chờ lâu hãy kiên nhẫn nhé!!</p>
          </div>
        </section>
      </div>
    </main>
  );
}
