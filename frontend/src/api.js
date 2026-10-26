// frontend/src/api.js
// Centralized API client with JWT injection and 401 handling

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

let onUnauthorizedCallback = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorizedCallback = handler;
}

export async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const token = localStorage.getItem('oddspot_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem('oddspot_token');
    localStorage.removeItem('oddspot_user');
    if (onUnauthorizedCallback) {
      onUnauthorizedCallback();
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    let errorMsg = `Request failed with status ${response.status}`;
    if (typeof data.error === 'string' && data.error.trim()) {
      errorMsg = data.error;
    } else if (data.error && typeof data.error.message === 'string' && data.error.message.trim()) {
      errorMsg = data.error.message;
    } else if (typeof data.message === 'string' && data.message.trim()) {
      errorMsg = data.message;
    }
    const err = new Error(errorMsg);
    err.status = response.status;
    err.code = data.error?.code || data.code;
    err.details = data.error?.details || data.details || [];
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  // Auth
  signup: (payload) => apiRequest('/auth/signup', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  getMe: () => apiRequest('/auth/me'),

  // Posts
  getNearby: (lat, lng, maxDistance = 10000, page = 1, limit = 20) =>
    apiRequest(`/posts/nearby?lat=${lat}&lng=${lng}&maxDistance=${maxDistance}&page=${page}&limit=${limit}`),
  getPost: (id) => apiRequest(`/posts/${id}`),
  createPost: (payload) => apiRequest('/posts', { method: 'POST', body: JSON.stringify(payload) }),
  votePost: (id, value) => apiRequest(`/posts/${id}/vote`, { method: 'POST', body: JSON.stringify({ value }) }),
  getComments: (id, page = 1) => apiRequest(`/posts/${id}/comments?page=${page}`),
  addComment: (id, payload) =>
    apiRequest(`/posts/${id}/comments`, { method: 'POST', body: JSON.stringify(payload) }),
  reportPost: (id, payload) =>
    apiRequest(`/posts/${id}/report`, { method: 'POST', body: JSON.stringify(payload) }),
};
