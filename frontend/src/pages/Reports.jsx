import { Wrench, Bell, Check, Clock, Download } from "lucide-react";
import { useData } from "../hooks.js";
import { Loading, Heading } from "../components/shared.jsx";
import { Stat } from "./Overview.jsx";
import { Requests } from "./Requests.jsx";
import { label } from "../format.js";

function Reports() {
  const state = useData("/reports");
  function exportCsv(d) {
    const protect = (v) => {
      let s = String(v);
      if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replaceAll('"', '""') + '"';
    };
    const rows = [
      ["Section", "Name", "Count"],
      ...d.byCategory.map((r) => ["Category", r.name, r.count]),
      ...d.byProperty.map((r) => ["Open by property", r.name, r.count]),
      ...d.byStatus.map((r) => ["Status", r.name, r.count]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((r) => r.map(protect).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "propcare-maintenance-report.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Loading state={state}>
      {(d) => (
        <>
          <Heading
            eyebrow="INSIGHTS FOR BETTER CARE"
            title="Maintenance reports"
            action={
              <button className="btn secondary" onClick={() => exportCsv(d)}>
                <Download size={17} />
                Download CSV
              </button>
            }
          >
            A live view of the requests within your access.
          </Heading>
          <div className="stats">
            <Stat title="All requests" value={d.total} icon={Wrench} />
            <Stat title="Open requests" value={d.open} icon={Clock} />
            <Stat
              title="Completed or closed"
              value={d.completed}
              icon={Check}
            />
            <Stat title="High or urgent open" value={d.urgent} icon={Bell} />
          </div>
          <div className="report-grid">
            {[
              ["Requests by category", d.byCategory],
              ["Open requests by property", d.byProperty],
              ["Request status", d.byStatus],
            ].map(([name, rows]) => (
              <section className="panel" key={name}>
                <h2>{name}</h2>
                {rows.map((r) => (
                  <div className="bar-row" key={r.id || r.name}>
                    <div>
                      <span>{label(r.name)}</span>
                      <strong>{r.count}</strong>
                    </div>
                    <progress
                      aria-label={r.name + " requests"}
                      value={r.count}
                      max={Math.max(1, ...rows.map((x) => x.count))}
                    />
                  </div>
                ))}
              </section>
            ))}
            <section className="panel">
              <h2>Technician performance</h2>
              {d.technicians.map((t) => (
                <div className="metric-row" key={t.id || t.name}>
                  <span>
                    {t.name}
                    <small>{t.completed} completed or closed</small>
                  </span>
                  <strong>
                    {t.rating
                      ? Number(t.rating).toFixed(1) + " / 5"
                      : "Unrated"}
                  </strong>
                </div>
              ))}
              {!d.technicians.length && <p>No completed work yet.</p>}
            </section>
          </div>
        </>
      )}
    </Loading>
  );
}

export { Reports };
