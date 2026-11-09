# Android release (Google Play)

Play production uploads use a signed Android App Bundle, not an APK.

| Field | Value |
| --- | --- |
| applicationId | `gg.startmanager.app` |
| versionName | `1.0.0` (`package.json` `version` stays in sync) |
| versionCode | `1` (increase by 1 on every new upload) |
| minSdk / targetSdk / compileSdk | 24 / 36 / 36 |

Output of a successful release build:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

The app manifest requests only `android.permission.INTERNET` and sets `android:allowBackup="false"`. The packaged manifest also contains AndroidX’s signature permission `gg.startmanager.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (from `androidx.core`). That permission is defined by the app, granted only to itself, and is not a user-facing device permission. AndroidX uses it to protect its own receivers; it should stay.

## One-time upload key

Enable **Play App Signing** when you create the app. Google holds the app signing key. The keystore below is only the upload key. Back it up offline. It is not in git (`*.jks`, `*.keystore`, and `android/keystore.properties` are ignored).

JDK 21+ and an Android SDK with platform 36 are required. Point Gradle at the SDK with `ANDROID_HOME` or `android/local.properties` (`sdk.dir=...`). `android/local.properties` is gitignored.

```bash
keytool -genkey -v -keystore android/upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
cp android/keystore.properties.example android/keystore.properties
```

Edit `android/keystore.properties`:

```properties
storeFile=upload-keystore.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=upload
keyPassword=YOUR_KEY_PASSWORD
```

`storeFile` is relative to the `android/` directory. Do not commit the keystore or this properties file.

## Build locally

```bash
npm ci
npm run android:release
```

That production-builds the web app (base href `/`, not the GitHub Pages path), runs `cap sync android`, and runs `./gradlew bundleRelease`. Release signing is required. Gradle reads, in order:

1. Environment variables, when they are set: `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. `ANDROID_KEYSTORE_PATH` may be absolute.
2. Otherwise `android/keystore.properties`.

A missing keystore or password fails the release task instead of writing an unsigned bundle.

Bump `versionCode` and `versionName` in `android/app/build.gradle`, and `version` in `package.json`, before every later upload.

## GitHub Actions option

Workflow: `.github/workflows/android-release.yml` (Actions → **Android release AAB** → Run workflow). It does not run on push. Add these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w 0 android/upload-keystore.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | store password |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | key password |

The workflow decodes the keystore into the runner temp directory, passes it through the environment variables above, and uploads `app-release.aab` as a workflow artifact. The keystore and passwords are not uploaded.
