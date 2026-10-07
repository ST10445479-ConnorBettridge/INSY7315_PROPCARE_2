const categories = ["Plumbing", "Electrical", "Heating & cooling", "Security", "Appliances", "Building & access"];
const statusLabels = {
  submitted: "Submitted",
  assigned: "Assigned",
  accepted: "Accepted",
  in_progress: "In progress",
  completed: "Completed",
  confirmed: "Confirmed",
  closed: "Closed",
  reopened: "Reopened",
  rejected: "Rejected"
};
const roleLabels = { tenant: "Tenant", manager: "Property manager", technician: "Technician", admin: "Administrator" };
const propertySeed = [
  { id: "p1", name: "Oak Avenue Residences", address: "12 Oak Avenue", suburb: "Claremont", units: 4, manager: "Michael Jacobs" },
  { id: "p2", name: "The Rondebosch Collection", address: "41 Main Road", suburb: "Rondebosch", units: 6, manager: "Michael Jacobs" },
  { id: "p3", name: "Kenilworth Mews", address: "8 Doncaster Road", suburb: "Kenilworth", units: 3, manager: "Ayesha Patel" },
  { id: "p4", name: "Observatory Lofts", address: "17 Lower Trill Road", suburb: "Observatory", units: 3, manager: "Michael Jacobs" },
  { id: "p5", name: "Bellville Grove", address: "5 Voortrekker Road", suburb: "Bellville", units: 2, manager: "Ayesha Patel" },
  { id: "p6", name: "Century City Quays", address: "22 Rialto Road", suburb: "Century City", units: 2, manager: "Michael Jacobs" },
  { id: "p7", name: "Durbanville House", address: "3 Wellington Road", suburb: "Durbanville", units: 2, manager: "Ayesha Patel" },
  { id: "p8", name: "Milnerton Sands", address: "66 Beach Road", suburb: "Milnerton", units: 1, manager: "Michael Jacobs" },
  { id: "p9", name: "Newlands Park", address: "9 Kildare Road", suburb: "Newlands", units: 1, manager: "Ayesha Patel" },
  { id: "p10", name: "Mowbray Terraces", address: "28 Durban Road", suburb: "Mowbray", units: 1, manager: "Michael Jacobs" }
];
const tenantNames = ["Sarah Williams", "Liam Naidoo", "Chloe Petersen", "Thomas Jacobs", "Nadia Khan", "Ethan Daniels", "Mia Botha", "Luke Smith", "Olivia van Wyk", "Noah Martin", "Amelia Ross", "James Adams", "Grace February", "Daniel Meyer", "Zoe Williams"];
const tenantUsers = tenantNames.map((name, i) => ({ id: `u${i + 1}`, name, email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`, phone: `+27 72 555 ${String(2100 + i).slice(-4)}`, role: "tenant", status: "active" }));
const techUsers = ["Daniel Adams", "Priya Naidoo", "Mason Clarke", "Lebo Mokoena", "Imran Davids", "Tara Brown", "Joel Meyer", "Sizwe Nkosi"].map((name, i) => ({ id: `t${i + 1}`, name, email: `${name.toLowerCase().replaceAll(" ", ".")}@horizon.co.za`, phone: `+27 82 440 ${String(1300 + i).slice(-4)}`, role: "technician", status: "active" }));
const staffUsers = [
  { id: "m1", name: "Michael Jacobs", email: "michael.jacobs@horizon.co.za", phone: "+27 21 555 1010", role: "manager", status: "active" },
  { id: "m2", name: "Ayesha Patel", email: "ayesha.patel@horizon.co.za", phone: "+27 21 555 1011", role: "manager", status: "active" },
  { id: "a1", name: "Lauren Daniels", email: "lauren.daniels@horizon.co.za", phone: "+27 21 555 1001", role: "admin", status: "active" },
  { id: "a2", name: "Chris van der Merwe", email: "chris.v@horizon.co.za", phone: "+27 21 555 1002", role: "admin", status: "active" },
  { id: "s1", name: "Nandi Maseko", email: "nandi@horizon.co.za", phone: "+27 21 555 1003", role: "admin", status: "active" },
  { id: "d1", name: "Former team member", email: "former@horizon.co.za", phone: "+27 21 555 1099", role: "technician", status: "deactivated" }
];
const allUsers = [...tenantUsers, ...techUsers, ...staffUsers];
const namesForRequests = ["Leaking tap in bathroom", "Intercom not working", "Bedroom light flickering", "Oven not heating", "Access gate remote issue", "Mould around window", "Pool pump making noise", "Ceiling stain after rain", "Loose cupboard hinge"];
const seedHistory = (id, status, actorId, text) => [{ id: `${id}-h1`, status, actorId, text, createdAt: "2024-06-14T09:00:00" }];
const generatedRequests = Array.from({ length: 39 }, (_, i) => {
  const tenant = tenantUsers[i % tenantUsers.length];
  const property = propertySeed[i % propertySeed.length];
  const status = ["submitted", "assigned", "accepted", "in_progress", "completed", "closed"][i % 6];
  const tech = techUsers[i % techUsers.length];
  const id = `REQ-${1046 + i}`;
  return {
    id,
    propertyId: property.id,
    unit: `${i % property.units + 1}${["A", "B", "C"][i % 3]}`,
    tenantId: tenant.id,
    title: namesForRequests[i % namesForRequests.length],
    description: "A maintenance issue reported by the resident. Please inspect and resolve with care.",
    category: categories[i % categories.length],
    priority: ["Low", "Medium", "High"][i % 3],
    status,
    createdAt: `2024-06-${String(1 + i % 18).padStart(2, "0")}T${String(8 + i % 9).padStart(2, "0")}:20:00`,
    updatedAt: "2024-06-20T14:30:00",
    assignedTechnicianId: i % 4 === 0 ? void 0 : tech.id,
    comments: i % 5 === 0 ? [{ id: `${id}-c1`, authorId: "m1", text: "We have scheduled this for the next available visit.", createdAt: "2024-06-15T11:20:00" }] : [],
    history: seedHistory(id, status, i % 4 === 0 ? tenant.id : tech.id, statusLabels[status]),
    attachments: status === "completed" || status === "closed" ? [{ id: `${id}-a1`, kind: "after", name: "completed-work.jpg", createdAt: "2024-06-19T15:00:00" }] : [],
    rating: status === "closed" ? 4 + i % 2 : void 0
  };
});
const primaryRequest = {
  id: "REQ-1045",
  propertyId: "p1",
  unit: "3B",
  tenantId: "u1",
  title: "Kitchen sink leaking",
  description: "The kitchen sink has been dripping continuously from the trap. Water is collecting under the cabinet and the cupboard base is starting to swell.",
  category: "Plumbing",
  priority: "High",
  status: "submitted",
  createdAt: "2024-06-14T09:00:00",
  updatedAt: "2024-06-14T09:00:00",
  comments: [],
  history: seedHistory("REQ-1045", "submitted", "u1", "Request submitted by Sarah Williams"),
  attachments: []
};
const defaultState = { users: allUsers, properties: propertySeed, requests: [primaryRequest, ...generatedRequests], notifications: [
  { id: "n1", userId: "u1", title: "Request received", text: "REQ-1045 is now in our maintenance queue.", requestId: "REQ-1045", read: false, createdAt: "2024-06-14T09:01:00" },
  { id: "n2", userId: "m1", title: "New high priority request", text: "Kitchen sink leaking needs your review.", requestId: "REQ-1045", read: false, createdAt: "2024-06-14T09:02:00" }
] };
window.PROPCARE_SEED = { categories, statusLabels, roleLabels, defaultState };
