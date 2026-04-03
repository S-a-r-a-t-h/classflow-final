import axios from "axios";
import Cookies from "js-cookie";

export const getBackendBase = (): string => {
  // Use env variable if set (production deployment)
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  // Fallback: same host as frontend but port 8000 (local dev)
  if (typeof window !== "undefined") {
    const proto = window.location.protocol;
    const host = window.location.hostname;
    return `${proto}//${host}:8000`;
  }
  return "http://localhost:8000";
};

export const getWsBase = (): string => {
  const http = getBackendBase();
  return http.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
};

const api = axios.create({
  baseURL: typeof window !== "undefined" ? getBackendBase() : "http://localhost:8000",
});

// Update baseURL dynamically when window is available
if (typeof window !== "undefined") {
  api.defaults.baseURL = getBackendBase();
}

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = Cookies.get("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      Cookies.remove("token");
      Cookies.remove("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
