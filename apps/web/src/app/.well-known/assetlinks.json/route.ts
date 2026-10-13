import { androidCertFingerprints, appId } from "@/lib/app-links";

// Android checks this at install time to verify the app's https intent filters.
export function GET() {
  const fingerprints = androidCertFingerprints();
  return Response.json(
    fingerprints.length === 0
      ? []
      : [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: appId,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ],
  );
}
