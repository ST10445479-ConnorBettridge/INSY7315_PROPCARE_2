import { Wrench, Clock, ChevronRight } from "lucide-react";
import { Badge, Empty } from "./shared.jsx";
import { label, shortId } from "../format.js";

function RequestCards({ requests }) {
  return requests.length ? (
    <div className="request-list">
      {requests.map((r) => (
        <a className="request-card" href={"#/request/" + r.id} key={r.id}>
          <span className={"request-icon urgency-" + r.urgency}>
            <Wrench size={21} />
          </span>
          <div className="request-copy">
            <div className="request-top">
              <small>
                {shortId(r.id)} · {r.categoryName}
              </small>
              <Badge value={r.status} />
            </div>
            <h3>{r.title}</h3>
            <p>
              {r.propertyName} · {r.unit}
            </p>
            <div className="request-bottom">
              <span>
                <Clock size={13} />
                {new Date(r.CreatedAt || r.createdAt).toLocaleDateString(
                  "en-ZA",
                )}
              </span>
              <span className={"priority priority-" + r.urgency}>
                {label(r.urgency)} priority
              </span>
            </div>
          </div>
          <ChevronRight className="card-arrow" size={18} />
        </a>
      ))}
    </div>
  ) : (
    <Empty title="No requests to show">
      New maintenance requests will appear here.
    </Empty>
  );
}

export { RequestCards };
