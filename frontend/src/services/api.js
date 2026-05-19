import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "https://qshift-backend.onrender.com" : "http://localhost:5000");
const NORMALIZED_API_BASE_URL = API_BASE_URL.replace(/\/$/, "");

export const API_URL = NORMALIZED_API_BASE_URL.endsWith("/api")
  ? NORMALIZED_API_BASE_URL
  : `${NORMALIZED_API_BASE_URL}/api`;

const api = axios.create({
  baseURL: API_URL,
});

export default api;
