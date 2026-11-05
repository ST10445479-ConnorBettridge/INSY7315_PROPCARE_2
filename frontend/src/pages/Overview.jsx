import { Wrench, Bell, Plus, ArrowRight, Check, ShieldCheck, Clock } from "lucide-react";
import { useData } from "../hooks.js";
import { Loading, Heading } from "../components/shared.jsx";
import { RequestCards } from "../components/RequestCards.jsx";
import { Report } from "./Report.jsx";

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

export { Overview, Stat };
