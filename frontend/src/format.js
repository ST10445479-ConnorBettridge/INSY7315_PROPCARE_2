export const roles = {
  tenant: "Tenant",
  manager: "Property manager",
  technician: "Technician",
  admin: "Administrator",
};
export const openStatuses = [
  "submitted",
  "under-review",
  "assigned",
  "in-progress",
  "on-hold",
];
export const label = (s) =>
  (s || "").replaceAll("-", " ").replace(/^./, (x) => x.toUpperCase());
export const date = (s) =>
  s
    ? new Date(s).toLocaleString("en-ZA", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not scheduled";
export const shortId = (id) => (id.length > 16 ? id.slice(0, 12).toUpperCase() : id);
