# TestFlight (iOS beta)

Builds run on EAS. The repo side is ready: the `beta` build and submit profiles in
`apps/mobile/eas.json` and the manual workflow `apps/mobile/.eas/workflows/testflight.yml`.
Bundle ID: `no.hubbr.app`.

## One-time setup (account owner)

1. **Apple Developer Program**: enroll at developer.apple.com/programs (USD 99 per year).
   Enrolling as an individual shows your own name as the seller in the App Store; an
   organization (the ENK) needs a D-U-N-S number first.
2. **First build, from your computer** (any OS with Node; no Mac needed), in a checkout after
   `pnpm install`:

   ```sh
   cd apps/mobile
   pnpm dlx eas-cli@latest build --platform ios --profile beta
   ```

   If pnpm asks which packages may run build scripts, press Enter without selecting any.
   Sign in with your Apple ID when asked and let EAS create everything: bundle ID,
   distribution certificate, provisioning profile, and **yes** to the push notification key
   (needed for push outside Expo Go).

3. **App Store Connect record**: appstoreconnect.apple.com > Apps > + > New App. Platform iOS,
   name **Hubbr** (the store name must be unique; "Hubber" is likely taken), language Norwegian
   Bokmål, bundle ID `no.hubbr.app`, any SKU (e.g. `hubbr`).
4. **First upload**:

   ```sh
   pnpm dlx eas-cli@latest submit --platform ios --profile beta --latest
   ```

   Let EAS create an App Store Connect API key, so later uploads need no Apple sign-in.
   Then add the app's **Apple ID** (the number under App Information) as `ascAppId` under
   `submit.beta.ios` in `eas.json`.

5. **Testers**: TestFlight tab > Internal Testing > add up to 100 people who are users on
   your App Store Connect team (Users and Access). Internal builds need no Apple review.
   They install the TestFlight app and accept the invite.

## Every later build

Run the **TestFlight beta** workflow on expo.dev (or `eas workflow:run testflight.yml`). It
builds, uploads, and the build appears in TestFlight after Apple's processing. The build
number increments automatically. Export compliance is answered in `app.json`
(`usesNonExemptEncryption: false`, the app only uses HTTPS).

Beta builds are on the `beta` update channel, so pushes to `main` (channel `main`) don't reach
them; testers get new code with each new build.

## Sign-in for testers

The beta profile points at the **dev** Convex deployment, where the dev sign-in
(`HUBBER_DEV_SIGN_IN=enabled`) offers the four fake personas. That is fine for a few internal
testers, but everyone choosing the same persona shares one account. Real sign-in needs Vipps
(blocked on the ENK, HUB-8).

**External testers** (public link, school classes in HUB-36) go through Beta App Review, which
needs a description, feedback email, and a working sign-in for the reviewer. Before that, the
app needs a sign-in testers can use on their own: real Vipps, or a beta sign-in on a separate
Convex deployment.
