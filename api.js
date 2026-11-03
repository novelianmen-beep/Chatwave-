import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
});

api.interceptors.request.use((config) => {
  const stored = localStorage.getItem("chatwave_user");
  if (stored) {
    const { token } = JSON.parse(stored);
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const errMsg = (err, fallback = "Something went wrong") =>
  err.response?.data?.message || fallback;

export default api;
