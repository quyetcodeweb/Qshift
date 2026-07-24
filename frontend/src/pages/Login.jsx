import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRightIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { API_URL } from "../services/api";
import loginIllustration from "../assets/imagelogin.png";
import loginIllustrationReplacement from "../assets/imageloginreplace.png";

const SECRET_TAP_COUNT = 15;
const SECRET_TAP_WINDOW_MS = 8000;
const PARTICLES_PER_TAP = 4;
const MAX_ACTIVE_PARTICLES = 64;
const PARTICLE_LIFETIME_MS = 1220;
const REPLACEMENT_BURST_COUNT = 10;
const MotionImage = motion.img;

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
  const [illustrationParticles, setIllustrationParticles] = useState([]);
  const [isIllustrationReplaced, setIsIllustrationReplaced] = useState(false);
  const tapTimesRef = useRef([]);
  const particleIdRef = useRef(0);
  const particleTimersRef = useRef(new Set());
  const hasReplacedIllustrationRef = useRef(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => () => {
    particleTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (error) setError("");
  };

  const spawnIllustrationParticles = (particles) => {
    setIllustrationParticles((current) => [...current, ...particles].slice(-MAX_ACTIVE_PARTICLES));
    particles.forEach((particle) => {
      const timer = window.setTimeout(() => {
        particleTimersRef.current.delete(timer);
        setIllustrationParticles((current) => current.filter((item) => item.id !== particle.id));
      }, PARTICLE_LIFETIME_MS);
      particleTimersRef.current.add(timer);
    });
  };

  const handleIllustrationClick = (event) => {
    if (hasReplacedIllustrationRef.current) return;

    const now = Date.now();
    const imageBounds = event.currentTarget.getBoundingClientRect();
    const isKeyboardClick = event.detail === 0;
    const clickX = isKeyboardClick ? imageBounds.left + imageBounds.width / 2 : event.clientX;
    const clickY = isKeyboardClick ? imageBounds.top + imageBounds.height / 2 : event.clientY;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const originX = Math.min(viewportWidth - 6, Math.max(6, clickX));
    const originY = Math.min(viewportHeight - 6, Math.max(6, clickY));
    const horizontalTravel = Math.max(680, viewportWidth * 0.92);
    const verticalTravel = Math.max(480, viewportHeight * 0.78);
    tapTimesRef.current = tapTimesRef.current.filter((time) => now - time < SECRET_TAP_WINDOW_MS);
    tapTimesRef.current.push(now);

    if (!reduceMotion) {
      const particles = Array.from({ length: PARTICLES_PER_TAP }, () => ({
        id: particleIdRef.current += 1,
        originX: Math.min(viewportWidth - 6, Math.max(6, originX + (Math.random() - 0.5) * 20)),
        originY: Math.min(viewportHeight - 6, Math.max(6, originY + (Math.random() - 0.5) * 20)),
        offsetX: Math.round((Math.random() - 0.24) * horizontalTravel),
        offsetY: Math.round((Math.random() - 0.52) * verticalTravel),
        rotation: Math.round((Math.random() - 0.5) * 220),
        size: 56 + Math.round(Math.random() * 32),
      }));
      spawnIllustrationParticles(particles);
    }

    if (tapTimesRef.current.length >= SECRET_TAP_COUNT) {
      hasReplacedIllustrationRef.current = true;
      tapTimesRef.current = [];

      if (!reduceMotion) {
        const burstOriginX = imageBounds.left + imageBounds.width / 2;
        const burstOriginY = imageBounds.top + imageBounds.height / 2;
        const burstDistance = Math.max(280, Math.max(viewportWidth, viewportHeight) * 0.46);
        const replacementParticles = Array.from({ length: REPLACEMENT_BURST_COUNT }, (_, index) => {
          const angle = ((Math.PI * 2 * index) / REPLACEMENT_BURST_COUNT) + (Math.random() - 0.5) * 0.18;
          const distance = burstDistance * (0.72 + Math.random() * 0.28);

          return {
            id: particleIdRef.current += 1,
            originX: burstOriginX,
            originY: burstOriginY,
            offsetX: Math.round(Math.cos(angle) * distance),
            offsetY: Math.round(Math.sin(angle) * distance),
            rotation: Math.round((Math.random() - 0.5) * 300),
            size: 54 + Math.round(Math.random() * 26),
          };
        });
        spawnIllustrationParticles(replacementParticles);
      }

      setIsIllustrationReplaced(true);
    }
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
        <section className="relative hidden min-h-[38rem] overflow-hidden border-r border-blue-100 bg-blue-50 lg:flex lg:flex-col">
          <div className="relative z-10 px-9 pt-9">
            <div className="text-[5.8rem] font-black leading-[0.84] tracking-[-0.1em] text-gray-950 xl:text-[6.75rem]">
              <span className="text-blue-700">Q</span><span>Shift</span>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 top-48 overflow-hidden bg-white">
              <img
                src={loginIllustration}
                alt="Khoảnh khắc vui vẻ của đội ngũ QShift"
                className="block h-full w-full object-cover object-center"
              />
              <button
                type="button"
                onClick={handleIllustrationClick}
                disabled={isIllustrationReplaced}
                aria-label={isIllustrationReplaced ? "Ảnh minh họa QShift" : "Ảnh minh họa QShift, bấm để tương tác"}
                className="absolute inset-0 block h-full w-full cursor-pointer overflow-hidden border-0 bg-transparent p-0 text-left transition active:brightness-[0.98] focus-visible:outline focus-visible:outline-4 focus-visible:outline-blue-600 focus-visible:outline-offset-[-4px] disabled:cursor-default"
              >
                <AnimatePresence>
                  {isIllustrationReplaced && (
                    <MotionImage
                      src={loginIllustrationReplacement}
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      initial={reduceMotion ? false : { opacity: 0, scale: 1.035 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.975 }}
                      transition={{ duration: reduceMotion ? 0 : 0.46, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0 block h-full w-full object-cover object-center"
                    />
                  )}
                </AnimatePresence>
              </button>
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

      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
        <AnimatePresence>
          {illustrationParticles.map((particle) => (
            <MotionImage
              key={particle.id}
              src={loginIllustration}
              alt=""
              draggable={false}
              initial={{ opacity: 0, scale: 0.25, x: 0, y: 0, rotate: 0 }}
              animate={{
                opacity: [0, 1, 1, 0],
                scale: [0.25, 1, 0.82],
                x: particle.offsetX,
                y: particle.offsetY,
                rotate: particle.rotation,
              }}
              transition={{ duration: 1.16, times: [0, 0.16, 0.58, 1], ease: [0.16, 1, 0.3, 1] }}
              style={{
                left: particle.originX,
                top: particle.originY,
                width: particle.size,
                height: particle.size,
                marginLeft: -particle.size / 2,
                marginTop: -particle.size / 2,
              }}
              className="absolute rounded-xl object-cover shadow-[0_10px_18px_rgba(29,78,216,0.22)] will-change-transform"
            />
          ))}
        </AnimatePresence>
      </div>
    </main>
  );
}
