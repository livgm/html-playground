const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const multer = require("multer");
const archiver = require("archiver");
const AdmZip = require("adm-zip");

// German passphrase ID generator: combines adorable adjectives and nouns
const adjectives = [
  "süß",
  "klein",
  "flauschig",
  "bunt",
  "fröhlich",
  "leis",
  "laut",
  "sanft",
  "hell",
  "dunkl",
  "wütend",
  "glücklich",
  "müd",
  "schnell",
  "groß",
  "lustig",
  "rund",
  "viereckig",
  "quadratisch",
  "spitz",
  "lieb",
  "wunderbar",
  "witzig",
];

const colors = [
  "rot",
  "grün",
  "hellblau",
  "dunkelblau",
  "gelb",
  "orang",
  "lilan",
  "schwarz",
  "weiß",
  "braun",
  "grau",
  "pink",
  "türkis",
];

const nouns = [
  [2, "katze"],
  [1, "hase"],
  [1, "bär"],
  [1, "vogel"],
  [1, "fuchs"],
  [1, "schmetterling"],
  [3, "einhorn"],
  [1, "stern"],
  [2, "wolke"],
  [2, "blume"],
  [1, "baum"],
  [1, "roboter"],
  [1, "libelle"],
];
function generateId() {
  const [article, noun] = nouns[Math.floor(Math.random() * nouns.length)];
  if (article === 1) {
    suffix = "er";
  } else if (article === 2) {
    suffix = "e";
  } else {
    suffix = "es";
  }
  const adj1 = adjectives[Math.floor(Math.random() * adjectives.length)];
  const adj2 = adjectives[Math.floor(Math.random() * adjectives.length)];
  const col = colors[Math.floor(Math.random() * colors.length)];
  return `${adj1}${suffix}-${adj2}${suffix}-${col}${suffix}-${noun}`;
}

const PORT = process.env.PORT || 3000;
const app = express();

// Base directories
const BASE_DIR = __dirname;
const uploadDir = path.join(BASE_DIR, "uploads");
const projectsDir = path.join(BASE_DIR, "projects");
const templatesDir = path.join(BASE_DIR, "templates");
const assetsDir = path.join(BASE_DIR, "assets");

// Ensure storage folders exist
[uploadDir, projectsDir, templatesDir, assetsDir].forEach((dir) =>
  fs.mkdirSync(dir, { recursive: true }),
);

// Helpers
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function getAssetDir(projectId) {
  const dir = path.join(assetsDir, projectId);
  ensureDir(dir);
  return dir;
}

// Middleware
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(BASE_DIR, "public")));
// Serve project assets: allow GET /assets/:projectId/filename
app.use("/assets", express.static(path.join(__dirname, "assets")));
// --- Asset Routes ---
const assetStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, getAssetDir(req.params.id)),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const assetUpload = multer({ storage: assetStorage });

// Upload files for a project
app.post("/upload/:id", assetUpload.array("files"), (req, res) => {
  const filenames = req.files.map((f) => f.originalname);
  res.json({ ok: true, files: filenames });
});

// List assets for a project
app.get("/api/assets/:id", (req, res) => {
  const list = fs.existsSync(getAssetDir(req.params.id))
    ? fs.readdirSync(getAssetDir(req.params.id))
    : [];
  res.json(list);
});

// List global uploads
app.get("/api/assets", (_req, res) => {
  const files = fs
    .readdirSync(uploadDir)
    .filter((f) => fs.statSync(path.join(uploadDir, f)).isFile())
    .map((f) => `/assets/${encodeURIComponent(f)}`);
  res.json(files);
});

// DELETE /api/assets/:id/:file — remove a single asset
app.delete("/api/assets/:id/:file", (req, res) => {
  const dir = path.join(__dirname, "assets", req.params.id);
  const file = path.join(dir, req.params.file);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Not found" });
  fs.unlinkSync(file);
  res.json({ ok: true });
});

// --- Project Routes ---
function saveProject(req, res) {
  const id = req.params.id || generateId();
  const { html = "", css = "", js = "" } = req.body;
  const data = { id, html, css, js, updated: Date.now() };
  fs.writeFileSync(path.join(projectsDir, `${id}.json`), JSON.stringify(data));
  res.json({ id, url: `/p/${id}` });
}

app.post("/save", saveProject);
app.put("/save/:id", saveProject);

// Fetch a saved project
app.get("/api/project/:id", (req, res) => {
  const filePath = path.join(projectsDir, `${req.params.id}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Project not found" });
  }
  res.json(JSON.parse(fs.readFileSync(filePath)));
});

// Serve editor page for a project
app.get("/p/:id", (_req, res) => {
  res.sendFile(path.join(BASE_DIR, "public", "index.html"));
});

// --- Template Routes ---
app.get("/api/templates", (_req, res) => {
  const list = fs
    .readdirSync(templatesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const t = JSON.parse(fs.readFileSync(path.join(templatesDir, f)));
      return { id: t.id, name: t.name || t.id };
    });
  res.json(list);
});

app.get("/api/template/:id", (req, res) => {
  const filePath = path.join(templatesDir, `${req.params.id}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Template not found" });
  }
  res.json(JSON.parse(fs.readFileSync(filePath)));
});

// --- ZIP Import ---
const zipUpload = multer({ dest: path.join(os.tmpdir(), "playgroundzip") });
app.post("/importzip", zipUpload.single("zip"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No zip file uploaded" });
  const zip = new AdmZip(req.file.path);
  let html = "",
    css = "",
    js = "";
  const assets = [];

  zip.getEntries().forEach((entry) => {
    if (entry.isDirectory) return;
    const data = entry.getData();
    const name = entry.entryName;
    if (/index\.html?$/i.test(name)) html = data.toString();
    else if (/\.css$/i.test(name)) css = data.toString();
    else if (/\.js$/i.test(name)) js = data.toString();
    else {
      const dest = path.join(uploadDir, path.basename(name));
      fs.writeFileSync(dest, data);
      assets.push(`/assets/${encodeURIComponent(path.basename(name))}`);
    }
  });

  fs.unlinkSync(req.file.path);
  res.json({ html, css, js, assets });
});

// --- ZIP Export ---
app.post("/package/:id", (req, res) => {
  const { html = "", css = "", js = "" } = req.body;
  const allCode = html + css + js;
  console.log("ALL CODE: ", allCode);
  const used = new Set();
  (allCode.match(/assets\/([^"'()\s]+)/g) || []).forEach((match) => {
    // match is e.g. "assets/foo.png"
    used.add(match.replace(/^assets\//, ""));
  });

  res.set({
    "Content-Type": "application/zip",
    "Content-Disposition": 'attachment; filename="project.zip"',
  });

  const archive = archiver("zip");
  archive.pipe(res);
  archive.append(
    `<!doctype html><html><head><link rel=\"stylesheet\" href=\"style.css\"></head><body>${html}</body><script src=\"script.js\"></script></html>`,
    { name: "index.html" },
  );
  archive.append(css, { name: "style.css" });
  archive.append(js, { name: "script.js" });

  // 3) only include those files
  const dir = path.join(__dirname, "assets", req.params.id);
  console.log(dir);
  used.forEach((filename) => {
    const filePath = path.join(dir, filename);
    console.log(filePath);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: `assets/${filename}` });
    }
  });

  archive.finalize();
});

// --- Start Server ---
app.listen(PORT, () =>
  console.log(`Server is running at http://localhost:${PORT}`),
);
