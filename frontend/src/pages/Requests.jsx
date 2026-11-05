import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useData } from "../hooks.js";
import { Loading, Heading } from "../components/shared.jsx";
import { RequestCards } from "../components/RequestCards.jsx";
import { openStatuses, label } from "../format.js";

function Requests() {
  const [status, setStatus] = useState(""),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const state = useData(
    `/requests/page?page=${page}&pageSize=24&status=${encodeURIComponent(status)}&q=${encodeURIComponent(query)}`,
  );
  return (
    <>
      <Heading eyebrow="MAINTENANCE" title="Every request, in one place">
        Track progress and find the details you need.
      </Heading>
      <div className="filters">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Search requests"
            placeholder="Search by issue, property or request number"
            maxLength={120}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {[
            ...openStatuses,
            "completed",
            "closed",
            "cancelled",
            "rejected",
          ].map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
      </div>
      <Loading state={state}>
        {(result) => (
          <>
            <p className="subtle" role="status">
              {result.total} matching requests · Page {page} of{" "}
              {Math.max(1, Math.ceil(result.total / result.pageSize))}
            </p>
            <RequestCards requests={result.items} />
            <nav className="pagination" aria-label="Request pages">
              <button
                className="btn secondary"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous page
              </button>
              <button
                className="btn secondary"
                disabled={page * result.pageSize >= result.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next page
              </button>
            </nav>
          </>
        )}
      </Loading>
    </>
  );
}

export { Requests };
