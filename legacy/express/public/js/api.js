/**
 * PropCare API client.
 * Thin fetch wrapper that manages the JWT token and normalises errors.
 */
window.PropCareAPI = (function () {
  var TOKEN_KEY = 'propcare_token';
  var USER_KEY = 'propcare_user';

  function token() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function currentUser() {
    try {
      return JSON.parse(sessionStorage.getItem(USER_KEY));
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  }

  function setSession(data) {
    sessionStorage.setItem(TOKEN_KEY, data.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
  }

  async function request(method, path, body) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    var tok = token();
    if (tok) opts.headers.Authorization = 'Bearer ' + tok;
    if (body !== undefined) opts.body = JSON.stringify(body);

    var res;
    try {
      res = await fetch(path, opts);
    } catch (e) {
      var netErr = new Error('Cannot reach the PropCare server. Check your connection and try again.');
      netErr.status = 0;
      throw netErr;
    }

    var data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON body */ }

    if (res.status === 401) {
      // A 401 on a plain sign-in attempt means bad credentials, not a dead
      // session - only broadcast the "session expired" signal when this
      // client actually held a token.
      var hadSession = !!token();
      clearSession();
      if (hadSession) window.dispatchEvent(new CustomEvent('propcare:unauthorized'));
      var unauthorized = new Error((data && data.message) || 'Session expired. Please sign in again.');
      unauthorized.status = 401;
      throw unauthorized;
    }

    if (!res.ok) {
      var msg = (data && data.message) || 'Something went wrong. Please try again.';
      var err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    token: token,
    currentUser: currentUser,
    setSession: setSession,
    clearSession: clearSession,
    login: function (email, password) { return request('POST', '/api/auth/login', { email: email, password: password }); },
    logout: function () { return request('POST', '/api/auth/logout', {}); },
    get: function (path) { return request('GET', path); },
    post: function (path, body) { return request('POST', path, body); },
    put: function (path, body) { return request('PUT', path, body); }
  };
})();