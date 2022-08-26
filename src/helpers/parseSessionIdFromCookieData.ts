import { SIGNED_COOKIE_REGEXP, UNSIGNED_COOKIE_REGEXP } from "../constants";

export function parseSessionIdFromCookieData(cookieData: string) {
  const cookieMatchesUnsigned = UNSIGNED_COOKIE_REGEXP.exec(cookieData);
  const cookieMatchesSigned = SIGNED_COOKIE_REGEXP.exec(cookieData);

  let sessionId: string | null = null;

  if (cookieMatchesUnsigned != null && Array.isArray(cookieMatchesUnsigned)) {
    const [_, sid] = cookieMatchesUnsigned;
    sessionId = sid;
  } else if (
    cookieMatchesSigned != null &&
    Array.isArray(cookieMatchesSigned)
  ) {
    // TODO: Check signature [2].
    const [_, sid] = cookieMatchesSigned;
    sessionId = sid;
  } else {
    sessionId = cookieData;
  }

  return sessionId;
}
