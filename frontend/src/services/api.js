import axios from "axios";
import { logoutExpiredSession } from "../utils/auth";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "https://qshift.onrender.com" : "http://localhost:5000");
const NORMALIZED_API_BASE_URL = API_BASE_URL.replace(/\/$/, "");

export const API_URL = NORMALIZED_API_BASE_URL.endsWith("/api")
  ? NORMALIZED_API_BASE_URL
  : `${NORMALIZED_API_BASE_URL}/api`;

const api = axios.create({
  baseURL: API_URL,
});

function shouldLogout(response) {
  if (!response || response.status !== 401) return false;
  const message = String(
    response.data?.message || response.data?.error || "",
  ).toLowerCase();

  return (
    message.includes("invalid token") ||
    message.includes("jwt expired") ||
    message.includes("no token") ||
    Boolean(localStorage.getItem("token"))
  );
}

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (shouldLogout(error.response)) {
      logoutExpiredSession();
    }
    return Promise.reject(error);
  },
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (shouldLogout(error.response)) {
      logoutExpiredSession();
    }
    return Promise.reject(error);
  },
);

export default api;
