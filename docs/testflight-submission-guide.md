# TestFlight Submission Guide — Tauri v2 Mac App

This guide covers uploading a Tauri v2 Mac app to TestFlight via App Store Connect. The process differs from a standard Xcode project because Tauri builds the `.app` bundle outside of Xcode.

---

## Prerequisites

- Active **Apple Developer Program** membership ($99/year) — not just an Apple ID
- **Xcode** installed (needed for `altool` / `notarytool` and archive utilities)
- App already created in App Store Connect (you need a Bundle ID and App record)
- `pnpm` / `cargo` working locally

---

## Phase 1 — App Store Connect Setup

### 1. Create an App ID

1. Go to [developer.apple.com → Certificates, IDs & Profiles → Identifiers](https://developer.apple.com/account/resources/identifiers/list)
2. Click **+** → **App IDs** → **App**
3. Set **Bundle ID** to match your `tauri.conf.json` → `bundle.identifier` (e.g. `com.yourname.localassistant`)
4. Skip the Capabilities section — no checkboxes needed. App Sandbox is enforced via the entitlements file during signing (Phase 3), not here.
5. Register the ID

### 2. Create the App Record in App Store Connect

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **My Apps** → **+** → **New App**
2. Platform: **macOS**
3. Name: `Generative Assistant` (or your preferred name)
4. Bundle ID: select the one you just created
5. SKU: any unique string (e.g. `generative-assistant-001`)
6. Click **Create**

---

## Phase 2 — Certificates and Provisioning

You need two certificates for Mac App Store distribution:

| Certificate | Purpose |
|---|---|
| **Mac App Distribution** | Signs the `.app` bundle |
| **Mac Installer Distribution** | Signs the `.pkg` installer |

### 3. Generate Certificates

1. Open **Keychain Access** → **Certificate Assistant** → **Request a Certificate From a Certificate Authority**
2. Save a `.certSigningRequest` (CSR) file to disk
3. In developer.apple.com → **Certificates** → **+**:
   - Create **Mac App Distribution** using the CSR → download and double-click to install
   - Repeat for **Mac Installer Distribution**
4. Verify both appear in Keychain Access under **My Certificates**

> **Troubleshooting — "Error: -25294" on import**
> This means the Apple WWDR intermediate certificate is missing from your Keychain. Go to [apple.com/certificateauthority](https://www.apple.com/certificateauthority/), download **Worldwide Developer Relations - G3**, then install it before retrying.
> - First check if it's already installed: search `Apple Worldwide Developer Relations` in Keychain Access. If it appears, skip the download.
> - If the double-click install also fails with -25294, use Terminal instead — this installs it into the System keychain where it belongs:
>   ```bash
>   security add-certificates -k /Library/Keychains/System.keychain ~/Downloads/AppleWWDRCAG3.cer
>   ```
> Once the intermediate cert is present, retry importing your developer cert.

### 4. Create a Provisioning Profile

1. developer.apple.com → **Profiles** → **+**
2. Under **Distribution**, select **Mac App Store Connect** (not "App Store Connect" — that's for iOS)
3. Select your App ID
4. Select the **Mac App Distribution** certificate
5. Name it (e.g. `GenerativeAssistant_AppStore`) → **Generate** → **Download**
6. Copy the `.provisionprofile` to the Provisioning Profiles folder — do NOT double-click it (Distribution profiles cannot be installed via System Settings, only Development ones can):
   ```bash
   mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
   cp ~/Downloads/GenerativeAssistant_AppStore.provisionprofile \
      ~/Library/MobileDevice/Provisioning\ Profiles/
   ```

---

## Phase 3 — Configure Tauri for App Store Build

### 5. Configure signing in tauri.conf.json

Update [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json). Note that `identifier` is a top-level field in Tauri v2, not inside `bundle`:

```json
{
  "identifier": "com.yourname.localassistant",
  "bundle": {
    "macOS": {
      "signingIdentity": "3rd Party Mac Developer Application: Your Name (TEAMID)",
      "entitlements": "./entitlements.plist",
      "minimumSystemVersion": "12.0"
    }
  }
}
```

> **`provisioningProfile` is not a valid Tauri v2 field** — it will cause a build error. The profile is embedded manually in the packaging step instead.
>
> **`minimumSystemVersion` must be `"12.0"` or higher** for arm64-only builds. Transporter will reject `"11.0"` with an x86_64 architecture error.

### 6. Create an Entitlements File

Create [src-tauri/entitlements.plist](src-tauri/entitlements.plist):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- Required for Mac App Store -->
  <key>com.apple.security.app-sandbox</key>
  <true/>

  <!-- Must match provisioning profile — TEAMID.bundle.identifier -->
  <key>com.apple.application-identifier</key>
  <string>TEAMID.com.yourname.localassistant</string>
  <key>com.apple.developer.team-identifier</key>
  <string>TEAMID</string>

  <!-- Required if your app makes network connections to Ollama -->
  <key>com.apple.security.network.client</key>
  <true/>

  <!-- Required for reading/writing skill files -->
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
</dict>
</plist>
```

> **The `com.apple.application-identifier` and `com.apple.developer.team-identifier` keys are required.** Without them, Transporter will reject the upload with error 90886 — the provisioning profile has these identifiers but the signed bundle must also declare them explicitly.

> **Note on Ollama:** Connecting to `localhost:11434` via App Sandbox requires `network.client`. However, spawning subprocesses (your `start_ollama_server` Rust command) may be blocked by sandbox restrictions. Test this thoroughly — you may need a UI prompt for network access or reconsider the Ollama auto-start flow for the App Store version.

---

## Phase 4 — Build and Package

### 7. Build the App Store Bundle

```bash
# Production build (arm64 only — runs on Apple Silicon Macs)
pnpm tauri build
```

This produces:
- `src-tauri/target/release/bundle/macos/Generative Assistant.app`

> **Supporting Intel Macs too (Universal Binary)**
> To support both Apple Silicon and Intel, build a universal binary instead:
> ```bash
> rustup target add x86_64-apple-darwin   # one-time setup
> pnpm tauri build --target universal-apple-darwin
> ```
> The output path changes to `src-tauri/target/universal-apple-darwin/release/bundle/macos/`. Update the `APP` variable in the packaging steps below accordingly.

### 8. Package as a .pkg Installer

The App Store requires a signed `.pkg`, not a `.dmg`. Run all steps together:

```bash
APP="src-tauri/target/release/bundle/macos/Generative Assistant.app"
PROFILE="src-tauri/GenerativeAssistant_AppStore.provisionprofile"

# Strip quarantine and extended attributes (Transporter rejects files downloaded from the internet)
xattr -cr "$APP"
xattr -cr "$PROFILE"

# Add required App Store category key (Transporter will reject without this)
/usr/libexec/PlistBuddy -c \
  "Add :LSApplicationCategoryType string public.app-category.productivity" \
  "$APP/Contents/Info.plist"

# Embed provisioning profile
cp "$PROFILE" "$APP/Contents/embedded.provisionprofile"

# Re-sign now that the bundle has changed
codesign --deep --force --verbose \
  --sign "3rd Party Mac Developer Application: Your Name (TEAMID)" \
  --entitlements src-tauri/entitlements.plist \
  "$APP"

# Package as .pkg
productbuild \
  --component "$APP" \
  /Applications \
  --sign "3rd Party Mac Developer Installer: Your Name (TEAMID)" \
  "GenerativeAssistant.pkg"
```

> **Note:** `LSApplicationCategoryType` is required by App Store Connect. Valid values include `public.app-category.productivity`, `public.app-category.utilities`, `public.app-category.developer-tools` — pick whichever best fits.

### 9. Verify the Signature

```bash
codesign --verify --deep --strict --verbose=2 \
  "src-tauri/target/release/bundle/macos/Generative Assistant.app"

pkgutil --check-signature GenerativeAssistant.pkg
```

> If you built a universal binary, replace `release` with `universal-apple-darwin/release` in the path above.

Both should report valid signatures.

---

## Phase 5 — Upload to App Store Connect

### 10. Upload via Transporter (Recommended)

1. Download **Transporter** from the Mac App Store (free, by Apple)
2. Sign in with your Apple ID
3. Drag `GenerativeAssistant.pkg` into Transporter
4. Click **Deliver**
5. Wait for processing — you'll receive an email from Apple (5–30 minutes)

### Alternatively: Upload via Command Line

```bash
xcrun altool --upload-app \
  --type macos \
  --file GenerativeAssistant.pkg \
  --apiKey YOUR_API_KEY \
  --apiIssuer YOUR_ISSUER_ID
```

Generate API keys at App Store Connect → **Users and Access** → **Keys**.

---

## Phase 6 — TestFlight Setup

### 11. Wait for Build Processing

After uploading, the build appears in App Store Connect → your app → **TestFlight** tab. Processing typically takes 5–30 minutes. Apple may run automated checks — you'll get an email if action is required.

### 12. Fill in Export Compliance

For each new build, Apple asks about encryption:
- If your app only uses standard HTTPS (TLS from the OS/URLSession), select **No** for custom encryption
- This is a legal requirement, not optional

### 13. Add Internal Testers

1. App Store Connect → your app → **TestFlight** → **Internal Testing**
2. Click **+** next to the build
3. Add testers by Apple ID email (must be team members in your App Store Connect account)
4. Internal builds are available immediately after processing (no Apple review needed)

### 14. Add External Testers (Optional)

1. **TestFlight** → **External Testing** → **+** → **New Group**
2. Add testers by email or create a public link
3. External builds require a **Beta App Review** by Apple (usually 1–2 business days)
4. You can add up to 10,000 external testers

### 15. Testers Install via TestFlight

Testers on Mac:
1. Install **TestFlight** from the Mac App Store
2. Accept the email invitation or open the public link
3. Install and launch from within TestFlight

---

## Iterating on Builds

For each new build:
1. Bump the version in [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) → `version` **and** `build.number` (build number must always increase)
2. Run steps 7–10 again
3. The new build appears automatically in TestFlight groups you've configured

---

## Common Issues

| Problem | Fix |
|---|---|
| `codesign` says "no identity found" | Check Keychain Access — the Mac App Distribution cert must be in **My Certificates**, not just **Certificates** |
| Cert import fails with Error -25294 | The Apple WWDR intermediate cert is missing. Search `Apple Worldwide Developer Relations` in Keychain Access first — if already there, skip. Otherwise install via Terminal: `security add-certificates -k /Library/Keychains/System.keychain ~/Downloads/AppleWWDRCAG3.cer` |
| Provisioning profile double-click shows "cannot install" | Expected — Distribution profiles can't be installed via System Settings. Copy manually: `cp ~/Downloads/name.provisionprofile ~/Library/MobileDevice/Provisioning\ Profiles/` |
| Build error: `provisioningProfile was unexpected` | `provisioningProfile` is not a valid Tauri v2 field. Remove it from `tauri.conf.json` — embed the profile manually in the packaging step instead |
| Upload rejected: "Invalid Signature" | Ensure you used `3rd Party Mac Developer Application`, not `Developer ID Application` — these are different cert types |
| Transporter: "No appropriate application record found" | Bundle ID in `tauri.conf.json` → `identifier` doesn't match what's registered in App Store Connect. They must be identical. |
| Transporter: "Missing `LSApplicationCategoryType`" (409) | Add the key to `Info.plist` after build: `/usr/libexec/PlistBuddy -c "Add :LSApplicationCategoryType string public.app-category.productivity" "$APP/Contents/Info.plist"` |
| Transporter: "build must include x86_64" (409) | arm64-only builds require `minimumSystemVersion` of `"12.0"` or higher in `bundle.macOS` |
| Transporter: "Missing 512pt @2x icon" (409) | The `.icns` file must include a `512x512@2x` (1024×1024) image. Regenerate with `iconutil` from a 1024×1024 source — see Phase 4. |
| Transporter: error 90886 — missing application identifier | Add `com.apple.application-identifier` (`TEAMID.bundle.id`) and `com.apple.developer.team-identifier` to `entitlements.plist` |
| Transporter: error 91109 — `com.apple.quarantine` attribute | Files downloaded from the browser carry a quarantine flag. Run `xattr -cr "$APP"` and `xattr -cr "$PROFILE"` before signing |
| App crashes in sandbox | Check Console.app for sandbox denials (`deny file-read`, etc.) |
| Ollama connection refused | App Sandbox blocks localhost unless `network.client` entitlement is set |
| Build number conflict | Build number must be strictly greater than any previous upload — even rejected builds consume a number |

---

## App Sandbox Limitations and the Developer ID Route

### MCP stdio servers don't work under App Sandbox

MCP servers configured in `config.json` use `Command::spawn()` to launch external processes (e.g. `npx`, `node`). App Sandbox blocks spawning arbitrary executables outside the app bundle, so MCP servers silently fail to start in TestFlight / App Store builds.

Options if you need MCP support:

1. **HTTP/SSE-based MCP only** — support MCP servers that expose an HTTP endpoint instead of stdio. No subprocess spawning required, fully sandbox-compatible.
2. **Developer ID distribution** — sign and distribute outside the App Store (see below). No sandbox required, full MCP support.
3. **Disable MCP in sandboxed builds** — detect sandbox at runtime and hide MCP config from the UI.

### Developer ID distribution (direct install, no App Store)

Developer ID lets users drag your `.app` directly to their Applications folder without going through the App Store or TestFlight. There is no App Sandbox requirement, so subprocess-based MCP works normally.

The trade-offs vs App Store / TestFlight:

| | App Store / TestFlight | Developer ID |
|---|---|---|
| Certificate | 3rd Party Mac Developer Application | Developer ID Application |
| Sandbox | Required | Optional |
| Notarization | Apple handles it | You run `xcrun notarytool` |
| MCP subprocess spawning | Blocked | Works |
| Copying .app directly to /Applications | Won't launch (wrong cert) | Works |
| Distribution | TestFlight / App Store listing | Direct download / your own website |

To set up Developer ID distribution:
1. Create a **Developer ID Application** certificate in developer.apple.com (separate from Mac App Distribution)
2. Sign with `--sign "Developer ID Application: Your Name (TEAMID)"` — no provisioning profile needed
3. Notarize: `xcrun notarytool submit app.zip --apple-id ... --team-id ... --password ...`
4. Staple: `xcrun stapler staple "Generative Assistant.app"`
5. Distribute the `.app` directly (zip, dmg, or your own installer)

---

## Useful Links

- [App Store Connect](https://appstoreconnect.apple.com)
- [Apple Developer Portal](https://developer.apple.com/account)
- [Tauri v2 Distribution Docs](https://v2.tauri.app/distribute/)
- [TestFlight for macOS — Apple Docs](https://developer.apple.com/testflight/)
