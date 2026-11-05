import { useRef, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "../api.js";
import { useData } from "../hooks.js";
import { Loading, Heading, Empty } from "../components/shared.jsx";
import { date } from "../format.js";
import "./Notifications.css";

function Notifications({ notify }) {
  const [rev, setRev] = useState(0),
    [unreadOnly, setUnreadOnly] = useState(false),
    [busy, setBusy] = useState(null);
  const filter = useRef();
  const state = useData(`/notifications?unreadOnly=${unreadOnly}`, rev);
  async function markRead(id) {
    if (busy !== null) return;
    setBusy(id ?? "all");
    try {
      await api(id == null ? "/notifications/read" : `/notifications/${id}/read`, "POST");
      setRev(x => x + 1);
      notify(id == null ? "All notifications marked as read." : "Notification marked as read.");
      filter.current?.focus();
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <Heading
        eyebrow="STAY IN THE LOOP"
        title="Notifications"
        action={
          <button
            className="btn secondary"
            disabled={busy !== null || state.loading || !state.data?.some(n => !n.read)}
            onClick={() => markRead(null)}
          >
            {busy === "all" ? "Marking notifications…" : "Mark all read"}
          </button>
        }
      >
        Updates from your property team.
      </Heading>
      <div className="filters">
        <label>
          <input ref={filter} type="checkbox" checked={unreadOnly}
            onChange={event => setUnreadOnly(event.target.checked)} />
          {" "}Show unread only
        </label>
      </div>
      <Loading state={state}>
        {(rows) =>
          rows.length ? (
            <div className="notification-list" aria-busy={busy !== null}>
              {rows.map((n) => (
                <article
                  className={"panel notification " + (!n.read ? "unread" : "")}
                  key={n.id}
                  data-notification-id={n.id}
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
                    <button className="btn secondary small"
                      aria-label={`Mark notification as read: ${n.title}`}
                      disabled={busy !== null} onClick={() => markRead(n.id)}>
                      {busy === n.id ? "Marking…" : "Mark as read"}
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <Empty title={unreadOnly ? "No unread notifications" : "You’re all caught up"}>
              {unreadOnly ? "Clear the filter to see updates you have already read." : "Updates will appear here when your requests change."}
            </Empty>
          )
        }
      </Loading>
    </>
  );
}

export { Notifications };
