import axios from "axios";
import { clearSession, adoptRefreshedToken } from "@/lib/auth";

// Create a centralized axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

api.interceptors.response.use(
  (response) => {
    // Sliding session: if the backend handed back a renewed token, keep it so the
    // next request rides the extended session and the user is never kicked mid-work.
    // Adopt it only if it actually extends the session — a response replayed from
    // cache can carry a token minted long ago, and storing that logs the user out.
    const refreshed = response.headers["x-refreshed-token"];
    if (refreshed) {
      adoptRefreshedToken(refreshed);
    }
    return response;
  },
  (error) => {
    // Bounce to login only when a real session actually expired — i.e. we HAD a
    // token. A failed login/signup also 401s but shouldn't trigger the redirect.
    if (error.response && error.response.status === 401) {
      const hadToken = localStorage.getItem("token");
      const url = error.config?.url || "";
      const isAuthAttempt = url.includes("/auth/login") || url.includes("/auth/signup");
      if (hadToken && !isAuthAttempt) {
        clearSession();
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  },
);

export default api;
