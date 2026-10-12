// HTTP routes live on the deployment's .convex.site host.
export const siteUrl =
  (process.env.EXPO_PUBLIC_CONVEX_SITE_URL as string | undefined) ??
  (process.env.EXPO_PUBLIC_CONVEX_URL as string | undefined)?.replace(/\.cloud$/, ".site") ??
  "";
