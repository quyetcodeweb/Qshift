import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const API_URL = `${API_BASE_URL.replace(/\/$/, "")}/api`;

const api = axios.create({
  baseURL: API_URL,
});

export default api;
