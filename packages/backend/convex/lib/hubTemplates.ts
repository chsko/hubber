import type { Doc } from "../_generated/dataModel";

type Template = Doc<"hubs">["template"];
type NotifyLevel = Doc<"hubMembers">["notifyLevel"];

/**
 * Defaults each hub template sets (docs/DESIGN.md §3). School groups need
 * approval to join and notify only about important things; family and
 * friends are open and chattier. The welcome text lives in the app's i18n
 * catalogs (`hubTemplates.<template>.welcome`).
 */
export const HUB_TEMPLATES: Record<
  Template,
  { emoji: string; joinApproval: boolean; notifyLevel: NotifyLevel }
> = {
  class: { emoji: "🎒", joinApproval: true, notifyLevel: "important" },
  kindergarten: { emoji: "🧸", joinApproval: true, notifyLevel: "important" },
  family: { emoji: "🏡", joinApproval: false, notifyLevel: "all" },
  friends: { emoji: "🎉", joinApproval: false, notifyLevel: "all" },
  other: { emoji: "💬", joinApproval: false, notifyLevel: "important" },
};
