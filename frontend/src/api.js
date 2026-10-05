let token = null;
let refreshing = null;
export function setToken(value) {
  token = value;
}
export async function refreshSession() {
  if (!refreshing)
    refreshing = fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "X-PropCare": "1" },
      credentials: "same-origin",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Please sign in again.");
        const { data } = await r.json();
        token = data.token;
        return data.user;
      })
      .finally(() => {
        refreshing = null;
      });
  return refreshing;
}
export async function raw(path, options = {}, retry = true) {
  const response = await fetch("/api" + path, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-PropCare": "1",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...options.headers,
    },
  });
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    try {
      await refreshSession();
    } catch {
      token = null;
      window.dispatchEvent(new Event("session-expired"));
      throw new Error("Your session has ended. Please sign in.");
    }
    return raw(path, options, false);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.message ||
        (response.status === 429
          ? "Too many attempts. Please wait a minute."
          : `Request failed (${response.status}).`),
    );
  }
  return response;
}
export async function api(path, method = "GET", body) {
  const response = await raw(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  return result.data ?? result;
}
export async function upload(id, file, kind = "issue") {
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 5 MB.");
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return api(`/requests/${id}/photos`, "POST", {
    filename: file.name,
    kind,
    data,
  });
}
