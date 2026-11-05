import { Settings } from "lucide-react";
import { api } from "../api.js";
import { useData } from "../hooks.js";
import { Loading, Field, Heading, Form } from "../components/shared.jsx";
import { label } from "../format.js";

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
                Request updates appear in the notification centre.
                {s.emailEnabled ? " Email updates are also enabled." : " Email updates are not enabled for this workspace."}
              </p>
              {s.emailEnabled && <p role="status">{s.queuedEmails} email updates queued. {s.failedEmails} need attention.</p>}
            </Form>
            {s.failedEmails > 0 && <button className="btn secondary" onClick={async () => {
              try { const result = await api("/notifications/email/retry", "POST"); notify(result.message); }
              catch (error) { notify(error.message); }
            }}>Retry failed emails</button>}
          </div>
        )}
      </Loading>
    </>
  );
}

export { SettingsPage };
