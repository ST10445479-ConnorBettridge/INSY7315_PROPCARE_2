import { useState } from "react";
import { Bell } from "lucide-react";
import { api } from "../api.js";
import { useData } from "../hooks.js";
import { Loading, Heading, Empty } from "../components/shared.jsx";
import { label, date } from "../format.js";

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

export { Notifications };
