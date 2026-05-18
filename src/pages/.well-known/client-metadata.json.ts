import type { APIRoute } from "astro";

import { getPublicJwk } from "../../lib/opensocial/keys";

export const prerender = false;

const CLIENT_ID =
  "https://atmosphere.community/.well-known/client-metadata.json";
const CLIENT_NAME = "atmosphere.community";

export const GET: APIRoute = () => {
  const jwk = getPublicJwk();
  const body = {
    client_id: CLIENT_ID,
    client_name: CLIENT_NAME,
    jwks: { keys: [jwk] },
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
};
