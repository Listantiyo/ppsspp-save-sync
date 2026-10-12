/*
 * PPSSPP Save Sync
 * Configure GOOGLE_CLIENT_ID in this file after creating a Google OAuth Web client.
 * This app uses the Google Drive API directly; no backend server is required.
 */
const GOOGLE_CLIENT_ID = "319809532032-udfumiepdnneimugl7e06p7e8ir4pldf.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const APP_FOLDER_NAME = "PPSSPP-Saves";

const state = { token: null, tokenClient: null, folderId: null, files: [] };
const $ = (id) => document.getElementById(id);

const connectBtn = $("connect-btn");
const uploadBtn = $("upload-btn");
const refreshBtn = $("refresh-btn");
const saveList = $("save-list");

function toast(message, isError = false) {
  const el = $("toast");
  el.textContent = message;
  el.classList.toggle("error", isError);
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 3500);
}

function setConnected(connected) {
  $("connection-pill").textContent = connected ? "Terhubung" : "Belum terhubung";
  $("connection-pill").classList.toggle("connected", connected);
  $("account-status").textContent = connected
    ? "Google Drive siap digunakan pada sesi browser ini."
    : "Hubungkan akun Google untuk mulai.";
  connectBtn.textContent = connected ? "Hubungkan ulang" : "Hubungkan Google";
  uploadBtn.disabled = !connected;
  refreshBtn.disabled = !connected;
}

function ensureConfigured() {
  if (GOOGLE_CLIENT_ID.includes("PASTE_YOUR")) {
    toast("Konfigurasikan GOOGLE_CLIENT_ID di app.js terlebih dahulu.", true);
    return false;
  }
  return true;
}

function waitForGoogleIdentity() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - started > 12000) return reject(new Error("Google Identity Services gagal dimuat. Periksa koneksi internet."));
      window.setTimeout(check, 150);
    };
    check();
  });
}

async function connectGoogle() {
  if (!ensureConfigured()) return;
  try {
    await waitForGoogleIdentity();
    state.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: async (response) => {
        if (response.error) {
          toast("Login Google gagal: " + response.error, true);
          return;
        }
        state.token = response.access_token;
        setConnected(true);
        try {
          state.folderId = await getOrCreateAppFolder();
          await refreshFiles();
          toast("Google Drive berhasil dihubungkan.");
        } catch (error) {
          toast(error.message, true);
        }
      },
      error_callback: (error) => toast(error?.message || "Login Google dibatalkan atau gagal.", true)
    });
    state.tokenClient.requestAccessToken({ prompt: "consent" });
  } catch (error) {
    toast(error.message, true);
  }
}

async function driveRequest(path, options = {}) {
  if (!state.token) throw new Error("Hubungkan Google terlebih dahulu.");
  const response = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${state.token}`, ...(options.headers || {}) }
  });
  if (!response.ok) {
    let detail = "";
    try { detail = (await response.json()).error?.message || ""; } catch (_) {}
    if (response.status === 401) {
      state.token = null;
      setConnected(false);
      throw new Error("Sesi Google kedaluwarsa. Hubungkan Google kembali.");
    }
    throw new Error(`Google Drive API (${response.status}) ${detail}`.trim());
  }
  if (response.status === 204) return null;
  const type = response.headers.get("content-type") || "";
  return type.includes("application/json") ? response.json() : response.blob();
}

async function getOrCreateAppFolder() {
  const query = encodeURIComponent(`name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const result = await driveRequest(`/files?q=${query}&fields=files(id,name)&pageSize=100`);
  if (result.files?.length) return result.files[0].id;

  const folder = await driveRequest("/files?fields=id,name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: APP_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder"
    })
  });
  return folder.id;
}

async function refreshFiles() {
  if (!state.folderId) state.folderId = await getOrCreateAppFolder();
  const query = encodeURIComponent(`'${state.folderId}' in parents and trashed=false`);
  const result = await driveRequest(`/files?q=${query}&pageSize=100&orderBy=createdTime desc&fields=files(id,name,size,mimeType,createdTime,modifiedTime)`);
  state.files = result.files || [];
  renderFiles();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function formatSize(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderFiles() {
  if (!state.files.length) {
    saveList.innerHTML = '<div class="empty-state"><div class="empty-icon">☁</div><p>Belum ada save. Upload file pertama dari perangkat ini.</p></div>';
    return;
  }
  saveList.innerHTML = state.files.map((file) => {
    const created = file.createdTime ? new Date(file.createdTime).toLocaleString() : "Tanggal tidak tersedia";
    return `<article class="save-item">
      <div class="file-icon" aria-hidden="true">▤</div>
      <div class="save-meta">
        <div class="save-name">${escapeHtml(file.name)}</div>
        <div class="save-detail">${formatSize(file.size)} · ${escapeHtml(created)}</div>
      </div>
      <button class="button button-secondary download-btn" data-download="${escapeHtml(file.id)}" data-name="${escapeHtml(file.name)}">Download</button>
    </article>`;
  }).join("");
  saveList.querySelectorAll("[data-download]").forEach((button) => {
    button.addEventListener("click", () => downloadFile(button.dataset.download, button.dataset.name));
  });
}

async function uploadFiles() {
  if (!state.token) return toast("Hubungkan Google terlebih dahulu.", true);
  const inputFiles = Array.from($("save-files").files || []);
  if (!inputFiles.length) return toast("Pilih minimal satu file save.", true);
  const gameName = $("game-name").value.trim();
  if (!gameName) return toast("Isi nama game terlebih dahulu.", true);

  uploadBtn.disabled = true;
  const originalText = uploadBtn.textContent;
  uploadBtn.textContent = "Mengunggah...";
  try {
    if (!state.folderId) state.folderId = await getOrCreateAppFolder();
    for (const file of inputFiles) {
      const metadata = {
        name: `${gameName}__${file.name}`,
        mimeType: file.type || "application/octet-stream",
        parents: [state.folderId],
        description: `PPSSPP Save Sync; game=${gameName}; original=${file.name}`
      };
      const boundary = "-------ppssppSyncBoundary" + crypto.randomUUID().replaceAll("-", "");
      const prefix = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`;
      const suffix = `\r\n--${boundary}--`;
      const body = new Blob([prefix, file, suffix], { type: `multipart/related; boundary=${boundary}` });
      const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime", {
        method: "POST",
        headers: { Authorization: `Bearer ${state.token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body
      });
      if (!response.ok) {
        let message = "";
        try { message = (await response.json()).error?.message || ""; } catch (_) {}
        throw new Error(`Upload ${file.name} gagal (${response.status}) ${message}`.trim());
      }
    }
    $("save-files").value = "";
    await refreshFiles();
    toast(`${inputFiles.length} file berhasil di-upload.`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    uploadBtn.disabled = !state.token;
    uploadBtn.textContent = originalText;
  }
}

async function downloadFile(fileId, filename) {
  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    if (!response.ok) {
      let message = "";
      try { message = (await response.json()).error?.message || ""; } catch (_) {}
      throw new Error(`Download gagal (${response.status}) ${message}`.trim());
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename || "ppsspp-save";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast("Download dimulai. Periksa folder Download perangkatmu.");
  } catch (error) {
    toast(error.message, true);
  }
}

connectBtn.addEventListener("click", connectGoogle);
uploadBtn.addEventListener("click", uploadFiles);
refreshBtn.addEventListener("click", async () => {
  try { await refreshFiles(); toast("Daftar save diperbarui."); }
  catch (error) { toast(error.message, true); }
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
