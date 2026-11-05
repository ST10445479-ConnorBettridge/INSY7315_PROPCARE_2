import { useEffect, useState } from "react";
import { Plus, ArrowLeft } from "lucide-react";
import { api, raw, upload } from "../api.js";
import { useData } from "../hooks.js";
import { Loading, Badge, Field, Heading, Form, Modal } from "../components/shared.jsx";
import { roles, label, date, shortId } from "../format.js";
import "./RequestDetail.css";

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

export { Photo, Detail, Assignment };
