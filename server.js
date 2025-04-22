// Playground backend v3

const express = require("express");
const path = require("path");
const multer = require("multer");
const archiver = require("archiver");
const AdmZip = require("adm-zip");
const fs = require("fs");
const os = require("os");
const { nanoid } = require("nanoid");

const PORT = process.env.PORT || 3000;
const app = express();

/* ── Static UI ────────────────────────────────────────────────────────────── */
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "5mb" }));

/* ── Persistent storage dirs ──────────────────────────────────────────────── */
const uploadDir = path.join(__dirname, "uploads");
const projectsDir = path.join(__dirname, "projects");
const templatesDir = path.join(__dirname, "templates");
[uploadDir, projectsDir, templatesDir].forEach((d) =>
  fs.mkdirSync(d, { recursive: true }),
);

/* ---------- helper that maps a project‑id to its asset dir ---------- */
function assetDir(id) {
  const dir = path.join(__dirname, "assets", id);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/* ── File uploads (assets) ─────────────────────────────────────────────────── */
/* ---------- 1a.  upload route  ---------- */
/* client POSTs to  /upload/:id  with FormData files[] */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, assetDir(req.params.id)),
  filename: (req, file, cb) => cb(null, file.originalname), // keep original names
});
const upload = multer({ storage });

app.post("/upload/:id", upload.array("files"), (req, res) => {
  res.json({ ok: true, files: req.files.map((f) => f.originalname) });
});

/* ---------- 1b.  list assets for one project  ---------- */
app.get("/api/assets/:id", (req, res) => {
  fs.readdir(assetDir(req.params.id), (err, files) => res.json(files || []));
});

/* ── Create / update project ──────────────────────────────────────────────── */
app.post("/save", saveHandler); // create
app.put("/save/:id", saveHandler); // update existing
function saveHandler(req, res) {
  const id = req.params.id || nanoid(8);
  const { html = "", css = "", js = "" } = req.body;
  fs.writeFileSync(
    path.join(projectsDir, `${id}.json`),
    JSON.stringify({ id, html, css, js, updated: Date.now() }),
  );
  res.json({ id, url: `/p/${id}` });
}

/* ── Load project ─────────────────────────────────────────────────────────── */
app.get("/api/project/:id", (req, res) => {
  const file = path.join(projectsDir, `${req.params.id}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Not found" });
  res.json(JSON.parse(fs.readFileSync(file)));
});
app.get("/p/:id", (_, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html")),
);

/* ── Asset list ─────────────────────────────────────────────────────────── */
app.get("/api/assets", (_req, res) => {
  const files = fs
    .readdirSync(uploadDir)
    .filter((f) => !fs.statSync(path.join(uploadDir, f)).isDirectory());
  res.json(files.map((f) => `/assets/${encodeURIComponent(f)}`));
});

/* ── Templates (read‑only) ────────────────────────────────────────────────── */
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
  const file = path.join(templatesDir, `${req.params.id}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Not found" });
  res.json(JSON.parse(fs.readFileSync(file)));
});

/* ── ZIP import (code + assets) ───────────────────────────────────────────── */
const zipUpload = multer({ dest: path.join(os.tmpdir(), "playgroundzip") });
app.post("/importzip", zipUpload.single("zip"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No zip" });
  const zip = new AdmZip(req.file.path);
  let html = "",
    css = "",
    js = "";
  const assets = [];
  zip.getEntries().forEach((e) => {
    if (e.isDirectory) return;
    const name = e.entryName;
    const data = e.getData();
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

/* ── Export ZIP ───────────────────────────────────────────────────────────── */
app.post("/package/:id", (req, res) => {
  const { html = "", css = "", js = "" } = req.body;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="project.zip"');
  const archive = archiver("zip");
  archive.pipe(res);
  archive.append(
    `<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body>${html}</body></html>`,
    { name: "index.html" },
  );
  archive.append(`${css}`, { name: "style.css" });
  archive.append(`${js}`, { name: "script.js" });

  if (fs.existsSync(`assets/${req.params.id}`))
    archive.directory(`assets/${req.params.id}`, `assets/${req.params.id}`);
  archive.finalize();
});

/* ── Start ───────────────────────────────────────────────────────────────── */
app.listen(PORT, () => console.log(`Playground → http://localhost:${PORT}`));
