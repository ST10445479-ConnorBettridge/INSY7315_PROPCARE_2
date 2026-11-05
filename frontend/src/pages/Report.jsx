import { useState } from "react";
import { Camera } from "lucide-react";
import { api, upload } from "../api.js";
import { go, useData } from "../hooks.js";
import { Loading, Field, Heading, Empty, Form } from "../components/shared.jsx";
import { label } from "../format.js";

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

export { Report };
