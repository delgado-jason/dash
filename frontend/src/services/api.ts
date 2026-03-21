import axios from "axios";

// Create a centralized axios instance
const api = axios.create({
  baseURL: "http://localhost:3000",
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

// Handle global response errors (optional but recommended)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Example: auto-handle unauthorized access
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user_id");

      // Optional: redirect to login
      window.location.href = "/login";
    }

    return Promise.reject(error);
  },
);

export default api;
