import "dotenv/config";

const BASE = process.env.CHATBOT_URL?.replace(/\/$/, "");
const SECRET = process.env.INGEST_SECRET;

if (!BASE || !SECRET) console.warn("[chatbot-sync] CHATBOT_URL / INGEST_SECRET missing: chatbot sync is OFF");

// mongoose document -> plain JSON (ObjectId and Date become strings)
const plain = (d: any) => JSON.parse(JSON.stringify(d));

async function call(path: string, method: "POST" | "DELETE", body?: unknown, retry = true): Promise<void> {
  if (!BASE || !SECRET) return;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "x-ingest-secret": SECRET },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000), // a sleeping free host needs time to wake up
    });
    if (!res.ok) console.error(`[chatbot-sync] ${method} ${path} -> ${res.status}`);
  } catch (err: any) {
    if (retry) {
      await new Promise((r) => setTimeout(r, 5000));
      return call(path, method, body, false);
    }
    console.error(`[chatbot-sync] ${method} ${path} failed:`, err.message); // never breaks the admin save
  }
}

/* ---------- events (details + PDFs + photos) ---------- */
export const syncEvent = (event: unknown) => call("/internal/events/sync", "POST", plain(event));
export const removeEvent = (id: string) => call(`/internal/events/${id}`, "DELETE");

/* ---------- notices / circulars / regulations (text + PDFs + photos) ---------- */
export const syncNotice = (n: any) => {
  const d = plain(n);
  return call("/internal/documents/sync", "POST", { ...d, _id: `notice:${d._id}` });
};
export const removeNotice = (id: string) => call(`/internal/documents/notice:${id}`, "DELETE");

/* ---------- small text records: features, glance cards, linkages ---------- */
const record = (kind: string, d: any, title: string, text: string) =>
  call("/internal/documents/sync", "POST", {
    _id: `${kind}:${d._id}`,
    title,
    category: "other",
    text,
    files: [],
    isPublished: d.isPublished !== false,
  });

export const syncFeature = (f: any) => {
  const d = plain(f);
  const area = d.section === "iic" ? "IIC (Institution's Innovation Council)" : "RDC (Research Development Cell)";
  return record("feature", d, `${area}: ${d.title}`,
    `${area} offering: ${d.title}\n${d.text}${d.tags?.length ? `\nTopics: ${d.tags.join(", ")}` : ""}`);
};
export const syncGlance = (g: any) => {
  const d = plain(g);
  return record("glance", d, `At a glance: ${d.label}`,
    `${d.label}: ${d.value}\n${d.text}${d.footnote ? `\n${d.footnote}` : ""}`);
};
export const syncLinkage = (l: any) => {
  const d = plain(l);
  return record("linkage", d, `Linkage: ${d.title}`,
    `Collaboration / MoU with ${d.title}. Status: ${d.status}.\n${d.text}`);
};

export const removeRecord = (kind: "feature" | "glance" | "linkage", id: string) =>
  call(`/internal/documents/${kind}:${id}`, "DELETE");

/* ---------- campus facilities ---------- */
export const syncFacility = (f: any) => {
  const d = plain(f);
  return call("/internal/documents/sync", "POST", {
    _id: `facility:${d._id}`,
    title: `Campus Facility: ${d.name}`,
    category: d.category ?? "other",
    text: [
      `Campus Facility: ${d.name}`,
      d.description,
      d.location ? `Location: ${d.location}` : "",
      d.operatingHours ? `Operating Hours: ${d.operatingHours}` : "",
      d.contactDetails ? `Contact: ${d.contactDetails}` : "",
      d.amenities?.length ? `Services/Amenities: ${d.amenities.join(", ")}` : "",
    ].filter(Boolean).join("\n"),
    files: d.documents ?? [],
    isPublished: d.isPublished !== false,
  });
};
export const removeFacility = (id: string) => call(`/internal/documents/facility:${id}`, "DELETE");

/* ---------- academic programmes ---------- */
export const syncProgramme = (p: any) => {
  const d = plain(p);
  return call("/internal/documents/sync", "POST", {
    _id: `programme:${d._id}`,
    title: `Academic Programme: ${d.name}`,
    category: d.degreeLevel ?? "other",
    text: [
      `Academic Programme: ${d.name}`,
      `Degree Level: ${d.degreeLevel}`,
      `Department: ${d.department}`,
      `Duration: ${d.duration}`,
      d.eligibilityCriteria ? `Eligibility: ${d.eligibilityCriteria}` : "",
      d.admissionRequirements ? `Admission Requirements: ${d.admissionRequirements}` : "",
      d.courseOverview ? `Course Overview: ${d.courseOverview}` : "",
      d.availableSeats !== undefined ? `Available Seats: ${d.availableSeats}` : "",
    ].filter(Boolean).join("\n"),
    files: d.syllabus ?? [],
    isPublished: d.isPublished !== false,
  });
};
export const removeProgramme = (id: string) => call(`/internal/documents/programme:${id}`, "DELETE");

// what the chatbot has indexed right now (used by the admin Index Status page)
export async function getIndex(): Promise<{ ids: string[]; cache: Record<string, number>; empty: string[] }> {
  if (!BASE || !SECRET) throw new Error("Chatbot sync is not configured (CHATBOT_URL / INGEST_SECRET)");
  const res = await fetch(`${BASE}/internal/index`, {
    headers: { "x-ingest-secret": SECRET },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Chatbot returned ${res.status}`);
 return res.json() as Promise<{ ids: string[]; cache: Record<string, number>; empty: string[] }>;
}