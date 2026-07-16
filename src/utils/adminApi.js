// src/utils/adminApi.js
// Typed fetch helpers for the /api/admin/* super-admin endpoints.

const API = process.env.REACT_APP_API_BASE_URL ?? "";

function authHeaders(extra = {}) {
  const token = localStorage.getItem("token");
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.append(key, value);
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

async function handle(res) {
  if (res.status === 403) {
    throw new Error("You do not have permission to view this (super admin only).");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

async function get(path, params) {
  const res = await fetch(`${API}/api/admin${path}${buildQuery(params)}`, {
    headers: authHeaders(),
  });
  return handle(res);
}

async function mutate(method, path, body) {
  const res = await fetch(`${API}/api/admin${path}`, {
    method,
    headers: authHeaders(body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  return handle(res);
}

export const adminApi = {
  overview: () => get("/overview"),
  analyticsUsers: (days) => get("/analytics/users", { days }),
  analyticsVehicles: (days) => get("/analytics/vehicles", { days }),
  analyticsEvaluations: (days) => get("/analytics/evaluations", { days }),

  users: (params) => get("/users", params),
  user: (id) => get(`/users/${id}`),
  updateUser: (id, body) => mutate("PATCH", `/users/${id}`, body),
  userVehicles: (id, params) => get(`/users/${id}/vehicles`, params),
  userActivity: (id, params) => get(`/users/${id}/activity`, params),

  vehicles: (params) => get("/vehicles", params),
  vehicle: (publicId) => get(`/vehicles/${publicId}`),
  archiveVehicle: (publicId) => mutate("POST", `/vehicles/${publicId}/archive`),
  restoreVehicle: (publicId) => mutate("POST", `/vehicles/${publicId}/restore`),

  activity: (params) => get("/activity", params),
};

export default adminApi;
