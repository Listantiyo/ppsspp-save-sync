# PPSSPP Save Sync

Static web app (HTML/CSS/JavaScript) for uploading and downloading PPSSPP save files through Google Drive. No application backend is used.

## 1. Create a GitHub repository

Create a repository named `ppsspp-save-sync`, upload all files from this folder to its root, then enable **Settings → Pages → Deploy from a branch → main → /(root)**.

Your site URL will usually be:

`https://YOUR-USERNAME.github.io/ppsspp-save-sync/`

## 2. Configure Google Drive API and OAuth

1. Open https://console.cloud.google.com/ and create/select a Google Cloud project.
2. Open **APIs & Services → Library**, enable **Google Drive API**.
3. Configure **Google Auth Platform** / OAuth consent screen. Add your Google account as a test user if the app is in Testing mode.
4. Create an OAuth client ID of type **Web application**.
5. Add the exact GitHub Pages origin to **Authorized JavaScript origins**, e.g. `https://YOUR-USERNAME.github.io`. For a GitHub Pages project site, the origin does not include `/ppsspp-save-sync/`.
6. Copy the OAuth client ID (not a client secret).
7. In `app.js`, replace `PASTE_YOUR_GOOGLE_OAUTH_CLIENT_ID_HERE` with that client ID.
8. Commit and push the change to GitHub.

Do not put an OAuth client secret in browser JavaScript. A public OAuth client ID is expected here. The app requests the `drive.file` scope, not broad access to the entire Drive.

## 3. Test

1. Open the deployed HTTPS URL.
2. Click **Hubungkan Google** and complete the consent prompt.
3. Enter a game name and select one or more save files.
4. Upload, then confirm the files appear in the `PPSSPP-Saves` folder in Drive.
5. Open the site on Android, connect the same Google account, and download a file.

## Important MVP limitations

- This first version is manual upload/download, not automatic sync.
- Google access tokens are held in memory only and are not saved to local storage.
- `drive.file` limits access to files created by or explicitly opened/selected for this app. The app-created `PPSSPP-Saves` folder and its uploaded files are accessible to this app.
- The current upload method is intended for typical save files, not very large files. Resumable uploads can be added later.
- Before restoring a save, back up the existing local file. The browser downloads the file; it does not directly overwrite PPSSPP's protected Android folder.
- Keep the app in OAuth Testing mode while testing with your own Google account. If you later distribute it publicly, review Google's OAuth verification requirements.
