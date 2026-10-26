// frontend/src/api.js
// Centralized API client with automatic 401 refresh token rotation,
// queued single-flight retry, Idempotency-Key header support, and public config loader.

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

let onUnauthorizedCallback = null;
let isRefreshing = false;
let refreshSubscribers = [];

export function setUnauthorizedHandler(handler) {
  onUnauthorizedCallback = handler;
}

export function getAccessToken() {
  try {
    return localStorage.getItem('oddspot_token');
  } catch {
    return null;
  }
}

export function getRefreshToken() {
  try {
    return localStorage.getItem('oddspot_refresh_token');
  } catch {
    return null;
  }
}

export function setTokens({ token, accessToken, refreshToken, user } = {}) {
  const jwt = token || accessToken;
  try {
    if (jwt) {
      localStorage.setItem('oddspot_token', jwt);
    }
    if (refreshToken) {
      localStorage.setItem('oddspot_refresh_token', refreshToken);
    }
    if (user) {
      localStorage.setItem('oddspot_user', JSON.stringify(user));
    }
  } catch (err) {
    console.warn('Failed to save tokens to localStorage:', err);
  }
}

export function clearTokens() {
  try {
    localStorage.removeItem('oddspot_token');
    localStorage.removeItem('oddspot_refresh_token');
    localStorage.removeItem('oddspot_user');
  } catch (err) {
    console.warn('Failed to clear tokens from localStorage:', err);
  }
}

export function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'idemp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
}

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(error, newToken) {
  refreshSubscribers.forEach((cb) => cb(error, newToken));
  refreshSubscribers = [];
}

/**
 * Execute an API request with automatic auth header injection,
 * Idempotency-Key support, and 401 refresh queue rotation.
 */
export async function apiRequest(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const token = getAccessToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Idempotency-Key header support
  if (options.idempotencyKey && !headers['Idempotency-Key']) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  // Helper to extract clean error message
  const parseResponseError = (status, data) => {
    let errorMsg = `Request failed with status ${status}`;
    if (typeof data.error === 'string' && data.error.trim()) {
      errorMsg = data.error;
    } else if (data.error && typeof data.error.message === 'string' && data.error.message.trim()) {
      errorMsg = data.error.message;
    } else if (typeof data.message === 'string' && data.message.trim()) {
      errorMsg = data.message;
    }
    const err = new Error(errorMsg);
    err.status = status;
    err.code = data.error?.code || data.code;
    err.details = data.error?.details || data.details || [];
    err.data = data;
    return err;
  };

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (networkErr) {
    const err = new Error(networkErr.message || 'Network request failed');
    err.status = 0;
    err.code = 'NETWORK_ERROR';
    throw err;
  }

  // Handle 401 Unauthorized with token refresh rotation
  if (response.status === 401 && !options._isRetry) {
    const isAuthRoute =
      endpoint.includes('/auth/login') ||
      endpoint.includes('/auth/signup') ||
      endpoint.includes('/auth/refresh') ||
      endpoint.includes('/auth/forgot-password') ||
      endpoint.includes('/auth/reset-password');

    // If already attempting auth or refresh, do not loop
    if (isAuthRoute) {
      clearTokens();
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
      const errData = await response.json().catch(() => ({}));
      throw parseResponseError(401, errData);
    }

    // If refresh is already in-flight, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((refreshErr, newToken) => {
          if (refreshErr) {
            return reject(refreshErr);
          }
          const retryHeaders = {
            ...headers,
            Authorization: `Bearer ${newToken}`,
          };
          resolve(apiRequest(endpoint, { ...options, headers: retryHeaders, _isRetry: true }));
        });
      });
    }

    // Initiate single-flight refresh
    isRefreshing = true;
    const currentRefreshToken = getRefreshToken();

    if (!currentRefreshToken) {
      isRefreshing = false;
      clearTokens();
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
      const errData = await response.json().catch(() => ({}));
      throw parseResponseError(401, errData);
    }

    try {
      const refreshResponse = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: currentRefreshToken }),
      });

      if (!refreshResponse.ok) {
        const refreshErrData = await refreshResponse.json().catch(() => ({}));
        clearTokens();
        const refreshErr = parseResponseError(refreshResponse.status, refreshErrData);
        onRefreshed(refreshErr, null);
        if (onUnauthorizedCallback) {
          onUnauthorizedCallback();
        }
        throw refreshErr;
      }

      const refreshData = await refreshResponse.json();
      const newAccessToken = refreshData.token || refreshData.accessToken;
      const newRefreshToken = refreshData.refreshToken;

      setTokens({
        token: newAccessToken,
        refreshToken: newRefreshToken,
        user: refreshData.user,
      });

      onRefreshed(null, newAccessToken);

      // Retry original request with newly issued access token
      const retryHeaders = {
        ...headers,
        Authorization: `Bearer ${newAccessToken}`,
      };
      return apiRequest(endpoint, { ...options, headers: retryHeaders, _isRetry: true });
    } catch (refreshErr) {
      clearTokens();
      onRefreshed(refreshErr, null);
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
      throw refreshErr;
    } finally {
      isRefreshing = false;
    }
  }

  // Handle other 401s that were already retried
  if (response.status === 401) {
    clearTokens();
    if (onUnauthorizedCallback) {
      onUnauthorizedCallback();
    }
  }

  // If 204 No Content
  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw parseResponseError(response.status, data);
  }

  return data;
}

// Cached public config
let cachedPublicConfig = null;

export async function getPublicConfig(forceReload = false) {
  if (cachedPublicConfig && !forceReload) {
    return cachedPublicConfig;
  }
  try {
    const res = await apiRequest('/config/public');
    cachedPublicConfig = res.config || res;
    return cachedPublicConfig;
  } catch (err) {
    console.warn('Failed to fetch public configuration:', err);
    return null;
  }
}

export const api = {
  // Auth
  signup: async (payload) => {
    const res = await apiRequest('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token || res.accessToken) {
      setTokens(res);
    }
    return res;
  },
  login: async (payload) => {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token || res.accessToken) {
      setTokens(res);
    }
    return res;
  },
  logout: async () => {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) {
        await apiRequest('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch {
      // Best-effort logout
    } finally {
      clearTokens();
    }
  },
  getMe: () => apiRequest('/auth/me'),
  refreshSession: (refreshToken) =>
    apiRequest('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  // Public Configuration
  getConfig: (forceReload) => getPublicConfig(forceReload),

  // Posts
  getNearby: (lat, lng, maxDistance = 10000, page = 1, limit = 20) =>
    apiRequest(
      `/posts/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(
        lng
      )}&maxDistance=${encodeURIComponent(maxDistance)}&page=${encodeURIComponent(
        page
      )}&limit=${encodeURIComponent(limit)}`
    ),
  getPost: (id) => apiRequest(`/posts/${encodeURIComponent(id)}`),
  createPost: (payload, idempotencyKey) =>
    apiRequest('/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
      idempotencyKey: idempotencyKey || generateIdempotencyKey(),
    }),
  updatePost: (id, payload) =>
    apiRequest(`/posts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deletePost: (id) =>
    apiRequest(`/posts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  votePost: (id, value) =>
    apiRequest(`/posts/${encodeURIComponent(id)}/vote`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    }),
  revealPost: (id, latitude, longitude) =>
    apiRequest(`/posts/${encodeURIComponent(id)}/reveal`, {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude }),
    }),
  reportPost: (id, payload) =>
    apiRequest(`/posts/${encodeURIComponent(id)}/report`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Comments
  getComments: (id, options = {}) => {
    const params = new URLSearchParams();
    if (options.cursor) params.append('cursor', options.cursor);
    if (options.limit) params.append('limit', options.limit);
    if (options.page) params.append('page', options.page);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/posts/${encodeURIComponent(id)}/comments${query}`);
  },
  addComment: (id, payload, idempotencyKey) =>
    apiRequest(`/posts/${encodeURIComponent(id)}/comments`, {
      method: 'POST',
      body: JSON.stringify(payload),
      idempotencyKey: idempotencyKey || generateIdempotencyKey(),
    }),
  updateComment: (id, payload) =>
    apiRequest(`/comments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteComment: (id) =>
    apiRequest(`/comments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  // Regional Feeds
  getCityFeed: ({ city, cityKey, country, countryCode, sort = 'hot', limit = 20, cursor } = {}) => {
    const params = new URLSearchParams();
    if (cityKey) params.append('cityKey', cityKey);
    else if (city) params.append('city', city);
    if (countryCode) params.append('countryCode', countryCode);
    else if (country) params.append('country', country);
    if (sort) params.append('sort', sort);
    if (limit) params.append('limit', limit);
    if (cursor) params.append('cursor', cursor);
    return apiRequest(`/feed/city?${params.toString()}`);
  },
  getCountryFeed: ({ country, countryCode, sort = 'hot', limit = 20, cursor } = {}) => {
    const params = new URLSearchParams();
    if (countryCode) params.append('countryCode', countryCode);
    else if (country) params.append('country', country);
    if (sort) params.append('sort', sort);
    if (limit) params.append('limit', limit);
    if (cursor) params.append('cursor', cursor);
    return apiRequest(`/feed/country?${params.toString()}`);
  },
  getRandomFeed: ({ country, countryCode } = {}) => {
    const params = new URLSearchParams();
    if (countryCode) params.append('countryCode', countryCode);
    else if (country) params.append('country', country);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/feed/random${query}`);
  },

  // Users
  getUserProfile: (username) => apiRequest(`/users/${encodeURIComponent(username)}`),
  getMyPosts: () => apiRequest('/users/me/posts'),
  exportMyData: () => apiRequest('/users/me/export'),
};
