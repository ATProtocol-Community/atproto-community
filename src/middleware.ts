import { defineMiddleware } from "astro:middleware";

const LOGOUT_PATH = "/oauth/logout";

function isAlreadyDeletedSessionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("The session was deleted by another process")
  );
}

// Keep dev traffic on 127.0.0.1: ATProto OAuth callbacks always come back on
// 127.0.0.1, so a stray localhost session ends up with cookies on a different
// origin than the post-login session — login appears to silently fail.
export const onRequest = defineMiddleware(async (context, next) => {
  if (import.meta.env.DEV && context.url.hostname === "localhost") {
    const url = new URL(context.url);
    url.hostname = "127.0.0.1";
    return context.redirect(url.toString(), 307);
  }

  if (
    context.request.method === "POST" &&
    context.url.pathname === LOGOUT_PATH
  ) {
    const userDid = await context.session?.get("atproto-did");
    if (!context.session || !userDid) return context.redirect("/");

    context.session.delete("atproto-did");

    try {
      await context.locals.loggedInClient?.signOut();
    } catch (error) {
      if (!isAlreadyDeletedSessionError(error)) {
        console.warn(
          "[auth] failed to revoke OAuth session during logout",
          error,
        );
      }
    }

    return context.redirect("/");
  }

  return next();
});
