import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, alternates: { languages: { nb: siteUrl, en: `${siteUrl}/en` } } },
    { url: `${siteUrl}/en`, alternates: { languages: { nb: siteUrl, en: `${siteUrl}/en` } } },
  ];
}
