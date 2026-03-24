import { apiRequest } from "@/lib/queryClient";

export async function trackClick(productId: string | number, queryText?: string): Promise<string | null> {
  try {
    const sessionId = getSessionId();
    const res = await apiRequest("POST", "/api/clicks/track", {
      productId,
      queryText: queryText || undefined,
      sessionId,
    });
    const data = await res.json();
    return data.referralUrl || null;
  } catch {
    return null;
  }
}

function getSessionId(): string {
  let sid = sessionStorage.getItem("drevo_session_id");
  if (!sid) {
    sid = `s-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    sessionStorage.setItem("drevo_session_id", sid);
  }
  return sid;
}
