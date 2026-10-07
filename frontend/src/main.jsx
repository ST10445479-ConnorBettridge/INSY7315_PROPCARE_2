import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Home,
  LayoutDashboard,
  Wrench,
  Building2,
  Users,
  Tags,
  UserRound,
  Bell,
  ChartNoAxesCombined,
  Settings,
  LogOut,
  Plus,
  ArrowRight,
  ArrowLeft,
  Search,
  Check,
  CalendarDays,
  ShieldCheck,
  KeyRound,
  Menu,
  X,
  Camera,
  Clock,
  ChevronRight,
  Download,
} from "lucide-react";
import { api, raw, refreshSession, setToken, upload } from "./api";
import "./styles.css";

const roles = {
  tenant: "Tenant",
  manager: "Property manager",
  technician: "Technician",
  admin: "Administrator",
};
const openStatuses = [
  "submitted",
  "under-review",
  "assigned",
  "in-progress",
  "on-hold",
];
const label = (s) =>
  (s || "").replaceAll("-", " ").replace(/^./, (x) => x.toUpperCase());
const date = (s) =>
  s
    ? new Date(s).toLocaleString("en-ZA", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not scheduled";
const shortId = (id) => (id.length > 16 ? id.slice(0, 12).toUpperCase() : id);
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
function Loading({ state, children }) {
  if (state.loading)
    return (
      <div className="loading" role="status">
        <span className="spinner" />
        Loading your workspace…
      </div>
    );
  if (state.error)
    return (
      <div className="error" role="alert">
        {state.error}
        <button onClick={() => location.reload()}>Try again</button>
      </div>
    );
  return children(state.data);
}
function Badge({ value }) {
  return <span className={"badge badge-" + value}>{label(value)}</span>;
}
function Field({ label: name, children, hint }) {
  return (
    <label className="field-label">
      <span>{name}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Heading({ eyebrow, title, children, action }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {children && <p className="subtle">{children}</p>}
      </div>
      {action}
    </div>
  );
}
function Empty({ title = "Nothing here yet", children }) {
  return (
    <div className="empty">
      <Wrench size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Form({ onSave, children, button = "Save changes", className = "" }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className={className}
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
          await onSave(new FormData(e.currentTarget), e.currentTarget);
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        {children}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="btn primary" type="submit">
          {busy ? "Saving…" : button}
          <ArrowRight size={16} />
        </button>
      </fieldset>
    </form>
  );
}
function Modal({ title, onClose, children }) {
  const ref = useRef();
  useEffect(() => {
    const node = ref.current;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="dialogTitle"
    >
      <div className="dialog-header">
        <h2 id="dialogTitle">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Login({ onLogin }) {
  const [register, setRegister] = useState(false),
    [email, setEmail] = useState(""),
    [notice, setNotice] = useState("");
  const demos = [
    { name: "Tenant", email: "sarahwilliams@example.com" },
    { name: "Manager", email: "michael.jacobs@obsrealty.co.za" },
    { name: "Technician", email: "johan.vdm@obsrealty.co.za" },
    { name: "Admin", email: "admin@obsrealty.co.za" },
  ];
  return (
    <main className="login">
      <section className="login-story">
        <a className="brand" href="#/">
          <span className="brand-mark">
            <Home size={22} />
          </span>
          PropCare<span className="brand-dot">.</span>
        </a>
        <div>
          <p className="eyebrow">OBS REALTY GROUP</p>
          <h1>
            A better place
            <br />
            to call <em>home.</em>
          </h1>
          <p>
            From the first report to the final repair.
            <br />
            Property care, with everyone in the loop.
          </p>
          <div className="story-card">
            <span className="story-icon">
              <Check />
            </span>
            <div>
              <strong>Every repair has a clear next step</strong>
              <p>Report. Assign. Resolve.</p>
            </div>
          </div>
        </div>
        <small>Property maintenance made personal.</small>
      </section>
      <section className="login-form">
        <div>
          <p className="eyebrow">YOUR PROPERTY WORKSPACE</p>
          <h2>{register ? "Make yourself at home" : "Welcome back"}</h2>
          <p className="subtle">
            {register
              ? "Create a tenant account. Your administrator will verify and link your property."
              : "Sign in to keep your property moving forward."}
          </p>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <Form
            key={String(register)}
            button={register ? "Create tenant account" : "Sign in to PropCare"}
            onSave={async (f) => {
              const body = Object.fromEntries(f);
              if (register) {
                const r = await api("/auth/register", "POST", body);
                setNotice(r.message);
                setRegister(false);
              } else {
                const r = await api("/auth/login", "POST", body);
                setToken(r.token);
                onLogin(r.user);
              }
            }}
          >
            {register && (
              <Field label="Full name">
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                />
              </Field>
            )}
            <Field label="Email address">
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field
              label="Password"
              hint={
                register
                  ? "At least 10 characters, including uppercase, lowercase and a number."
                  : null
              }
            >
              <input
                name="password"
                type="password"
                required
                minLength={register ? 10 : 1}
                maxLength={72}
                autoComplete={register ? "new-password" : "current-password"}
              />
            </Field>
          </Form>
          <button
            className="text-button"
            onClick={() => {
              setRegister(!register);
              setNotice("");
            }}
          >
            {register
              ? "Already registered? Sign in"
              : "New tenant? Create an account"}
          </button>
          {!register && (
            <details className="demo">
              <summary>Explore the demo accounts</summary>
              <div className="demo-roles">
                {demos.map((d) => (
                  <button key={d.email} onClick={() => setEmail(d.email)}>
                    {d.name}
                  </button>
                ))}
              </div>
              <small>Use the demo password supplied by your team.</small>
            </details>
          )}
          <p className="login-help">
            <ShieldCheck size={15} />
            Access is controlled by your assigned role.
          </p>
        </div>
      </section>
    </main>
  );
}
function RequestCards({ requests }) {
  return requests.length ? (
    <div className="request-list">
      {requests.map((r) => (
        <a className="request-card" href={"#/request/" + r.id} key={r.id}>
          <span className={"request-icon urgency-" + r.urgency}>
            <Wrench size={21} />
          </span>
          <div className="request-copy">
            <div className="request-top">
              <small>
                {shortId(r.id)} · {r.categoryName}
              </small>
              <Badge value={r.status} />
            </div>
            <h3>{r.title}</h3>
            <p>
              {r.propertyName} · {r.unit}
            </p>
            <div className="request-bottom">
              <span>
                <Clock size={13} />
                {new Date(r.CreatedAt || r.createdAt).toLocaleDateString(
                  "en-ZA",
                )}
              </span>
              <span className={"priority priority-" + r.urgency}>
                {label(r.urgency)} priority
              </span>
            </div>
          </div>
          <ChevronRight className="card-arrow" size={18} />
        </a>
      ))}
    </div>
  ) : (
    <Empty title="No requests to show">
      New maintenance requests will appear here.
    </Empty>
  );
}
function Overview({ user }) {
  const state = useData("/requests/overview");
  return (
    <Loading state={state}>
      {(summary) => {
        return (
          <>
            <Heading
              eyebrow="YOUR WORKSPACE AT A GLANCE"
              title={"Good day, " + user.name.split(" ")[0]}
              action={
                user.role === "tenant" && (
                  <a className="btn primary" href="#/report">
                    <Plus size={17} />
                    Report an issue
                  </a>
                )
              }
            >
              Here’s what’s happening across your{" "}
              {user.role === "tenant" ? "home" : "maintenance workspace"}.
            </Heading>
            <div className="stats">
              <Stat
                title="Total requests"
                value={summary.total}
                icon={Wrench}
              />
              <Stat title="Open requests" value={summary.open} icon={Clock} />
              <Stat
                title="Awaiting confirmation"
                value={summary.awaiting}
                icon={Bell}
              />
              <Stat
                title="Completed or closed"
                value={summary.completed}
                icon={Check}
              />
            </div>
            <div className="section-title">
              <h2>Recent maintenance</h2>
              <a href="#/requests">
                View all requests <ArrowRight size={15} />
              </a>
            </div>
            <RequestCards requests={summary.recent} />
            <div className="care-banner">
              <ShieldCheck size={32} />
              <div>
                <h3>A clear record, from start to finish</h3>
                <p>
                  Follow progress, share updates and keep the details together
                  in each request.
                </p>
              </div>
            </div>
          </>
        );
      }}
    </Loading>
  );
}
function Stat({ title, value, icon: Icon }) {
  return (
    <div className="stat">
      <div>
        <p>{title}</p>
        <strong>{value}</strong>
      </div>
      <span>
        <Icon size={21} />
      </span>
    </div>
  );
}
function Requests() {
  const [status, setStatus] = useState(""),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const state = useData(
    `/requests/page?page=${page}&pageSize=24&status=${encodeURIComponent(status)}&q=${encodeURIComponent(query)}`,
  );
  return (
    <>
      <Heading eyebrow="MAINTENANCE" title="Every request, in one place">
        Track progress and find the details you need.
      </Heading>
      <div className="filters">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Search requests"
            placeholder="Search by issue, property or request number"
            maxLength={120}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {[
            ...openStatuses,
            "completed",
            "closed",
            "cancelled",
            "rejected",
          ].map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
      </div>
      <Loading state={state}>
        {(result) => (
          <>
            <p className="subtle" role="status">
              {result.total} matching requests · Page {page} of{" "}
              {Math.max(1, Math.ceil(result.total / result.pageSize))}
            </p>
            <RequestCards requests={result.items} />
            <nav className="pagination" aria-label="Request pages">
              <button
                className="btn secondary"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous page
              </button>
              <button
                className="btn secondary"
                disabled={page * result.pageSize >= result.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next page
              </button>
            </nav>
          </>
        )}
      </Loading>
    </>
  );
}
function Report({ notify }) {
  const units = useData("/units"),
    categories = useData("/categories");
  const [savedId, setSavedId] = useState(null);
  return (
    <>
      <Heading eyebrow="LET’S GET IT SORTED" title="Report an issue">
        Give your property manager the details they need to help.
      </Heading>
      <Loading state={{ ...units, loading: units.loading || categories.loading, error: units.error || categories.error }}>
        {(list) =>
          list.length ? (
            <div className="form-layout">
              <div className="panel">
                <Form
                  button={
                    savedId
                      ? "Retry photo upload"
                      : "Submit maintenance request"
                  }
                  onSave={async (f) => {
                    const file = f.get("photo");
                    if (file?.size > 5 * 1024 * 1024)
                      throw new Error("Choose a photo smaller than 5 MB.");
                    let id = savedId;
                    if (!id) {
                      const r = await api("/requests", "POST", {
                        title: f.get("title"),
                        detail: f.get("detail"),
                        categoryId: f.get("categoryId"),
                        urgency: f.get("urgency"),
                        unitId: Number(f.get("unitId")),
                      });
                      id = r.id;
                      setSavedId(id);
                    }
                    try {
                      if (file?.size) await upload(id, file);
                    } catch (e) {
                      throw new Error(
                        "Your request was saved, but the photo failed: " +
                          e.message +
                          " Retry or open the saved request below.",
                      );
                    }
                    notify(
                      "Request submitted. Your property manager has been notified.",
                    );
                    go("request/" + id);
                  }}
                >
                  <Field label="Property and unit">
                    <select name="unitId" required disabled={!!savedId}>
                      {list.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.propertyName} · {u.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Loading state={categories}>
                    {(cats) => (
                      <Field label="Category">
                        <select name="categoryId" required disabled={!!savedId}>
                          {cats
                            .filter((c) => c.active)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                    )}
                  </Loading>
                  <Field label="Short description">
                    <input
                      name="title"
                      required
                      maxLength={120}
                      disabled={!!savedId}
                      placeholder="For example, kitchen tap leaking"
                    />
                  </Field>
                  <Field label="Tell us what happened">
                    <textarea
                      name="detail"
                      required
                      maxLength={2000}
                      rows={4}
                      disabled={!!savedId}
                      placeholder="Where is the issue? When did it start?"
                    />
                  </Field>
                  <Field label="Priority">
                    <select
                      name="urgency"
                      defaultValue="normal"
                      disabled={!!savedId}
                    >
                      {["low", "normal", "high", "urgent"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Add a photo"
                    hint="JPEG, PNG or WebP up to 5 MB. Optional."
                  >
                    <input
                      name="photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                    />
                  </Field>
                </Form>
                {savedId && (
                  <a href={"#/request/" + savedId}>Open your saved request</a>
                )}
              </div>
              <aside className="panel form-aside">
                <Camera size={30} />
                <h2>A little detail goes a long way</h2>
                <p>
                  A clear photo and a description help your technician arrive
                  prepared.
                </p>
                <hr />
                <h3>What happens next?</h3>
                <ol>
                  <li>Your manager reviews the issue.</li>
                  <li>A technician is assigned.</li>
                  <li>You can follow every update here.</li>
                  <li>Confirm the repair and rate the work.</li>
                </ol>
                <p className="subtle">
                  For an immediate safety emergency, contact the relevant
                  emergency service directly.
                </p>
              </aside>
            </div>
          ) : (
            <Empty title="Your home is not linked yet">
              Your administrator needs to verify your tenancy and assign your
              property and unit before you can report an issue.
            </Empty>
          )
        }
      </Loading>
    </>
  );
}
function Photo({ id, photo }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      objectUrl;
    raw(`/requests/${id}/photos/${photo.id}`)
      .then((r) => r.blob())
      .then((b) => {
        objectUrl = URL.createObjectURL(b);
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {
        if (active) setError("Photo unavailable. Refresh to try again.");
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, photo.id]);
  return (
    <figure>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={photo.kind + " photo: " + photo.filename} />
        </a>
      ) : (
        <span role={error ? "alert" : "status"}>
          {error || "Loading photo…"}
        </span>
      )}
      <figcaption>
        {label(photo.kind)} · {photo.filename}
      </figcaption>
    </figure>
  );
}
function Detail({ id, user, notify }) {
  const [rev, setRev] = useState(0),
    [modal, setModal] = useState("");
  const state = useData("/requests/" + id, rev);
  const refresh = () => setRev((x) => x + 1);
  async function action(name, note = "") {
    await api(`/requests/${id}/status`, "POST", { action: name, note });
    setModal("");
    refresh();
    notify("Request updated.");
  }
  return (
    <Loading state={state}>
      {(d) => {
        const r = d.request;
        return (
          <>
            <a className="back" href="#/requests">
              <ArrowLeft size={16} />
              All maintenance
            </a>
            <Heading
              eyebrow={shortId(r.id)}
              title={r.title}
              action={<Badge value={r.status} />}
            >
              {r.propertyName} · {r.unit}
            </Heading>
            <div className="detail-grid">
              <div>
                <section className="panel">
                  <div className="tag-row">
                    <Badge value={r.urgency} />
                    <span>{r.categoryName}</span>
                  </div>
                  <p className="description">{r.detail}</p>
                  <dl className="facts">
                    <div>
                      <dt>Reported by</dt>
                      <dd>{r.tenantName}</dd>
                    </div>
                    <div>
                      <dt>Technician</dt>
                      <dd>{r.technicianName || "Awaiting assignment"}</dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{date(r.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Scheduled visit</dt>
                      <dd>{date(r.scheduledAt)}</dd>
                    </div>
                  </dl>
                  <div className="actions">
                    {d.actions.map((a) => (
                      <button
                        key={a}
                        className={
                          "btn " +
                          (["confirm", "complete", "assign"].includes(a)
                            ? "primary"
                            : "secondary")
                        }
                        onClick={() => setModal(a)}
                      >
                        {a === "confirm"
                          ? "Confirm resolved"
                          : a === "complete"
                            ? "Mark complete"
                            : label(a)}
                      </button>
                    ))}
                    {d.canRate && (
                      <button
                        className="btn secondary"
                        onClick={() => setModal("rate")}
                      >
                        Rate the work
                      </button>
                    )}
                    {d.rating && (
                      <span className="rating">
                        {"★".repeat(d.rating)} <span>{d.rating}/5</span>
                      </span>
                    )}
                  </div>
                </section>
                <section className="panel">
                  <div className="section-title">
                    <h2>Photos</h2>
                    <button
                      className="btn small secondary"
                      onClick={() => setModal("photo")}
                    >
                      <Plus size={15} />
                      Add photo
                    </button>
                  </div>
                  <div className="photos">
                    {d.photos.map((p) => (
                      <Photo key={p.id} id={id} photo={p} />
                    ))}
                  </div>
                  {!d.photos.length && (
                    <p className="subtle">No photos attached yet.</p>
                  )}
                </section>
                <section className="panel">
                  <h2>Conversation and work notes</h2>
                  <div className="comments">
                    {d.comments.map((c) => (
                      <article key={c.id}>
                        <div className="comment-top">
                          <strong>{c.name}</strong>
                          <span>
                            {roles[c.role]} · {date(c.createdAt)}
                          </span>
                        </div>
                        <p>{c.text}</p>
                      </article>
                    ))}
                  </div>
                  <Form
                    button="Add update"
                    onSave={async (f, form) => {
                      await api(`/requests/${id}/comments`, "POST", {
                        text: f.get("text"),
                      });
                      form.reset();
                      refresh();
                      notify("Update added.");
                    }}
                  >
                    <Field label="Your update">
                      <textarea
                        name="text"
                        required
                        maxLength={2000}
                        placeholder="Share an update or ask a question"
                      />
                    </Field>
                  </Form>
                </section>
              </div>
              <aside className="panel timeline">
                <h2>Request history</h2>
                <ol>
                  {d.history.map((h) => (
                    <li key={h.id}>
                      <span className="timeline-dot" />
                      <strong>{label(h.status)}</strong>
                      <time>{date(h.createdAt)}</time>
                      {h.actor && <small>{h.actor}</small>}
                    </li>
                  ))}
                </ol>
              </aside>
            </div>
            {modal && (
              <Modal
                title={
                  modal === "rate"
                    ? "How was the repair?"
                    : modal === "photo"
                      ? "Attach a photo"
                      : label(modal) + " request"
                }
                onClose={() => setModal("")}
              >
                {["assign", "schedule"].includes(modal) ? (
                  <Assignment
                    request={r}
                    onSave={async (body) => {
                      await api(`/requests/${id}/assign`, "POST", body);
                      setModal("");
                      refresh();
                      notify("Assignment saved.");
                    }}
                  />
                ) : modal === "rate" ? (
                  <Form
                    button="Submit rating"
                    onSave={async (f) => {
                      await api(`/requests/${id}/rate`, "POST", {
                        stars: Number(f.get("stars")),
                      });
                      setModal("");
                      refresh();
                      notify("Rating recorded.");
                    }}
                  >
                    <Field label="Rating">
                      <select name="stars" defaultValue="5">
                        {[5, 4, 3, 2, 1].map((n) => (
                          <option key={n} value={n}>
                            {n} out of 5
                          </option>
                        ))}
                      </select>
                    </Field>
                  </Form>
                ) : modal === "photo" ? (
                  <Form
                    button="Upload photo"
                    onSave={async (f) => {
                      await upload(id, f.get("photo"), f.get("kind"));
                      setModal("");
                      refresh();
                      notify("Photo uploaded.");
                    }}
                  >
                    <Field label="Photo type">
                      <select name="kind">
                        {(user.role === "tenant"
                          ? ["issue"]
                          : ["issue", "before", "after"]
                        ).map((k) => (
                          <option key={k} value={k}>
                            {label(k)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label="Photo file"
                      hint="JPEG, PNG or WebP, maximum 5 MB"
                    >
                      <input
                        name="photo"
                        type="file"
                        required
                        accept="image/jpeg,image/png,image/webp"
                      />
                    </Field>
                  </Form>
                ) : (
                  <Form
                    button={label(modal)}
                    onSave={(f) => action(modal, f.get("note"))}
                  >
                    <p>
                      {modal === "confirm"
                        ? "Confirm that the issue has been resolved. The request will be closed."
                        : "This updates the request status and notifies the people involved."}
                    </p>
                    <Field label="Note">
                      <textarea
                        name="note"
                        maxLength={1000}
                        required={[
                          "reject",
                          "hold",
                          "reopen",
                          "complete",
                        ].includes(modal)}
                        placeholder="Add relevant details"
                      />
                    </Field>
                  </Form>
                )}
              </Modal>
            )}
          </>
        );
      }}
    </Loading>
  );
}
function Assignment({ request: r, onSave }) {
  const state = useData("/technicians");
  return (
    <Loading state={state}>
      {(rows) => (
        <Form
          onSave={(f) =>
            onSave({
              technicianId: f.get("technicianId"),
              urgency: f.get("urgency"),
              note: f.get("note"),
              scheduledAt: f.get("scheduledAt")
                ? new Date(f.get("scheduledAt")).toISOString()
                : null,
            })
          }
        >
          <Field label="Technician">
            <select
              name="technicianId"
              required
              defaultValue={r.technicianId || ""}
            >
              <option value="">Choose a technician</option>
              {rows
                .filter((t) => t.active)
                .map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name} · {t.skill} · {t.openJobs} open jobs
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Priority">
            <select name="urgency" defaultValue={r.urgency}>
              {["low", "normal", "high", "urgent"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Visit date and time"
            hint="Optional. Enter a time in your local timezone."
          >
            <input name="scheduledAt" type="datetime-local" />
          </Field>
          <Field label="Assignment note">
            <textarea name="note" maxLength={1000} />
          </Field>
        </Form>
      )}
    </Loading>
  );
}

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
        <aside className={"sidebar " + (menu ? "expanded" : "")}>
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

function Directory({ page, user, notify }) {
  const [revision, setRevision] = useState(0),
    [edit, setEdit] = useState(null),
    [search, setSearch] = useState("");
  const state = useData("/" + page, revision);
  const admin = user.role === "admin";
  const titles = {
    properties: "Your property portfolio",
    units: "Tenants and their homes",
    tenants: "Tenants",
    users: "People and permissions",
    categories: "Maintenance categories",
    technicians: "Your maintenance team",
  };
  const subtitles = {
    properties: "Property details and the people responsible for them.",
    units: "Link verified tenants to their property and unit.",
    users: "Create accounts, manage roles and control access.",
    categories: "Keep maintenance requests consistently classified.",
    technicians: "Specialist skills, workloads and tenant feedback.",
    tenants: "Contact details for tenants in your managed portfolio.",
  };
  return (
    <>
      <Heading
        eyebrow="YOUR DIRECTORY"
        title={titles[page]}
        action={
          admin &&
          page !== "technicians" && (
            <button className="btn primary" onClick={() => setEdit({})}>
              <Plus size={17} />
              {page === "units"
                ? "Link a tenant"
                : "Add " +
                  ({
                    properties: "property",
                    users: "user",
                    categories: "category",
                  }[page] || "record")}
            </button>
          )
        }
      >
        {subtitles[page]}
      </Heading>
      {page === "technicians" && admin && (
        <p className="notice">
          Create a user with the Technician role to add a technician here. Edit
          their skills below.
        </p>
      )}
      <label className="search directory-search">
        <Search size={18} />
        <input
          aria-label="Search directory"
          placeholder="Find a record…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <Loading state={state}>
        {(rows) => (
          <div className="directory-grid">
            {rows
              .filter((r) =>
                JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
              )
              .map((r) => (
                <article className="panel directory-card" key={r.id}>
                  <div className="directory-top">
                    <span className="directory-icon">
                      {page === "properties" ? (
                        <Building2 />
                      ) : page === "categories" ? (
                        <Tags />
                      ) : page === "units" ? (
                        <KeyRound />
                      ) : (
                        <UserRound />
                      )}
                    </span>
                    {r.active !== undefined && (
                      <Badge value={r.active ? "active" : "archived"} />
                    )}
                  </div>
                  <h2>{page === "units" ? r.tenantName : r.name}</h2>
                  {page === "properties" ? (
                    <>
                      <p>
                        {r.address}
                        <br />
                        {r.area}
                      </p>
                      <small>Managed by {r.managerName}</small>
                    </>
                  ) : page === "units" ? (
                    <>
                      <p>
                        {r.propertyName}
                        <br />
                        {r.name}
                      </p>
                      <small>
                        {r.active ? "Current tenancy" : "Archived tenancy"}
                      </small>
                    </>
                  ) : page === "technicians" ? (
                    <>
                      <p>{r.skill}</p>
                      <div className="tag-row">
                        <span>{r.openJobs} open jobs</span>
                        <span>
                          {r.averageRating
                            ? Number(r.averageRating).toFixed(1) + " / 5"
                            : "No ratings yet"}
                        </span>
                      </div>
                    </>
                  ) : page === "users" || page === "tenants" ? (
                    <>
                      <p>{r.email}</p>
                      <small>{roles[r.role]}</small>
                    </>
                  ) : (
                    <p>Available for classifying maintenance requests.</p>
                  )}
                  {admin && (
                    <button
                      className="btn secondary small"
                      onClick={() => setEdit(r)}
                    >
                      Edit{" "}
                      {page === "units"
                        ? "link"
                        : page === "technicians"
                          ? "skills"
                          : page === "users"
                            ? "account"
                            : "details"}
                    </button>
                  )}
                </article>
              ))}
            {!rows.length && <Empty>No records have been added yet.</Empty>}
          </div>
        )}
      </Loading>
      {edit && (
        <Modal
          title={
            (edit.id ? "Edit " : "Add ") +
            {
              properties: "property",
              users: "user",
              categories: "category",
              units: "tenant link",
              technicians: "technician skills",
            }[page]
          }
          onClose={() => setEdit(null)}
        >
          <DirectoryForm
            page={page}
            record={edit}
            onSave={async (payload) => {
              await api(
                "/" + page + (edit.id ? "/" + edit.id : ""),
                edit.id ? "PUT" : "POST",
                payload,
              );
              setEdit(null);
              setRevision((r) => r + 1);
              notify("Record saved.");
            }}
          />
        </Modal>
      )}
    </>
  );
}
function DirectoryForm({ page, record: r, onSave }) {
  const needsUsers = ["properties", "units"].includes(page),
    needsProperties = page === "units";
  const users = useData(needsUsers ? "/users" : "/settings"),
    properties = useData(needsProperties ? "/properties" : "/settings");
  return (
    <Loading state={users}>
      {(u) => (
        <Loading state={properties}>
          {(p) => (
            <Form
              onSave={(f) => {
                const v = Object.fromEntries(f);
                return onSave({
                  ...v,
                  active: f.get("active") === "on",
                  ...(page === "technicians" ? { userId: r.userId } : {}),
                  ...(page === "units" && r.id
                    ? { userId: r.userId, propertyId: r.propertyId }
                    : {}),
                });
              }}
            >
              {["users", "properties", "categories"].includes(page) && (
                <Field label={page === "users" ? "Full name" : "Name"}>
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={page === "categories" ? 80 : 100}
                    defaultValue={r.name || ""}
                  />
                </Field>
              )}
              {page === "users" && (
                <>
                  <Field label="Email">
                    <input
                      name="email"
                      type="email"
                      required
                      maxLength={254}
                      defaultValue={r.email || ""}
                    />
                  </Field>
                  <Field label="Role">
                    <select name="role" defaultValue={r.role || "tenant"}>
                      {Object.entries(roles).map(([key, name]) => (
                        <option key={key} value={key}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={
                      r.id
                        ? "Reset password (leave blank to keep)"
                        : "Temporary password"
                    }
                    hint="10+ characters with uppercase, lowercase and a number."
                  >
                    <input
                      name="password"
                      type="password"
                      required={!r.id}
                      minLength={10}
                      maxLength={72}
                      autoComplete="new-password"
                    />
                  </Field>
                </>
              )}
              {page === "properties" && (
                <>
                  <Field label="Street address">
                    <input
                      name="address"
                      required
                      maxLength={250}
                      defaultValue={r.address || ""}
                    />
                  </Field>
                  <Field label="Area">
                    <input
                      name="area"
                      required
                      maxLength={100}
                      defaultValue={r.area || ""}
                    />
                  </Field>
                  <Field label="Property manager">
                    <select
                      name="managerId"
                      required
                      defaultValue={r.managerId || ""}
                    >
                      <option value="">Select a manager</option>
                      {u
                        .filter((x) => x.role === "manager" && x.active)
                        .map((x) => (
                          <option value={x.id} key={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                </>
              )}
              {page === "units" && (
                <>
                  <Field label="Tenant">
                    <select
                      name="userId"
                      required
                      disabled={Boolean(r.id)}
                      defaultValue={r.userId || ""}
                    >
                      <option value="">Select a tenant</option>
                      {u
                        .filter(
                          (x) =>
                            (x.role === "tenant" && x.active) ||
                            x.id === r.userId,
                        )
                        .map((x) => (
                          <option value={x.id} key={x.id}>
                            {x.name} · {x.email}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Property">
                    <select
                      name="propertyId"
                      required
                      disabled={Boolean(r.id)}
                      defaultValue={r.propertyId || ""}
                    >
                      <option value="">Select a property</option>
                      {p
                        .filter((x) => x.active || x.id === r.propertyId)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Unit name">
                    <input
                      name="name"
                      required
                      maxLength={120}
                      defaultValue={r.name || ""}
                      placeholder="For example, Unit 3B"
                    />
                  </Field>
                  <p className="subtle">
                    For a new occupant, archive the existing link and create a
                    new one. Historical requests retain the original tenancy.
                  </p>
                </>
              )}
              {page === "technicians" && (
                <Field label="Skills and specialisation">
                  <input
                    name="skill"
                    required
                    maxLength={120}
                    defaultValue={r.skill}
                  />
                </Field>
              )}
              {page !== "technicians" && (
                <label className="check-label">
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={r.active !== false}
                  />
                  Active
                </label>
              )}
            </Form>
          )}
        </Loading>
      )}
    </Loading>
  );
}
function Notifications({ notify }) {
  const [rev, setRev] = useState(0),
    state = useData("/notifications", rev);
  return (
    <>
      <Heading
        eyebrow="STAY IN THE LOOP"
        title="Notifications"
        action={
          <button
            className="btn secondary"
            onClick={async () => {
              try {
                await api("/notifications/read", "POST");
                setRev((x) => x + 1);
                notify("All notifications marked as read.");
              } catch (e) {
                notify(e.message);
              }
            }}
          >
            Mark all read
          </button>
        }
      >
        Updates from your property team.
      </Heading>
      <Loading state={state}>
        {(rows) =>
          rows.length ? (
            <div className="notification-list">
              {rows.map((n) => (
                <article
                  className={"panel notification " + (!n.read ? "unread" : "")}
                  key={n.id}
                >
                  <Bell size={20} />
                  <div>
                    {n.requestId ? (
                      <a href={"#/request/" + n.requestId}>{n.title}</a>
                    ) : (
                      <strong>{n.title}</strong>
                    )}
                    <small>{date(n.createdAt)}</small>
                  </div>
                  {!n.read && (
                    <span
                      className="unread-dot"
                      role="img"
                      aria-label="Unread"
                    />
                  )}
                </article>
              ))}
            </div>
          ) : (
            <Empty title="You’re all caught up">
              Updates will appear here when your requests change.
            </Empty>
          )
        }
      </Loading>
    </>
  );
}
function Reports() {
  const state = useData("/reports");
  function exportCsv(d) {
    const protect = (v) => {
      let s = String(v);
      if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replaceAll('"', '""') + '"';
    };
    const rows = [
      ["Section", "Name", "Count"],
      ...d.byCategory.map((r) => ["Category", r.name, r.count]),
      ...d.byProperty.map((r) => ["Open by property", r.name, r.count]),
      ...d.byStatus.map((r) => ["Status", r.name, r.count]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((r) => r.map(protect).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "propcare-maintenance-report.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Loading state={state}>
      {(d) => (
        <>
          <Heading
            eyebrow="INSIGHTS FOR BETTER CARE"
            title="Maintenance reports"
            action={
              <button className="btn secondary" onClick={() => exportCsv(d)}>
                <Download size={17} />
                Download CSV
              </button>
            }
          >
            A live view of the requests within your access.
          </Heading>
          <div className="stats">
            <Stat title="All requests" value={d.total} icon={Wrench} />
            <Stat title="Open requests" value={d.open} icon={Clock} />
            <Stat
              title="Completed or closed"
              value={d.completed}
              icon={Check}
            />
            <Stat title="High or urgent open" value={d.urgent} icon={Bell} />
          </div>
          <div className="report-grid">
            {[
              ["Requests by category", d.byCategory],
              ["Open requests by property", d.byProperty],
              ["Request status", d.byStatus],
            ].map(([name, rows]) => (
              <section className="panel" key={name}>
                <h2>{name}</h2>
                {rows.map((r) => (
                  <div className="bar-row" key={r.id || r.name}>
                    <div>
                      <span>{label(r.name)}</span>
                      <strong>{r.count}</strong>
                    </div>
                    <progress
                      aria-label={r.name + " requests"}
                      value={r.count}
                      max={Math.max(1, ...rows.map((x) => x.count))}
                    />
                  </div>
                ))}
              </section>
            ))}
            <section className="panel">
              <h2>Technician performance</h2>
              {d.technicians.map((t) => (
                <div className="metric-row" key={t.id || t.name}>
                  <span>
                    {t.name}
                    <small>{t.completed} completed or closed</small>
                  </span>
                  <strong>
                    {t.rating
                      ? Number(t.rating).toFixed(1) + " / 5"
                      : "Unrated"}
                  </strong>
                </div>
              ))}
              {!d.technicians.length && <p>No completed work yet.</p>}
            </section>
          </div>
        </>
      )}
    </Loading>
  );
}
function Schedule() {
  const state = useData("/requests/scheduled");
  return (
    <>
      <Heading eyebrow="PLAN YOUR DAY" title="My schedule">
        Visit times set by the property manager. Unscheduled jobs remain in your
        maintenance list.
      </Heading>
      <Loading state={state}>
        {(rows) => {
          const scheduled = rows
            .filter((r) => r.scheduledAt && openStatuses.includes(r.status))
            .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
          return scheduled.length ? (
            <div className="schedule-list">
              {scheduled.map((r) => (
                <div key={r.id}>
                  <h2>
                    <CalendarDays size={18} />
                    {date(r.scheduledAt)}
                  </h2>
                  <RequestCards requests={[r]} />
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No visits scheduled">
              You can still view and accept your assigned jobs under
              Maintenance.
            </Empty>
          );
        }}
      </Loading>
    </>
  );
}
function SettingsPage({ notify, onOrganisation }) {
  const state = useData("/settings");
  return (
    <>
      <Heading eyebrow="ADMINISTRATION" title="Workspace settings">
        Keep your organisation’s details current.
      </Heading>
      <Loading state={state}>
        {(s) => (
          <div className="panel narrow">
            <Form
              onSave={async (f) => {
                await api("/settings", "PUT", Object.fromEntries(f));
                onOrganisation(f.get("orgName"));
                notify("Settings saved.");
              }}
            >
              <Field label="Organisation name">
                <input
                  name="orgName"
                  required
                  minLength={2}
                  maxLength={80}
                  defaultValue={s.orgName}
                />
              </Field>
              <p className="subtle">
                Request updates are delivered to the in-app notification centre.
              </p>
            </Form>
          </div>
        )}
      </Loading>
    </>
  );
}
function Profile({ user, onUser, logout, notify }) {
  return (
    <>
      <Heading eyebrow="YOUR ACCOUNT" title="Profile and security">
        Update your contact details and password.
      </Heading>
      <div className="panel narrow">
        <Form
          onSave={async (f) => {
            const result = await api("/profile", "PUT", Object.fromEntries(f));
            onUser(result);
            if (f.get("password")) {
              await logout();
            }
            notify("Profile saved.");
          }}
        >
          <Field label="Full name">
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              defaultValue={user.name}
            />
          </Field>
          <Field label="Email">
            <input
              name="email"
              type="email"
              required
              defaultValue={user.email}
            />
          </Field>
          <Field
            label="Current password"
            hint="Required when changing your email or password."
          >
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
            />
          </Field>
          <Field
            label="New password"
            hint="Leave blank to keep your password. 10+ characters with uppercase, lowercase and a number."
          >
            <input
              name="password"
              type="password"
              minLength={10}
              maxLength={72}
              autoComplete="new-password"
            />
          </Field>
        </Form>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
