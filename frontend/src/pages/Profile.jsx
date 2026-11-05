import { api } from "../api.js";
import { Field, Heading, Form } from "../components/shared.jsx";
import { label } from "../format.js";

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

export { Profile };
