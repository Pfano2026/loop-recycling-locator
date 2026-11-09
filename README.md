# loop. — Recycling drop-off finder

A mobile-first React PWA with a small Express API. The included Seattle-area locations are fictional demo records for trying the app; they are not verified recycling facilities. Replace `server/data/points.json` with trusted local listings before using it as a real-world locator.

## Run locally

Install Node.js 20.19+ and npm, then run:

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal (usually `http://localhost:5173`). The dev command starts the React app and API together. Suggestions are saved as pending records in `server/data/suggestions.json`.

For a production server:

```sh
npm run build
npm start
```

The server serves the built app and API on port `3001` by default. Set `PORT` to change it.

## Android

Build and install a native Android debug APK:

```sh
npm install
npm run android:apk
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to your Android phone and open the file, or install it over USB with `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`. If Android asks, allow installs from that file app. The APK includes the sample locations; new suggestions are stored on that device for review. Location sorting asks for Android location permission. Map tiles require an internet connection.

The app remains available as a PWA too: deploy it behind HTTPS, open it in Android Chrome, then choose **Install app** or **Add to Home screen**.

## API

- `GET /api/points?material=glass&lat=47.61&lng=-122.33` filters by material and sorts by distance when coordinates are provided.
- `POST /api/suggestions` accepts a place name, address, one or more materials, optional details, and optional coordinates. New suggestions are persisted with `pending` status.

Supported materials: `glass`, `paper`, `plastic`, `metal`, `batteries`, `electronics`.
