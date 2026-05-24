# Mobile App-Store Ship — Deployment Checklist

This document covers the **manual** steps that must happen outside the codebase
to ship the iOS and Android apps. The codebase is already wired for everything
below; these steps connect it to Apple's and Google's services.

---

## iOS — App Store

### 1. Xcode capabilities (one-time per project)
Open `ios/App/App.xcworkspace` in Xcode. With the `App` target selected:

1. **Signing & Capabilities → Team**: select your Apple Developer team.
2. **Signing & Capabilities → + Capability**:
   - Add **Push Notifications**.
   - Add **Associated Domains** with entries:
     - `applinks:smallbizagent.ai`
     - `applinks:www.smallbizagent.ai`
3. **Signing & Capabilities → Code Signing Entitlements**:
   - Should resolve to `App/App.entitlements` (already in repo).
   - If not auto-detected: Build Settings → search "Code Signing Entitlements"
     → set to `App/App.entitlements`.
4. Verify `Info.plist` shows the camera/photo/microphone usage strings
   (already in repo).

### 2. APNs setup (one-time per app)
1. Apple Developer → Certificates, Identifiers & Profiles → Keys → **Create a
   new key** with **Apple Push Notifications service (APNs)** enabled.
2. Download the `.p8` key file. Note the Key ID and Team ID.
3. (When we wire server-side push delivery) Add these to Railway env:
   - `APNS_KEY_ID`
   - `APNS_TEAM_ID`
   - `APNS_BUNDLE_ID=ai.smallbizagent.app`
   - `APNS_PRIVATE_KEY` (full contents of the .p8 file)

### 3. Apple App Site Association
The file is at `public/.well-known/apple-app-site-association` and served by
`server/index.ts`. **Before submitting**, replace `TEAMID` with your real
Apple Team ID. Verify the file is served correctly:

```bash
curl -i https://smallbizagent.ai/.well-known/apple-app-site-association
```

Must return `Content-Type: application/json` and the JSON body. Apple will
fetch this when validating Universal Links.

### 4. Build + submit
```bash
npm run cap:build:ios
# Opens ios/App/App.xcworkspace in Xcode
# Product → Archive → Distribute App → App Store Connect
```

App Store Connect listing must include:
- Privacy Policy URL (already at /privacy)
- Terms URL (already at /terms)
- App Description, screenshots (5.5" + 6.5" iPhone, iPad)
- Sensitive permissions descriptions (already in Info.plist)
- Encryption export compliance: marked as `ITSAppUsesNonExemptEncryption=false`
  in Info.plist (uses standard HTTPS only).

---

## Android — Google Play Store

### 1. Firebase project (one-time)
1. Firebase Console → Create or select a project.
2. Add an Android app with package name `ai.smallbizagent.app`.
3. Download `google-services.json`.
4. Place at `android/app/google-services.json`. **Do not commit** — already
   ignored by .gitignore for android secrets.

### 2. FCM server key
For server-side push delivery (when wired):
- Firebase Console → Project Settings → Service Accounts → Generate New
  Private Key. Download the JSON.
- Add to Railway env as `FCM_SERVICE_ACCOUNT_JSON` (full JSON string).

### 3. App signing
1. First-time build: `cd android && ./gradlew bundleRelease` generates an
   unsigned AAB.
2. Generate an upload key:
   ```bash
   keytool -genkey -v -keystore ~/sba-upload-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias sba-upload
   ```
3. Add signing config to `android/app/build.gradle` `release` block (do not
   commit credentials — read from `gradle.properties` or env vars).
4. Upload to Play Console → Internal Testing track first.
5. Play Console will enroll the app in **Play App Signing**. Copy the
   **SHA-256 fingerprint** from Play Console → Setup → App integrity → App
   signing key certificate.
6. Replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` in
   `public/.well-known/assetlinks.json` with that fingerprint, deploy, and
   verify:
   ```bash
   curl -i https://smallbizagent.ai/.well-known/assetlinks.json
   ```

### 4. Build + submit
```bash
npm run cap:build:android
cd android && ./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
# Upload via Play Console
```

---

## Verification before submission

### iOS
- [ ] TestFlight install on real iPhone
- [ ] Push notification: tap "Allow", receive test push from server
- [ ] Tap `https://smallbizagent.ai/jobs/123` link in Mail or Messages → app
      opens at that job (not Safari)
- [ ] Open job, tap "Add Photo", camera launches, photo uploads
- [ ] Logout → push token removed from server
- [ ] App store metadata complete (description, screenshots, privacy URL)

### Android
- [ ] Internal testing install on real Android device
- [ ] On Android 13+: notification permission prompt appears on first login
- [ ] Push notification: receive test push
- [ ] Tap `https://smallbizagent.ai/jobs/123` from SMS → app opens (verify
      `adb shell pm get-app-links ai.smallbizagent.app` shows "verified")
- [ ] Camera + photo library work
- [ ] Logout → push token removed
- [ ] Play Console listing complete (description, screenshots, content rating)

---

## What the codebase already does

- ✅ `POST /api/push/register` — stores APNs/FCM tokens on the business record
- ✅ `POST /api/push/unregister` — removes a token (called on logout)
- ✅ `client/src/lib/capacitor-push.ts` — registers tokens with CSRF
- ✅ `client/src/lib/capacitor-camera.ts` — camera helper (native + web fallback)
- ✅ `client/src/components/jobs/JobPhotoUploader.tsx` — UI for job photos
- ✅ `client/src/lib/capacitor-deeplinks.ts` — allowlisted deep-link router
- ✅ `ios/App/App/Info.plist` — camera/photo/microphone usage descriptions
- ✅ `ios/App/App/App.entitlements` — push + associated domains
- ✅ `android/app/src/main/AndroidManifest.xml` — runtime permissions + App Links intent filters
- ✅ `android/app/build.gradle` — minification + version bump (1.0.1 / versionCode 2)
- ✅ `android/app/proguard-rules.pro` — R8 rules for Capacitor + Firebase
- ✅ `public/.well-known/apple-app-site-association` — Universal Links manifest
- ✅ `public/.well-known/assetlinks.json` — Android App Links manifest
- ✅ `server/index.ts` — serves `.well-known` with correct `Content-Type`

## What still requires you to do something manual

- ⏳ Firebase project + `google-services.json` (drop into `android/app/`)
- ⏳ APNs auth key (`.p8`) for server-side push delivery
- ⏳ Replace `TEAMID` in `public/.well-known/apple-app-site-association` with
      your real Apple Team ID
- ⏳ Replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` in
      `public/.well-known/assetlinks.json` with the Play Console fingerprint
- ⏳ Xcode: enable Push Notifications + Associated Domains capabilities
- ⏳ Generate Android upload keystore
- ⏳ Server-side push delivery (separate task — APNs + FCM HTTP v1 senders)
- ⏳ App Store Connect + Play Console listings (description, screenshots, etc.)
