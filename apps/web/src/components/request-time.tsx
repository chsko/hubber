import { connection } from "next/server";
import { Suspense } from "react";

async function Marker() {
  await connection();
  return null;
}

/**
 * Marks a route as rendered at request time (Cache Components). Used by the
 * /e and /i stubs until they load real data per request (HUB-16, HUB-31).
 */
export function RequestTime() {
  return (
    <Suspense fallback={null}>
      <Marker />
    </Suspense>
  );
}
