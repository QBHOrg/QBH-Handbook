// View-only handbook app (index page)
// Renders main headings + subpolicies in the left sidebar and shows selected policy on the right.
// Data source order:
// 1) localStorage "published" handbook (set by admin page, if used)
// 2) fetch data/handbook.json

const STORAGE_KEY_PUBLISHED = "policyhub_published_handbook_v1";

const els = {
  title: document.querySelector("[data-site-title]"),
  subtitle: document.querySelector("[data-site-subtitle]"),
  search: document.querySelector("[data-search]"),
  groups: document.querySelector("[data-groups]"),
  content: document.querySelector("[data-content]"),
  fatal: document.querySelector("[data-fatal]"),
};

let handbook = null;
let active = { sectionId: null, subId: null };

// expanded sections (persisted)
let expanded = new Set(JSON.parse(localStorage.getItem("expandedSections") || "[]"));
function persistExpanded() {
  try { localStorage.setItem("expandedSections", JSON.stringify([...expanded])); } catch {}
}

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
    if (!data || !Array.isArray(data.sections)) return null;
    return data;
  } catch {
    return null;
  }
}

function findSection(id) {
  return handbook?.sections?.find(s => s.id === id) || null;
}
function findSub(section, subId) {
  return section?.subpolicies?.find(sp => sp.id === subId) || null;
}

function setActive(sectionId, subId, { pushUrl = true } = {}) {
  active = { sectionId, subId };

  // ensure section is expanded
  expanded.add(sectionId);
  persistExpanded();

  if (pushUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("section", sectionId);
    url.searchParams.set("policy", subId);
    window.history.replaceState({}, "", url);
  }

  render();
}

function ensureDefaultSelection() {
  const url = new URL(window.location.href);
  const s = url.searchParams.get("section");
  const p = url.searchParams.get("policy");
  if (s && p && findSection(s)) {
    active.sectionId = s;
    active.subId = p;
    expanded.add(s);
    return;
  }

  // default to first available policy
  const first = handbook?.sections?.[0];
  const firstSub = first?.subpolicies?.[0];
  if (first && firstSub) {
    active.sectionId = first.id;
    active.subId = firstSub.id;
    expanded.add(first.id);
  }
}

function parseBlocks(blocks) {
  const bullets = [];
  const paras = [];
  (blocks || []).forEach(b => {
    if (b.type === "li") bullets.push(b.text || "");
    else paras.push(b.text || "");
  });
  return { bullets, paras };
}

function matchesSearch(q, section, sub) {
  if (!q) return true;
  const hay = [
    section.title, section.summary || "",
    sub.title, sub.summary || "",
    ...(sub.blocks || []).map(b => b.text || "")
  ].join(" ").toLowerCase();
  return hay.includes(q);
}

function friendlySubTitle(section, sub) {
  // If there is only one subpolicy called "Policy", display a friendlier label.
  const onlyOne = (section.subpolicies || []).length === 1;
  if (onlyOne && String(sub.title).trim().toLowerCase() === "policy") return "View policy";
  return sub.title || "Policy";
}

function renderMenu() {
  const q = (els.search?.value || "").trim().toLowerCase();
  els.groups.innerHTML = "";

  (handbook.sections || []).forEach(section => {
    const subsAll = section.subpolicies || [];
    const subs = subsAll.filter(sp => matchesSearch(q, section, sp));
    if (q && subs.length === 0) return;

    const isOpen = expanded.has(section.id) || (q && subs.length > 0);

    const group = document.createElement("div");
    group.className = "group";
    group.innerHTML = `
      <div class="group-header" data-toggle="${escapeHtml(section.id)}" role="button" tabindex="0">
        <div>
          <h3>${escapeHtml(section.title)}</h3>
          <p>${escapeHtml(section.summary || "")}</p>
        </div>
        <div class="chev">${isOpen ? "▾" : "▸"}</div>
      </div>
      <div class="sublist" style="display:${isOpen ? "flex" : "none"}"></div>
    `;

    const sublist = group.querySelector(".sublist");

    // show all matching subpolicies under the heading
    subs.forEach(sp => {
      const div = document.createElement("div");
      const isActive = active.sectionId === section.id && active.subId === sp.id;
      div.className = "subitem" + (isActive ? " active" : "");
      div.innerHTML = `
        <h4>${escapeHtml(friendlySubTitle(section, sp))}</h4>
        <p>${escapeHtml(sp.summary || "")}</p>
      `;
      div.addEventListener("click", (e) => {
        e.stopPropagation();
        setActive(section.id, sp.id);
      });
      sublist.appendChild(div);
    });

    // Clicking header toggles. Also: if section has a policy and nothing selected, select first.
    const toggle = group.querySelector("[data-toggle]");
    const toggleFn = () => {
      const nowOpen = expanded.has(section.id);
      if (nowOpen) expanded.delete(section.id);
      else expanded.add(section.id);
      persistExpanded();

      // If user opens a section, also select its first subpolicy (so right panel updates)
      if (!nowOpen) {
        const firstSub = (section.subpolicies || [])[0];
        if (firstSub) setActive(section.id, firstSub.id);
        else render();
      } else {
        render();
      }
    };
    toggle?.addEventListener("click", toggleFn);
    toggle?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleFn(); }
    });

    els.groups.appendChild(group);
  });
}

function renderContent() {
  const section = findSection(active.sectionId);
  const sub = section ? findSub(section, active.subId) : null;

  if (!section || !sub) {
    els.content.innerHTML = `
      <div class="notice">
        <b>No policy selected</b>
        <div class="small">Click a policy on the left to view it here.</div>
      </div>
    `;
    return;
  }

  const { bullets, paras } = parseBlocks(sub.blocks);
  const pdfBtn = sub.pdf
    ? `<a class="btn" href="${escapeHtml(sub.pdf)}" target="_blank" rel="noopener">Download / Print PDF</a>`
    : "";

  els.content.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div>
          <h2>${escapeHtml(sub.title || "Policy")}</h2>
          <div class="meta">${escapeHtml(section.title)}</div>
        </div>
        <div class="actions">${pdfBtn}</div>
      </div>

      ${sub.summary ? `<p class="lead">${escapeHtml(sub.summary)}</p>` : ""}

      ${paras.map(t => `<p>${escapeHtml(t)}</p>`).join("")}

      ${bullets.length ? `<ul>${bullets.map(t => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` : ""}
    </div>
  `;
}

function render() {
  if (!handbook) return;
  renderMenu();
  renderContent();
}

async function loadHandbook() {
  try {
    const published = getPublishedHandbook();
    if (published) return published;

    const res = await fetch("data/handbook.json", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch (err) {
    throw err;
  }
}

// Boot
(async function init() {
  try {
    handbook = await loadHandbook();
    if (!handbook || !Array.isArray(handbook.sections)) throw new Error("Invalid handbook format");

    if (els.title) els.title.textContent = handbook.meta?.title || els.title.textContent || "Company Policies";
    if (els.subtitle) els.subtitle.textContent = handbook.meta?.subtitle || "";

    // Default: expand all sections for view-only users on first visit
    if (expanded.size === 0) {
      expanded = new Set((handbook.sections || []).map(s => s.id));
      persistExpanded();
    }

    ensureDefaultSelection();

    els.search?.addEventListener("input", render);
    render();
  } catch (err) {
    console.error(err);
    if (els.fatal) {
      els.fatal.innerHTML = `
        <div class="notice danger">
          <b>Could not load handbook data.</b>
          <div class="small">Make sure you are running with a local server (Live Server) and that <span class="kbd">data/handbook.json</span> exists.</div>
        </div>
      `;
    }
  }
})();
