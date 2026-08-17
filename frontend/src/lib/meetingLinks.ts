/** Detect and open video meeting links (Teams, Google Meet, Zoom). */

const MEETING_MARKERS = [
  "teams.microsoft.com",
  "meet.google.com",
  "zoom.us",
  "zoom.com",
] as const;

function cleanToken(token: string) {
  return token.replace(/[.,);]+$/g, "");
}

export function isMeetingUrl(url?: string | null) {
  if (!url?.trim()) return false;
  const u = url.trim().toLowerCase();
  return MEETING_MARKERS.some((marker) => u.includes(marker));
}

/** Pull the first Teams / Meet / Zoom URL from free text. */
export function detectMeetingUrl(text: string) {
  if (!text) return "";
  for (const token of text.replace(/\n/g, " ").split(/\s+/)) {
    const lower = cleanToken(token).toLowerCase();
    if (MEETING_MARKERS.some((marker) => lower.includes(marker))) {
      const cleaned = cleanToken(token);
      return lower.startsWith("http") ? cleaned : `https://${cleaned}`;
    }
  }
  return "";
}

export function meetingProviderLabel(url?: string | null) {
  if (!url) return "Meeting";
  const u = url.toLowerCase();
  if (u.includes("teams.microsoft.com")) return "Microsoft Teams";
  if (u.includes("meet.google.com")) return "Google Meet";
  if (u.includes("zoom.us") || u.includes("zoom.com")) return "Zoom";
  return "Meeting";
}
