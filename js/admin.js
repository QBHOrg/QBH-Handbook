import {
  ADMIN_USERNAME_HASH,
  ADMIN_PASSWORD_HASH,
  STORAGE_KEY_DRAFT,
  STORAGE_KEY_PUBLISHED,
} from "./config.js";

const $ = (sel) => document.querySelector(sel);

let handbook = null;
let active = { sectionId: null, subId: null };

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function slugify(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || uid("item");
}

async function loadBaseFile() {
  const res = await fetch("./data/handbook.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load handbook.json");
  return await res.json();
}

function loadDraftOrBase(base) {
  const raw = localStorage.getItem(STORAGE_KEY_DRAFT);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // ignore
    }
  }
  return base;
}

function saveDraft(note = "Saved locally (draft).") {
  handbook.meta = handbook.meta || {};
  handbook.meta.updated = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(handbook));
  const hint = $("#saveHint");
  if (hint) {
    hint.textContent = note;
    setTimeout(() => (hint.textContent = ""), 1600);
  }
}

function publishToLocal() {
  localStorage.setItem(STORAGE_KEY_PUBLISHED, JSON.stringify(handbook));
  saveDraft("Published to this browser (index page will use it here)." );
}

function clearDraft() {
  localStorage.removeItem(STORAGE_KEY_DRAFT);
  localStorage.removeItem(STORAGE_KEY_PUBLISHED);
}

function getSection(id) {
  return handbook.sections.find((s) => s.id === id);
}

function getSub(section, id) {
  return (section.subpolicies || []).find((p) => p.id === id);
}

function ensureActive() {
  const first = handbook.sections?.[0];
  const firstSub = first?.subpolicies?.[0];
  if (!active.sectionId || !getSection(active.sectionId)) {
    active.sectionId = first?.id || null;
    active.subId = firstSub?.id || null;
  }
  const sec = active.sectionId ? getSection(active.sectionId) : null;
  if (sec && (!active.subId || !getSub(sec, active.subId))) {
    active.subId = sec.subpolicies?.[0]?.id || null;
  }
}

function parseEditorText(text) {
  const blocks = [];
  const lines = String(text || "").split(/\r?\n/);
  for (const raw of lines) {
    const ln = raw.trim();
    if (!ln) continue;
    if (ln.startsWith("- ") || ln.startsWith("* ")) {
      blocks.push({ type: "li", text: ln.slice(2).trim() });
    } else {
      blocks.push({ type: "p", text: ln });
    }
  }
  return blocks;
}

function blocksToEditorText(blocks) {
  return (blocks || [])
    .map((b) => (b.type === "li" ? "- " : "") + (b.text || ""))
    .join("\n");
}

function openModal(innerHtml) {
  const modal = $("#modal");
  modal.innerHTML = `<div class="content" style="max-width:720px;margin:40px auto">${innerHtml}</div>`;
  modal.style.display = "block";
}

function closeModal() {
  const modal = $("#modal");
  modal.style.display = "none";
  modal.innerHTML = "";
}

function openSectionModal(sectionId) {
  const section = getSection(sectionId);
  if (!section) return;
  openModal(`
    <h2>Edit main heading</h2>
    <div class="field">
      <label>Title</label>
      <input id="secTitle" value="${escapeHtml(section.title)}" />
    </div>
    <div class="field">
      <label>Short summary</label>
      <input id="secSummary" value="${escapeHtml(section.summary || "")}" />
    </div>
    <div class="row">
      <button class="btn primary" id="secSave">Save</button>
      <button class="btn" id="secClose">Close</button>
    </div>
  `);
  $("#secClose").onclick = closeModal;
  $("#secSave").onclick = () => {
    section.title = $("#secTitle").value.trim() || section.title;
    section.summary = $("#secSummary").value.trim();
    saveDraft();
    renderSidebar();
    renderEditor();
    closeModal();
  };
}

function openCredsModal() {
  openModal(`
    <h2>Change Admin Credentials</h2>
    <p class="meta">This site is static. After generating hashes, you must copy them into <span class="kbd">js/config.js</span>.</p>
    <div class="field">
      <label>New Username</label>
      <input id="newUser" placeholder="Enter new username" />
    </div>
    <div class="field">
      <label>New Password</label>
      <input id="newPass" type="password" placeholder="Enter new password" />
    </div>
    <div class="row">
      <button class="btn primary" id="genCreds">Generate hashes</button>
      <button class="btn" id="closeCreds">Close</button>
    </div>
    <div id="credOut" class="small" style="margin-top:10px"></div>
  `);

  $("#closeCreds").onclick = closeModal;
  $("#genCreds").onclick = async () => {
    const u = $("#newUser").value.trim();
    const p = $("#newPass").value;
    if (!u || !p) {
      $("#credOut").textContent = "Username and password required.";
      return;
    }
    const uh = await sha256Hex(u);
    const ph = await sha256Hex(p);
    $("#credOut").innerHTML =
      `<b>Copy these into js/config.js</b><br/>` +
      `export const ADMIN_USERNAME_HASH = \"${uh}\";<br/>` +
      `export const ADMIN_PASSWORD_HASH = \"${ph}\";`;
  };
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportHandbook() {
  const out = structuredClone(handbook);
  out.meta = out.meta || {};
  out.meta.updated = new Date().toISOString();
  downloadJson("handbook.json", out);
  saveDraft("Exported handbook.json (downloaded)." );
}

function importHandbook(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      if (!parsed || !Array.isArray(parsed.sections)) throw new Error("Invalid handbook format");
      handbook = parsed;
      ensureActive();
      saveDraft("Imported and saved as draft.");
      renderSidebar();
      renderEditor();
    } catch (e) {
      alert("Could not import: " + (e?.message || e));
    }
  };
  reader.readAsText(file);
}

function addMainHeading() {
  const title = prompt("Main heading title (example: 'Vol II Sec 6 Waived Lab')");
  if (!title) return;
  const id = slugify(title);
  const section = {
    id,
    title: title.trim(),
    summary: "",
    subpolicies: [],
  };
  handbook.sections.push(section);
  active.sectionId = id;
  active.subId = null;
  saveDraft();
  renderSidebar();
  renderEditor();
}

function addSubpolicy(sectionId) {
  const section = getSection(sectionId);
  if (!section) return;
  section.subpolicies = section.subpolicies || [];
  const pid = uid("policy");
  section.subpolicies.push({
    id: pid,
    title: "New Sub-policy",
    summary: "",
    blocks: [{ type: "p", text: "(Replace this with your policy text.)" }],
    pdf: "",
  });
  active.sectionId = sectionId;
  active.subId = pid;
  saveDraft();
  renderSidebar();
  renderEditor();
}

function deleteSubpolicy(sectionId, subId) {
  const section = getSection(sectionId);
  if (!section) return;
  if (!confirm("Delete this sub-policy?")) return;
  section.subpolicies = (section.subpolicies || []).filter((p) => p.id !== subId);
  active.subId = section.subpolicies?.[0]?.id || null;
  saveDraft();
  renderSidebar();
  renderEditor();
}

function deleteSection(sectionId) {
  if (!confirm("Delete this main heading and all its sub-policies?")) return;
  handbook.sections = handbook.sections.filter((s) => s.id !== sectionId);
  active.sectionId = handbook.sections?.[0]?.id || null;
  active.subId = handbook.sections?.[0]?.subpolicies?.[0]?.id || null;
  saveDraft();
  renderSidebar();
  renderEditor();
}

function renderSidebar() {
  const box = $("#sidebarList");
  box.innerHTML = "";

  handbook.sections.forEach((section) => {
    const wrap = document.createElement("div");
    wrap.className = "group";
    wrap.innerHTML = `
      <div class="group-header" style="cursor:default">
        <div>
          <h3>${escapeHtml(section.title)}</h3>
          <p>${escapeHtml(section.summary || "")}</p>
        </div>
      </div>
      <div class="sublist"></div>
      <div class="row" style="margin:8px 0 0 2px;flex-wrap:wrap">
        <button class="btn" data-add-sub="${escapeHtml(section.id)}">+ Sub-policy</button>
        <button class="btn" data-edit-sec="${escapeHtml(section.id)}">Edit</button>
        <button class="btn" data-del-sec="${escapeHtml(section.id)}">Delete</button>
      </div>
    `;

    const sublist = wrap.querySelector(".sublist");
    (section.subpolicies || []).forEach((sp) => {
      const div = document.createElement("div");
      const isActive = active.sectionId === section.id && active.subId === sp.id;
      div.className = "subitem" + (isActive ? " active" : "");
      div.innerHTML = `<h4 style="margin:0">${escapeHtml(sp.title)}</h4><p style="margin:6px 0 0">${escapeHtml(sp.summary || "")}</p>`;
      div.addEventListener("click", () => {
        active.sectionId = section.id;
        active.subId = sp.id;
        renderSidebar();
        renderEditor();
      });
      sublist.appendChild(div);
    });

    box.appendChild(wrap);
  });

  box.querySelectorAll("[data-add-sub]").forEach((btn) => {
    btn.addEventListener("click", () => addSubpolicy(btn.getAttribute("data-add-sub")));
  });
  box.querySelectorAll("[data-edit-sec]").forEach((btn) => {
    btn.addEventListener("click", () => openSectionModal(btn.getAttribute("data-edit-sec")));
  });
  box.querySelectorAll("[data-del-sec]").forEach((btn) => {
    btn.addEventListener("click", () => deleteSection(btn.getAttribute("data-del-sec")));
  });
}

function renderEditor() {
  const editor = $("#editor");
  ensureActive();

  const section = active.sectionId ? getSection(active.sectionId) : null;
  const sub = section && active.subId ? getSub(section, active.subId) : null;

  if (!section) {
    editor.innerHTML = `<h2>No headings yet</h2><p class="meta">Click <b>+ Main heading</b> to start.</p>`;
    return;
  }

  if (!sub) {
    editor.innerHTML = `
      <h2>${escapeHtml(section.title)}</h2>
      <p class="meta">No sub-policies yet. Click <b>+ Sub-policy</b> under this heading.</p>
      <div class="notice" style="margin-top:14px">
        <b>Tip</b>
        <div class="small">If you want your headings to match your PDFs, name each main heading after the PDF, then create sub-policies for the sections inside that PDF.</div>
      </div>
    `;
    return;
  }

  editor.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <div>
        <h2 style="margin:0">${escapeHtml(sub.title)}</h2>
        <p class="meta" style="margin:6px 0 0"><b>${escapeHtml(section.title)}</b></p>
      </div>
      <div class="row" style="gap:10px;flex-wrap:wrap">
        <button class="btn" id="btnPublish">Publish (this browser)</button>
        <button class="btn" id="btnDeleteSub">Delete sub-policy</button>
      </div>
    </div>

    <div class="hr"></div>

    <div class="field">
      <label>Sub-policy Title</label>
      <input id="spTitle" value="${escapeHtml(sub.title)}" />
    </div>

    <div class="field">
      <label>Short Summary</label>
      <input id="spSummary" value="${escapeHtml(sub.summary || "")}" placeholder="One line summary" />
    </div>

    <div class="field">
      <label>PDF link (optional) — put the PDF inside /pdf and enter: pdf/filename.pdf</label>
      <input id="spPdf" value="${escapeHtml(sub.pdf || "")}" placeholder="pdf/yourfile.pdf" />
    </div>

    <div class="field">
      <label>Policy Text</label>
      <textarea id="spText" rows="14" placeholder="Write paragraphs, and use - for bullet points...">${escapeHtml(blocksToEditorText(sub.blocks))}</textarea>
      <div class="small" style="margin-top:8px;color:var(--muted)">
        Use <span class="kbd">- </span> for bullets. Other lines become paragraphs.
      </div>
    </div>

    <div class="row" style="flex-wrap:wrap">
      <button class="btn primary" id="btnSave">Save</button>
      <span id="saveHint" class="small" style="color:var(--muted)"></span>
    </div>

    <div class="notice" style="margin-top:14px">
      <b>How to keep the legal wording exact</b>
      <div class="small">
        Your PDFs look like scanned pages (images). Automatic extraction can introduce typos.
        The safest way is to open the PDF and copy/paste the text you want into this editor, then export.
      </div>
    </div>
  `;

  $("#btnSave").onclick = () => {
    sub.title = $("#spTitle").value.trim() || sub.title;
    sub.summary = $("#spSummary").value.trim();
    sub.pdf = $("#spPdf").value.trim();
    sub.blocks = parseEditorText($("#spText").value);
    saveDraft();
    renderSidebar();
    renderEditor();
  };

  $("#btnDeleteSub").onclick = () => deleteSubpolicy(section.id, sub.id);
  $("#btnPublish").onclick = publishToLocal;
}

async function login(username, password) {
  const uh = await sha256Hex(username.trim());
  const ph = await sha256Hex(password);
  return uh === ADMIN_USERNAME_HASH && ph === ADMIN_PASSWORD_HASH;
}

async function main() {
  const base = await loadBaseFile();
  handbook = loadDraftOrBase(base);
  handbook.sections = handbook.sections || [];

  // auth
  $("#btnLogin").onclick = async () => {
    const user = $("#adminUsername").value;
    const pass = $("#adminPassword").value;
    const ok = await login(user, pass);
    const msg = $("#authMsg");
    if (!ok) {
      msg.innerHTML = `<div class="notice danger"><b>Login failed.</b><div class="small">Check username and password.</div></div>`;
      return;
    }

    $("#auth").style.display = "none";
    $("#admin").style.display = "block";

    ensureActive();
    renderSidebar();
    renderEditor();
  };

  // admin buttons
  $("#btnAddMain").onclick = addMainHeading;
  $("#btnClearDraft").onclick = () => {
    if (!confirm("Clear local draft and local published copy for this browser?")) return;
    clearDraft();
    location.reload();
  };
  $("#btnCreds").onclick = openCredsModal;
  $("#btnExport").onclick = exportHandbook;

  const fileInput = $("#fileImport") || $("#importFile");
  $("#btnImport").onclick = () => fileInput.click();
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) importHandbook(file);
    fileInput.value = "";
  });

  // clicking outside modal closes it
  $("#modal").addEventListener("click", (e) => {
    if (e.target === $("#modal")) closeModal();
  });
}

main().catch((err) => {
  console.error(err);
  const msg = $("#authMsg");
  if (msg) msg.innerHTML = `<div class="notice danger"><b>Error:</b> ${escapeHtml(err?.message || String(err))}</div>`;
});
document.getElementById("btnCompany").addEventListener("click", () => {
  const data = handbook.companyInfo || {};

  const html = `
    <div class="content">
      <h2>Edit Company Information</h2>

      <label>Company Name</label>
      <input id="ci_name" value="${data.name || ""}">

      <label>Address</label>
      <textarea id="ci_address">${data.address || ""}</textarea>

      <label>Phone</label>
      <input id="ci_phone" value="${data.phone || ""}">

      <label>Email</label>
      <input id="ci_email" value="${data.email || ""}">

      <label>Flyer PDF (optional)</label>
      <input id="ci_flyer" placeholder="pdf/company-flyer.pdf"
             value="${data.flyer || ""}">

      <label>Notes</label>
      <textarea id="ci_notes">${data.notes || ""}</textarea>

      <div class="row">
        <button class="btn primary" id="saveCompany">Save</button>
        <button class="btn" onclick="closeModal()">Cancel</button>
      </div>
    </div>
  `;

  openModal(html);

  document.getElementById("saveCompany").onclick = () => {
    handbook.companyInfo = {
      name: ci_name.value.trim(),
      address: ci_address.value.trim(),
      phone: ci_phone.value.trim(),
      email: ci_email.value.trim(),
      flyer: ci_flyer.value.trim(),
      notes: ci_notes.value.trim()
    };

    saveDraft();
    closeModal();
    alert("Company information saved.");
  };
});
