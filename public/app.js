import { makeEditor, htmlMode, cssMode, jsMode } from "./editor.js";

// Utility functions
const $ = (sel) => document.querySelector(sel);
let _unsavedBackup = null;
const debounce = (fn, ms) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

function replaceAll(editorView, newText) {
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: newText },
  });
}

const preview = $("#preview");

// Prefix asset paths so “assets/foo.png” → “/assets/<id>/foo.png”
function prefixAssets(src, id) {
  return src.replace(
    /(["'(])assets\/([^"'() )]+)/g,
    (_, before, filename) => `${before}/assets/${id}/${filename}`,
  );
}

// 1) Write a minimal iframe document once:
function initPreview() {
  const doc = preview.contentDocument || preview.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html>
    <html>
      <head><style id="style-pane"></style></head>
      <body>
        <div id="html-content"></div>
        <script>
          document.addEventListener('click', e => {
            const a = e.target.closest('a');
            if (!a) return;

            const raw = a.getAttribute('href') || '';
            // 1) If it starts with "www.", treat as external
            if (/^www\\./i.test(raw)) {
              e.preventDefault();
              window.open('https://' + raw, '_blank');
              return;
            }

            // 2) Otherwise resolve it and compare origins
            let url;
            try {
              url = new URL(raw, location.href);
            } catch {
              return; // not a valid URL
            }
            if (url.origin !== location.origin) {
              e.preventDefault();
              window.open(url.href, '_blank');
            }
            // else let it navigate inside the iframe
          });
        <\/script>        <script id="js-pane"><\/script>
      </body>
    </html>`);

  doc.close();
}

const scheduleSave = debounce(saveProject, 2000);

// 2) Update just the CSS, HTML and JS in‐place:
function renderPreview() {
  const doc = preview.contentDocument || preview.contentWindow.document;
  const id = currentId; // your project ID
  // apply path‐prefixing
  const html = prefixAssets(htmlEditor.state.doc.toString(), id);
  const css = prefixAssets(cssEditor.state.doc.toString(), id);
  const js = jsEditor.state.doc.toString();

  // inject into the iframe
  doc.getElementById("style-pane").textContent = css;
  doc.getElementById("html-content").innerHTML = html;
  [...doc.querySelectorAll("script[data-user]")].forEach((s) => s.remove());

  const scriptEl = doc.createElement("script");
  scriptEl.textContent = js;
  scriptEl.setAttribute("data-user", "true");
  doc.body.appendChild(scriptEl);
}

function onEditorChange() {
  renderPreview();
  scheduleSave();
}

const htmlEditor = makeEditor(
  "editor-html",
  htmlMode,
  onEditorChange,
  "<!-- HTML here -->",
);
const cssEditor = makeEditor(
  "editor-css",
  cssMode,
  onEditorChange,
  "/* CSS here */",
);
const jsEditor = makeEditor("editor-js", jsMode, onEditorChange, "// JS here");

// replace all your old eHTML.getValue / eHTML.setValue calls with
// htmlEditor.state.doc.toString()  &  htmlEditor.dispatch({changes…})

initPreview();
renderPreview();

// Utility: scan code blobs for used asset filenames
function findUsedAssets() {
  const code =
    htmlEditor.state.doc.toString() +
    cssEditor.state.doc.toString() +
    jsEditor.state.doc.toString();
  const matches = code.match(/assets\/([^\s"'()]+)/g) || [];
  return new Set(matches.map((m) => m.replace(/^assets\//, "").toLowerCase()));
}

// Show / hide modal
const mgrBtn = document.getElementById("manageAssetsBtn");
const modal = document.getElementById("assetManagerModal");
const closeBtn = document.getElementById("assetManagerClose");
const listEl = document.getElementById("assetManagerList");

// Reusable: fetch + render asset list with delete buttons
async function refreshAssetManager() {
  if (!currentId) return;
  const all = await fetch(`/api/assets/${currentId}`).then((r) => r.json());
  const used = findUsedAssets();

  listEl.innerHTML = "";
  all.forEach((file) => {
    const li = document.createElement("li");
    li.textContent =
      file + (used.has(file.toLowerCase()) ? " (wird benutzt)" : "");
    if (!used.has(file.toLowerCase())) {
      const del = document.createElement("button");
      del.textContent = "Löschen";
      del.onclick = async () => {
        if (!confirm(`"${file}" wirklich löschen?`)) return;
        await fetch(`/api/assets/${currentId}/${file}`, { method: "DELETE" });
        await refreshAssetManager(); // re-draw after delete
      };
      li.appendChild(del);
    }
    listEl.appendChild(li);
  });
}

mgrBtn.addEventListener("click", async () => {
  await saveProject();
  if (!currentId) return alert("Save a project first!");
  await refreshAssetManager(); // build the list
  modal.classList.remove("hidden"); // show the modal
});

closeBtn.addEventListener("click", () => {
  modal.classList.add("hidden");
});

// Layout toggle
$("#layoutBtn").addEventListener("click", () => {
  const ws = $("#workspace");
  const ed = $("#editors");
  const isVertical = ws.classList.toggle("vertical");

  ws.classList.toggle("horizontal", !isVertical);
  ed.classList.toggle("vertical", isVertical);
  ed.classList.toggle("horizontal", !isVertical);

  if (gridIcon.style.display === "none") {
    gridIcon.style.display = "";
    listIcon.style.display = "none";
  } else {
    gridIcon.style.display = "none";
    listIcon.style.display = "";
  }
});

// JS Pane toggle
$("#toggleJsBtn").addEventListener("click", () => {
  $("#editors").classList.toggle("hide-js");
});

// --- Templates with confirm & undo ---
let _templateBackup = null;
const sel = document.querySelector("#templateSelect");
const undoBtn = document.createElement("button");
const linkElem = document.querySelector("#link");
undoBtn.textContent = "Vorlage rückgängig";
undoBtn.style.display = "none";
document.querySelector("header").appendChild(undoBtn);

undoBtn.addEventListener("click", () => {
  if (!_templateBackup) return;
  replaceAll(htmlEditor, _templateBackup.html);
  replaceAll(cssEditor, _templateBackup.css);
  replaceAll(jsEditor, _templateBackup.js);
  currentId = _templateBackup.id;
  if (currentId) {
    history.replaceState(null, "", _templateBackup.url);
    linkElem.textContent = _templateBackup.url;
  } else {
    linkElem.textContent = "";
  }
  renderPreview();
  _templateBackup = null;
  undoBtn.style.display = "none";
  sel.value = ""; // reset dropdown
});

fetch("/api/templates")
  .then((r) => r.json())
  .then((list) => {
    list.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      sel.append(opt);
    });

    sel.addEventListener("change", () => {
      if (!sel.value) return;

      // backup current code
      const current = {
        html: htmlEditor.state.doc.toString(),
        css: cssEditor.state.doc.toString(),
        js: jsEditor.state.doc.toString(),
        id: currentId,
        url: linkElem.textContent,
      };
      const hasContent = current.html || current.css || current.js;

      if (hasContent) {
        const ok = confirm(
          "Laden einer Vorlage überschreibt deinen aktuellen Code.\n" +
            "Möchtest du fortfahren?",
        );
        if (!ok) {
          sel.value = ""; // cancel
          return;
        }
        // store backup for undo
        _templateBackup = current;
        undoBtn.style.display = "";
      }

      // fetch & apply
      fetch(`/api/template/${sel.value}`)
        .then((r) => r.json())
        .then((t) => {
          replaceAll(htmlEditor, t.html || "");
          replaceAll(cssEditor, t.css || "");
          replaceAll(jsEditor, t.js || "");
          currentId = null;
          history.replaceState(null, "", `/p/`); // or just leave URL blank
          linkElem.textContent = "";
          renderPreview();
          sel.value = ""; // reset
        });
    });
  });

// Save / Auto-save
let currentId = (location.pathname.match(/^\/p\/(\S+)/) || [])[1] || null;
if (currentId) linkElem.textContent = decodeURI(currentId);
async function saveProject() {
  const payload = {
    html: htmlEditor.state.doc.toString(),
    css: cssEditor.state.doc.toString(),
    js: jsEditor.state.doc.toString(),
  };
  const res = await fetch(currentId ? `/save/${currentId}` : "/save", {
    method: currentId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.ok) {
    const { id, url } = await res.json();
    currentId = id;
    if (url) history.replaceState(null, "", url);
    linkElem.textContent = decodeURIComponent(currentId);
  }
}
$("#saveBtn").addEventListener("click", saveProject);

// Export ZIP
$("#exportBtn").addEventListener("click", async () => {
  const payload = {
    html: htmlEditor.state.doc.toString(),
    css: cssEditor.state.doc.toString(),
    js: jsEditor.state.doc.toString(),
  };
  const res = await fetch(`/package/${currentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return alert("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "project.zip";
  a.click();
  URL.revokeObjectURL(url);
});

const assetInput = document.getElementById("assetInput");

assetInput.addEventListener("change", async (e) => {
  await saveProject();

  const fd = new FormData();
  for (const f of e.target.files) fd.append("files", f);

  try {
    const res = await fetch(`/upload/${currentId}`, {
      method: "POST",
      body: fd,
    });
  } catch (err) {
    console.error("❌ upload failed:", err);
  }
  assetInput.value = "";
  await refreshAssetManager();
});

// before: was using assetList
async function loadAssets() {
  if (!currentId) return;
  const list = await fetch(`/api/assets/${currentId}`).then((r) => r.json());
  // use the modal’s <ul id="assetManagerList">
  listEl.innerHTML = "";
  list.forEach((file) => {
    const li = document.createElement("li");
    li.textContent = file + /* optional “in use” tag */ "";
    listEl.appendChild(li);
  });
}

// ZIP import
$("#zipInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("zip", file);
  const r = await fetch("/importzip", { method: "POST", body: fd });
  if (r.ok) {
    alert("Import hat leider nicht funktioniert!");
    return;
  }
  const { html, css, js } = await r.json();
  replaceAll(htmlEditor, html);
  replaceAll(cssEditor, css);
  replaceAll(jsEditor, js);
  initPreview();
  renderPreview();

  currentId = null;
  $("#link").textContent = "";
});

// Initial render / load project content
if (currentId) {
  fetch(`/api/project/${currentId}`)
    .then((r) => r.json())
    .then((p) => {
      htmlEditor.dispatch({
        changes: { from: 0, to: htmlEditor.state.doc.length, insert: p.html },
      });
      cssEditor.dispatch({
        changes: { from: 0, to: cssEditor.state.doc.length, insert: p.css },
      });
      jsEditor.dispatch({
        changes: { from: 0, to: jsEditor.state.doc.length, insert: p.js },
      });
      renderPreview();
    });
} else {
  renderPreview();
}
