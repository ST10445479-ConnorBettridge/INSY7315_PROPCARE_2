import { useEffect, useState } from "react";
import { api } from "./api.js";

function go(path) {
  window.location.hash = "#/" + path;
}

function useRoute() {
  const read = () => location.hash.replace(/^#\/?/, "") || "overview";
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const change = () => setRoute(read());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  return route;
}

function useData(path, revision = 0) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  useEffect(() => {
    let active = true,
      sequence = 0;
    setState({ loading: true, data: null, error: "" });
    const load = () => {
      const request = ++sequence;
      api(path)
        .then((data) => {
          if (active && request === sequence)
            setState({ loading: false, data, error: "" });
        })
        .catch((e) => {
          if (active && request === sequence)
            setState((s) => ({ ...s, loading: false, error: e.message }));
        });
    };
    const visible = () => {
      if (document.visibilityState === "visible") load();
    };
    load();
    const timer = setInterval(visible, 15000);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [path, revision]);
  return state;
}

export { go, useRoute, useData };
