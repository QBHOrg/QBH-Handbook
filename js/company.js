// company.js (view-only)
// Loads company info from published handbook (localStorage) OR from data/handbook.json

const STORAGE_KEY_PUBLISHED = "policyhub_published_handbook_v1";

const el = {
  content: document.getElementById("companyContent"),
  fatal: document.querySelector("[data-company-fatal]"),
};

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getPublishedHandbook() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PUBLISHED);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

async function loadHandbook() {
  const published = getPublishedHandbook();
  if (published) return published;

  const res = await fetch("data/handbook.json", { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.json();
}

function renderCompany(info) {
  if (!info) {
    el.content.innerHTML = `
      <div class="notice">
        <b>No company information published yet.</b>
        <div class="small">Ask your admin to add it from <span class="kbd">/admin.html</span>.</div>
      </div>
    `;
    return;
  }

  const locations = Array.isArray(info.locations) ? info.locations : [];

  const flyerBtn = info.flyer
    ? `<a class="btn" href="${escapeHtml(info.flyer)}" target="_blank" rel="noopener">📎 Download flyer</a>`
    : "";

  el.content.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div>
          <h2>${escapeHtml(info.name || "Company")}</h2>
          ${info.tagline ? `<div class="meta">${escapeHtml(info.tagline)}</div>` : ""}
        </div>
        <div class="actions">${flyerBtn}</div>
      </div>

      <div class="grid-2">
        <div class="mini">
          <div class="k">Address</div>
          <div>${escapeHtml(info.address || "—")}</div>
        </div>
        <div class="mini">
          <div class="k">Phone</div>
          <div>${escapeHtml(info.phone || "—")}</div>
        </div>
        <div class="mini">
          <div class="k">Email</div>
          <div>${escapeHtml(info.email || "—")}</div>
        </div>
        <div class="mini">
          <div class="k">Website</div>
          <div>${info.website ? `<a href="${escapeHtml(info.website)}" target="_blank" rel="noopener">${escapeHtml(info.website)}</a>` : "—"}</div>
        </div>
      </div>

      ${locations.length ? `
        <h3 style="margin-top:18px">Locations</h3>
        <div class="stack">
          ${locations.map(loc => `
            <div class="card mini">
              <b>${escapeHtml(loc.name || "Location")}</b>
              <div class="small">${escapeHtml(loc.address || "")}</div>
              ${loc.phone ? `<div class="small"><span class="kbd">Phone</span> ${escapeHtml(loc.phone)}</div>` : ""}
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${info.notes ? `
        <h3 style="margin-top:18px">Notes</h3>
        <p>${escapeHtml(info.notes)}</p>
      ` : ""}
    </div>
  `;
}

(async function init(){
  try{
    const hb = await loadHandbook();
    renderCompany(hb.companyInfo || null);
  }catch(err){
    console.error(err);
    el.fatal.innerHTML = `
      <div class="notice danger">
        <b>Could not load company information.</b>
        <div class="small">Make sure you run the site with Live Server and that <span class="kbd">data/handbook.json</span> exists.</div>
      </div>
    `;
  }
})();
