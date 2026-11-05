import { CalendarDays } from "lucide-react";
import { useData } from "../hooks.js";
import { Loading, Heading, Empty } from "../components/shared.jsx";
import { RequestCards } from "../components/RequestCards.jsx";
import { openStatuses, date } from "../format.js";

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

export { Schedule };
