import { STORAGE_KEY_PUBLISHED } from "./config.js";

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
let expanded = new Set();

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

async function loadHandbook(){
  // Employees should use committed file. Allow optional local "published" override for admin testing.
  const local = localStorage.getItem(STORAGE_KEY_PUBLISHED);
  if(local){
    try { return JSON.parse(local); } catch {}
  }
  const res = await fetch("./data/handbook.json", { cache: "no-store" });
  if(!res.ok) throw new Error("Failed to load handbook.json");
  return await res.json();
}

function findSection(id){ return handbook.sections.find(s => s.id === id); }
function findSub(section, subId){ return (section.subpolicies || []).find(p => p.id === subId); }

function setActive(sectionId, subId){
  // Accordion: expand only the selected main heading
  expanded = new Set([sectionId]);

  active.sectionId = sectionId;
  active.subId = subId;
  const url = new URL(window.location.href);
  url.searchParams.set("section", sectionId);
  url.searchParams.set("policy", subId);
  history.replaceState({}, "", url.toString());
  render();
}

function ensureDefault(){
  const url = new URL(window.location.href);
  const s = url.searchParams.get("section");
  const p = url.searchParams.get("policy");
  if(s && p){
    active.sectionId = s;
    active.subId = p;
    expanded.add(s);
    return;
  }
  const first = handbook.sections?.[0];
  const firstSub = first?.subpolicies?.[0];
  if(first && firstSub){
    active.sectionId = first.id;
    active.subId = firstSub.id;
    expanded.add(first.id);
  }
}

function parseBlocks(blocks){
  const bullets = [];
  const paras = [];
  (blocks || []).forEach(b => {
    if(b.type === "li") bullets.push(b.text);
    else paras.push(b.text);
  });
  return { bullets, paras };
}

function renderContent(){
  const section = findSection(active.sectionId);
  const sub = section ? findSub(section, active.subId) : null;
  if(!section || !sub){
    els.content.innerHTML = "<h2>Select a policy</h2><p class='meta'>Choose a policy from the menu.</p>";
    return;
  }
  const { bullets, paras } = parseBlocks(sub.blocks);
  const pdfHref = sub.pdf ? `${sub.pdf}${sub.pdfPage ? `#page=${encodeURIComponent(sub.pdfPage)}` : ""}` : "";
  const pdfBtn = sub.pdf ? `<a class="btn" href="${escapeHtml(pdfHref)}" target="_blank" rel="noopener">Download / Print PDF</a>` : "";
  els.content.innerHTML = `
    <h2>${escapeHtml(sub.title)}</h2>
    <p class="meta"><b>${escapeHtml(section.title)}</b> • ${escapeHtml(sub.summary || "")}</p>
    <div class="row">
      ${pdfBtn}
      <button class="btn" data-copy>Copy link</button>
    </div>
    <div class="hr"></div>
    ${(!paras.length && !bullets.length) ? `
      <div class="notice">
        <b>Text not added yet.</b>
        <div class="small">This policy currently links to the PDF. An admin can add editable text from <span class="kbd">/admin.html</span>.</div>
      </div>
    ` : ""}
    ${paras.length ? `<div class="card"><h3 style="margin:0 0 8px;font-size:14px">Overview</h3>
      ${paras.map(t=>`<p style="margin:10px 0;line-height:1.6;color:rgba(255,255,255,.92)">${escapeHtml(t)}</p>`).join("")}
    </div>` : ""}
    ${bullets.length ? `<div class="card"><h3 style="margin:0 0 8px;font-size:14px">Details</h3>
      <ul class="clean">${bullets.map(t=>`<li>${escapeHtml(t)}</li>`).join("")}</ul>
    </div>` : ""}
  `;
  const btn = els.content.querySelector("[data-copy]");
  btn?.addEventListener("click", async () => {
    try{
      await navigator.clipboard.writeText(window.location.href);
      btn.textContent = "Copied!";
      setTimeout(()=>btn.textContent="Copy link", 1200);
    }catch{ alert("Copy failed. Copy from the address bar."); }
  });
}

function matchesSearch(q, section, sub){
  if(!q) return true;
  const hay = [
    section.title, section.summary || "",
    sub.title, sub.summary || "",
    ...(sub.blocks || []).map(b=>b.text)
  ].join(" ").toLowerCase();
  return hay.includes(q);
}

function renderMenu(){
  const q = (els.search.value || "").trim().toLowerCase();
  els.groups.innerHTML = "";
  handbook.sections.forEach(section => {
    const subs = (section.subpolicies || []).filter(sp => matchesSearch(q, section, sp));
    if(q && subs.length === 0) return;

    const isOpen = expanded.has(section.id) || (q && subs.length > 0);
    const group = document.createElement("div");
    group.className = "group";
    group.innerHTML = `
      <div class="group-header" data-toggle="${escapeHtml(section.id)}">
        <div>
          <h3>${escapeHtml(section.title)}</h3>
          <p>${escapeHtml(section.summary || "")}</p>
        </div>
        <div class="chev">${isOpen ? "▾" : "▸"}</div>
      </div>
      <div class="sublist" style="display:${isOpen ? "flex" : "none"}"></div>
    `;
    const sublist = group.querySelector(".sublist");
    subs.forEach(sp => {
      const div = document.createElement("div");
      div.className = "subitem" + (active.sectionId===section.id && active.subId===sp.id ? " active" : "");
      div.innerHTML = `<h4>${escapeHtml(sp.title)}</h4><p>${escapeHtml(sp.summary || "")}</p>`;
      div.addEventListener("click", ()=> setActive(section.id, sp.id));
      sublist.appendChild(div);
    });

    group.querySelector("[data-toggle]")?.addEventListener("click", () => {
      // Accordion: clicking a main heading expands it and collapses others
      if (isOpen) {
        expanded.delete(section.id);
        render();
        return;
      }
      expanded = new Set([section.id]);
      // When a main heading is clicked, auto-select the first visible sub-policy
      const first = subs[0];
      if (first) {
        active.sectionId = section.id;
        active.subId = first.id;
      }
      render();
    });
els.groups.appendChild(group);
  });
}

function render(){
  renderMenu();
  renderContent();
}

(async function main(){
  try{
    handbook = await loadHandbook();
    els.title.textContent = handbook.meta?.title || "Company Policies & Employee Handbook";
    els.subtitle.textContent = handbook.meta?.subtitle || "";
    els.search.addEventListener("input", render);
    ensureDefault();
    render();
  }catch(err){
    console.error(err);
    els.fatal.innerHTML = `
      <div class="notice danger">
        <b>Could not load handbook data.</b>
        <div class="small">Run this site using Live Server (http://...) and confirm <span class="kbd">data/handbook.json</span> exists.</div>
      </div>
    `;
  }
})();
