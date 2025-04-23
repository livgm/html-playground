// Utility functions
const $ = (sel) => document.querySelector(sel);
const debounce = (fn, ms) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

// Initialize CodeMirror editors
const editorOptions = {
  theme: "material-darker",
  lineNumbers: true,
  autoCloseTags: true,
  autoCloseBrackets: true,
  extraKeys: { "Ctrl-Space": "autocomplete" },
};
const eHTML = CodeMirror.fromTextArea($("#html"), {
  ...editorOptions,
  mode: "text/html",
});
const eCSS = CodeMirror.fromTextArea($("#css"), {
  ...editorOptions,
  mode: "css",
});
const eJS = CodeMirror.fromTextArea($("#js"), {
  ...editorOptions,
  mode: "javascript",
});
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
        <script id="js-pane"><\/script>
      </body>
    </html>`);
  doc.close();
}

// 2) Update just the CSS, HTML and JS in‐place:
function renderPreview() {
  const doc = preview.contentDocument || preview.contentWindow.document;
  const id = currentId; // your project ID
  // apply path‐prefixing
  const html = prefixAssets(eHTML.getValue(), id);
  const css = prefixAssets(eCSS.getValue(), id);
  const js = eJS.getValue();

  // inject into the iframe
  doc.getElementById("style-pane").textContent = css;
  doc.getElementById("html-content").innerHTML = html;
  doc.getElementById("js-pane").textContent = js;
}

initPreview();
[eHTML, eCSS, eJS].forEach((ed) => ed.on("change", renderPreview));

// Utility: scan code blobs for used asset filenames
function findUsedAssets() {
  const code = eHTML.getValue() + eCSS.getValue() + eJS.getValue();
  const matches = code.match(/assets\/([^\s"'()]+)/g) || [];
  return new Set(matches.map((m) => m.replace(/^assets\//, "")));
}

// Show / hide modal
const mgrBtn = document.getElementById("manageAssetsBtn");
const modal = document.getElementById("assetManagerModal");
const closeBtn = document.getElementById("assetManagerClose");
const listEl = document.getElementById("assetManagerList");

mgrBtn.addEventListener("click", async () => {
  if (!currentId) return alert("Save a project first!");
  // 1) fetch all assets for this project
  const all = await fetch(`/api/assets/${currentId}`).then((r) => r.json());
  const used = findUsedAssets();

  // 2) build list
  listEl.innerHTML = "";
  all.forEach((file) => {
    const li = document.createElement("li");
    li.textContent = file + (used.has(file) ? " (wird benutzt)" : "");
    if (!used.has(file)) {
      const del = document.createElement("button");
      del.textContent = "Löschen";
      del.onclick = async () => {
        if (!confirm(`${file} wirklich löschen?`)) return;
        await fetch(`/api/assets/${currentId}/${file}`, {
          method: "DELETE",
        });
        li.remove(); // remove from UI
      };
      li.appendChild(del);
    }
    listEl.appendChild(li);
  });

  modal.classList.remove("hidden");
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

// Templates
fetch("/api/templates")
  .then((r) => r.json())
  .then((list) => {
    const sel = $("#templateSelect");
    list.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      sel.append(opt);
    });
    sel.addEventListener("change", () => {
      if (!sel.value) return;
      fetch(`/api/template/${sel.value}`)
        .then((r) => r.json())
        .then((t) => {
          eHTML.setValue(t.html || "");
          eCSS.setValue(t.css || "");
          eJS.setValue(t.js || "");
          currentId = null;
          $("#link").textContent = "";
          renderPreview();
        });
    });
  });

// Save / Auto-save
let currentId = (location.pathname.match(/^\/p\/(\S+)/) || [])[1] || null;
const linkElem = $("#link");
if (currentId) linkElem.textContent = decodeURI(currentId);
async function saveProject() {
  const payload = {
    html: eHTML.getValue(),
    css: eCSS.getValue(),
    js: eJS.getValue(),
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
const debouncedSave = debounce(saveProject, 2000);
$("#saveBtn").addEventListener("click", saveProject);

// Export ZIP
$("#exportBtn").addEventListener("click", async () => {
  const payload = {
    html: eHTML.getValue(),
    css: eCSS.getValue(),
    js: eJS.getValue(),
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
console.log("👀 assetInput element:", assetInput);

assetInput.addEventListener("change", async (e) => {
  await saveProject();
  console.log("👀 change event fired, files:", e.target.files);
  if (!currentId) {
    console.warn("⚠️ No currentId, aborting upload");
    alert("Save once before uploading assets");
    return;
  }

  const fd = new FormData();
  for (const f of e.target.files) fd.append("files", f);
  console.log("👀 FormData entries:", [...fd.entries()]);

  try {
    const res = await fetch(`/upload/${currentId}`, {
      method: "POST",
      body: fd,
    });
    console.log("👀 upload response:", res.status, await res.json());
  } catch (err) {
    console.error("❌ upload failed:", err);
  }

  loadAssets();
});

async function loadAssets() {
  if (!currentId) return;
  const list = await fetch(`/api/assets/${currentId}`).then((r) => r.json());
  const assetList = document.querySelector("#assetList");
  assetList.innerHTML = "";
  list.forEach((f) => {
    const link = document.createElement("a");
    link.href = `/assets/${currentId}/${f}`;
    link.textContent = f;
    link.target = "_blank";
    assetList.append(link);
  });
}

// ZIP import
$("#zipInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("#status").textContent = "Importing…";
  const fd = new FormData();
  fd.append("zip", file);
  const r = await fetch("/importzip", { method: "POST", body: fd });
  if (!r.ok) {
    $("#status").textContent = "Import failed";
    return;
  }
  const { html, css, js } = await r.json();
  eHTML.setValue(html);
  eCSS.setValue(css);
  eJS.setValue(js);
  renderPreview();
  currentId = null;
  $("#link").textContent = "";
  $("#status").textContent = "Imported";
});

// Initial render / load project content
if (currentId) {
  fetch(`/api/project/${currentId}`)
    .then((r) => r.json())
    .then((p) => {
      eHTML.setValue(p.html);
      eCSS.setValue(p.css);
      eJS.setValue(p.js);
      renderPreview();
    });
} else {
  renderPreview();
}
