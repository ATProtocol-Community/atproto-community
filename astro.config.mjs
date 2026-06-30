// @ts-check
import { defineConfig, sessionDrivers } from "astro/config";

import node from "@astrojs/node";
import astroSmoothActions from "@fujocoded/astro-smooth-actions";
import authproto, { REDIRECT_TO_REFERER_TEMPLATE } from "@fujocoded/authproto";

const isDev = process.env.NODE_ENV !== "production";

// https://astro.build/config
export default defineConfig({
  site: "https://atmosphere.community",
  base: "/",
  output: "server",
  server: {
    host: true,
  },
  adapter: node({
    mode: "standalone",
  }),
  session: {
    // Persist sessions in dev so local server restarts do not force another login.
    driver: isDev
      ? sessionDrivers.fs({ base: ".astro-session-dev" })
      : { entrypoint: "unstorage/drivers/memory" },
  },
  security: {
    allowedDomains: [{ hostname: "atmosphere.community", protocol: "https" }],
  },
  integrations: [
    authproto({
      applicationName: "Atmosphere.community",
      applicationDomain: "https://atmosphere.community",
      redirects: {
        afterLogin: REDIRECT_TO_REFERER_TEMPLATE,
        afterLogout: REDIRECT_TO_REFERER_TEMPLATE,
      },
      scopes: {
        additionalScopes: [
          "repo:community.lexicon.calendar.rsvp?action=create&action=update",
          "repo:community.opensocial.membership?action=create&action=update",
        ],
      },
      driver: isDev
        ? {
            name: "fs",
            options: { base: ".authproto-dev" },
          }
        : { name: "memory" },
    }),
    astroSmoothActions(),
  ],
});
