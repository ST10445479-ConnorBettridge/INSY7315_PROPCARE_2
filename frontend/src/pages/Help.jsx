import { Heading } from "../components/shared.jsx";
import { roles } from "../format.js";

const guides = {
  tenant: {
    title: "Report and track a repair",
    steps: [
      "Open Report an issue. Choose your linked unit and category, describe the problem and select an urgency.",
      "Add a photo if it helps, then submit once. If only the upload fails, retry the photo on the saved request.",
      "Open Maintenance to follow status changes, read history and add comments.",
      "When work is completed, confirm the repair or reopen it with an explanation. You can rate completed work once."
    ],
    link: "report", action: "Report an issue"
  },
  manager: {
    title: "Review and assign maintenance",
    steps: [
      "Open Maintenance and select a request within one of your managed properties.",
      "Review the details, assign an active technician, set urgency and optionally schedule a future visit.",
      "Follow status history and comments as the technician works. Available actions depend on the current status.",
      "Review completed work and approve closure where appropriate. Reports shows your scoped totals and CSV export."
    ],
    link: "requests", action: "Review maintenance"
  },
  technician: {
    title: "Complete an assigned job",
    steps: [
      "Open Maintenance to find jobs assigned to you. Open a job and accept it or reject the assignment when appropriate.",
      "Check My schedule for dated visits. Add work notes and before or after photos to the request.",
      "Place work on hold when necessary and resume it when you are ready.",
      "Mark the repair complete after recording the outcome. The tenant may confirm or reopen it, and the manager can approve it."
    ],
    link: "schedule", action: "Open my schedule"
  },
  admin: {
    title: "Set up accounts and properties",
    steps: [
      "Open Users and roles to create or update accounts. Choose the correct role and active state.",
      "Create a property with its responsible manager, then use Tenant links to connect a verified tenant to a unit.",
      "Maintain categories and technician details. Archive records through their controls so linked history is retained.",
      "Use Settings to update the organisation and inspect email delivery counts when email is enabled."
    ],
    link: "users", action: "Manage accounts"
  }
};

function Help({ user }) {
  const guide = guides[user.role];
  return (
    <>
      <Heading eyebrow="USING PROPCARE" title="Help and support">
        Practical steps for your {roles[user.role].toLowerCase()} workspace.
      </Heading>
      <div className="report-grid">
        <section className="panel">
          <h2>{guide.title}</h2>
          <ol>{guide.steps.map(step => <li key={step}><p>{step}</p></li>)}</ol>
          <a className="btn primary" href={`#/${guide.link}`}>{guide.action}</a>
        </section>
        <section className="panel">
          <h2>Notifications and account access</h2>
          <p>Open Notifications to see updates. Use Show unread only to find new messages, Mark as read for one update, or Mark all read for your account.</p>
          <p>Email copies are available only when the workspace has enabled email delivery. In-app updates remain available independently.</p>
          <p>Use Profile and security to change your details. Changing your email or password requires your current password.</p>
          <a className="btn secondary" href="#/notifications">Open notifications</a>
        </section>
        <section className="panel">
          <h2>Common questions</h2>
          <details><summary>Why is a maintenance action missing?</summary><p>Actions depend on your role and the request status. Refresh the request to check for another participant's changes.</p></details>
          <details><summary>Which photos can I upload?</summary><p>Use an actual JPEG, PNG or WebP under 5 MB. Each request allows up to ten photos. Renaming an unsupported file does not convert it.</p></details>
          <details><summary>Why can a new tenant not report an issue?</summary><p>An administrator must first verify the tenant and link an active property and unit. Registration alone does not create that link.</p></details>
          <details><summary>What if my session expires?</summary><p>Sign in again. Repeated incorrect passwords can temporarily lock an account; ask an administrator for an account or password reset.</p></details>
        </section>
      </div>
    </>
  );
}

export { Help };
