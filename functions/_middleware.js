const REDIRECT_URL_ENV_NAME = "REDIRECT_URL";
const EXCLUDED_PATH_PREFIXES = ["/upload", "/file/", "/api/", "/_nuxt/"];

function configuredRedirectUrl(env) {
    const value = String(env?.[REDIRECT_URL_ENV_NAME] || "").trim();
    return value || null;
}

function isExcludedPath(pathname) {
    return EXCLUDED_PATH_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix));
}

function acceptsHtml(request) {
    const accept = request.headers.get("Accept") || "";
    return accept.includes("text/html");
}

function redirectTarget(request, value) {
    try {
        return new URL(value, request.url);
    } catch {
        return null;
    }
}

export async function onRequest(context) {
    const { request, env } = context;
    const redirectUrl = configuredRedirectUrl(env);

    if (!redirectUrl || !["GET", "HEAD"].includes(request.method) || !acceptsHtml(request)) {
        return context.next();
    }

    const requestUrl = new URL(request.url);
    if (isExcludedPath(requestUrl.pathname)) {
        return context.next();
    }

    const target = redirectTarget(request, redirectUrl);
    if (!target || target.href === requestUrl.href) {
        return context.next();
    }

    return Response.redirect(target.href, 302);
}
