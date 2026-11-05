import { useState } from "react";
import { Building2, Tags, UserRound, Plus, Search, KeyRound } from "lucide-react";
import { api } from "../api.js";
import { useData } from "../hooks.js";
import { Loading, Badge, Field, Heading, Empty, Form, Modal } from "../components/shared.jsx";
import { roles, label } from "../format.js";

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

export { Directory, DirectoryForm };
