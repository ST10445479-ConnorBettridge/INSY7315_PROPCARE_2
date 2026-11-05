import { useEffect, useState } from "react";
import { Home, LayoutDashboard, Wrench, Building2, Users, Tags, Bell, ChartNoAxesCombined, Settings, LogOut, Plus, Check, CalendarDays, KeyRound, Menu, X, ChevronRight } from "lucide-react";
import { api, refreshSession, setToken } from "./api.js";
import { go, useRoute } from "./hooks.js";
import { Empty } from "./components/shared.jsx";
import { Login } from "./pages/Login.jsx";
import { Overview } from "./pages/Overview.jsx";
import { Requests } from "./pages/Requests.jsx";
import { Report } from "./pages/Report.jsx";
import { Detail } from "./pages/RequestDetail.jsx";
import { Directory } from "./pages/Directory.jsx";
import { Notifications } from "./pages/Notifications.jsx";
import { Reports } from "./pages/Reports.jsx";
import { Schedule } from "./pages/Schedule.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { Profile } from "./pages/Profile.jsx";
import { roles, label } from "./format.js";
import "./App.css";

const navItems = [
  [
    "overview",
    "Overview",
    LayoutDashboard,
    ["tenant", "manager", "technician", "admin"],
  ],
  [
    "requests",
    "Maintenance",
    Wrench,
    ["tenant", "manager", "technician", "admin"],
  ],
  ["report", "Report an issue", Plus, ["tenant"]],
  [
    "properties",
    "Properties",
    Building2,
    ["tenant", "manager", "technician", "admin"],
  ],
  ["units", "Tenant links", KeyRound, ["admin"]],
  ["tenants", "Tenants", Users, ["manager"]],
  ["technicians", "Technicians", Wrench, ["manager", "admin"]],
  ["schedule", "My schedule", CalendarDays, ["technician"]],
  ["users", "Users and roles", Users, ["admin"]],
  ["categories", "Categories", Tags, ["admin"]],
  ["reports", "Reports", ChartNoAxesCombined, ["manager", "admin"]],
  [
    "notifications",
    "Notifications",
    Bell,
    ["tenant", "manager", "technician", "admin"],
  ],
  ["settings", "Settings", Settings, ["admin"]],
];

function App() {
  const [user, setUser] = useState(null),
    [boot, setBoot] = useState(true),
    [toast, setToast] = useState(""),
    [menu, setMenu] = useState(false),
    [orgName, setOrgName] = useState("Obs Realty Group");
  const route = useRoute();
  const [page, id] = route.split("/");
  useEffect(() => {
    refreshSession()
      .then(setUser)
      .catch(() => {})
      .finally(() => setBoot(false));
    const expired = () => setUser(null);
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  useEffect(() => {
    setMenu(false);
    document.getElementById("main")?.focus();
  }, [route]);
  useEffect(() => {
    if (user)
      api("/settings")
        .then((s) => setOrgName(s.orgName))
        .catch(() => {});
  }, [user]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  async function logout() {
    try {
      await api("/auth/logout", "POST");
    } catch {
      setToast("Sign out failed. Check your connection and try again.");
      return;
    }
    setToken(null);
    setUser(null);
    go("overview");
  }
  if (boot)
    return (
      <div className="loading full">
        <span className="spinner" />
        Opening PropCare…
      </div>
    );
  if (!user)
    return (
      <Login
        onLogin={(u) => {
          setUser(u);
          go("overview");
        }}
      />
    );
  const allowed = navItems.filter((n) => n[3].includes(user.role));
  let content;
  if (page === "request" && id)
    content = <Detail key={id} id={id} user={user} notify={setToast} />;
  else if (page === "profile")
    content = (
      <Profile user={user} onUser={setUser} logout={logout} notify={setToast} />
    );
  else if (!allowed.some((n) => n[0] === page))
    content = (
      <Empty title="This page is not available for your role">
        <a href="#/overview">Return to overview</a>
      </Empty>
    );
  else if (page === "overview") content = <Overview user={user} />;
  else if (page === "requests") content = <Requests />;
  else if (page === "report") content = <Report notify={setToast} />;
  else if (page === "notifications")
    content = <Notifications notify={setToast} />;
  else if (page === "reports") content = <Reports />;
  else if (page === "settings")
    content = <SettingsPage notify={setToast} onOrganisation={setOrgName} />;
  else if (page === "schedule") content = <Schedule />;
  else
    content = (
      <Directory key={page} page={page} user={user} notify={setToast} />
    );
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main").focus();
        }}
      >
        Skip to main content
      </a>
      <div className="app-shell">
        <aside id="workspace-navigation" className={"sidebar " + (menu ? "expanded" : "")}>
          <a href="#/overview" className="brand">
            <span className="brand-mark">
              <Home size={22} />
            </span>
            PropCare<span className="brand-dot">.</span>
          </a>
          <p className="workspace-label">
            {orgName.toUpperCase()}
            <br />
            <span>{roles[user.role]} workspace</span>
          </p>
          <nav aria-label="Main navigation">
            {allowed.map(([key, name, Icon]) => (
              <a
                key={key}
                href={"#/" + key}
                className={page === key ? "active" : ""}
                aria-current={page === key ? "page" : undefined}
              >
                <Icon size={18} />
                {name}
              </a>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <a href="#/profile">
              <span className="avatar">
                {user.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div>
                <strong>{user.name}</strong>
                <small>{roles[user.role]}</small>
              </div>
            </a>
            <button onClick={logout}>
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <button
              className="icon-button menu-button"
              onClick={() => setMenu(!menu)}
              aria-label="Toggle navigation"
              aria-expanded={menu}
              aria-controls="workspace-navigation"
            >
              <Menu />
            </button>
            <span>
              Workspace <ChevronRight size={14} />
              <strong>
                {page === "request" ? "Request details" : label(page)}
              </strong>
            </span>
            <a href="#/notifications" aria-label="Open notifications">
              <Bell size={20} />
            </a>
          </header>
          <main id="main" tabIndex={-1}>
            {content}
          </main>
          <footer className="app-footer">
            PropCare · Property maintenance for {orgName}
          </footer>
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}

export { App };
