const FRIENDLY_FILE_ID_SEPARATOR = "~tg~";
const FILE_ACCESS_KEY_PREFIX = "telegraph-img:file-access:key:";
const FILE_ACCESS_IV_PREFIX = "telegraph-img:file-access:iv:";

function decodePathValue(value = "") {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function stripExtension(value = "") {
    const dotIndex = value.lastIndexOf(".");
    return dotIndex > 0 ? value.slice(0, dotIndex) : value;
}

function fileExtension(value = "") {
    const dotIndex = value.lastIndexOf(".");
    return dotIndex > 0 ? value.slice(dotIndex + 1).toLowerCase() : "";
}

function encodePathValue(value = "") {
    return encodeURIComponent(value).replace(/%2F/gi, "%252F");
}

function paramPathSegments(params = {}, pathname = "") {
    const rawPath = params.path ?? params.id ?? pathname.replace(/^\/file\/?/, "");
    const values = Array.isArray(rawPath) ? rawPath : String(rawPath || "").split("/");
    return values.filter(Boolean).map(decodePathValue);
}

function defaultStorageAccountKey(env) {
    return String(env.DEFAULT_STORAGE_ACCOUNT_KEY || "main").trim() || "main";
}

function parseRequestPath({ env, params, pathname }) {
    const segments = paramPathSegments(params, pathname);
    if (segments.length <= 1) {
        return {
            accountKey: defaultStorageAccountKey(env),
            rawId: segments[0] || "",
            hasExplicitAccountKey: false
        };
    }

    return {
        accountKey: segments[0],
        rawId: segments.slice(1).join("/"),
        hasExplicitAccountKey: true
    };
}

function accountPath(accountKey, paramId, hasExplicitAccountKey) {
    const encodedId = encodePathValue(paramId);
    if (!hasExplicitAccountKey) return "/file/" + encodedId;
    return "/file/" + encodePathValue(accountKey) + "/" + encodedId;
}

function base64UrlToBytes(value = "") {
    const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function sha256Bytes(value) {
    const data = typeof value === "string" ? new TextEncoder().encode(value) : value;
    return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

async function fileAccessKey(secret) {
    const keyBytes = await sha256Bytes(FILE_ACCESS_KEY_PREFIX + secret);
    return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
}

async function expectedFileAccessIv(secret, value) {
    const digest = await sha256Bytes(FILE_ACCESS_IV_PREFIX + secret + "\0" + value);
    return digest.slice(0, 12);
}

function equalBytes(left, right) {
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let index = 0; index < left.length; index += 1) {
        diff |= left[index] ^ right[index];
    }
    return diff === 0;
}

async function decryptFileAccessId(value, secret) {
    try {
        const token = base64UrlToBytes(value);
        if (token.length <= 28) return null;
        const iv = token.slice(0, 12);
        const encrypted = token.slice(12);
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await fileAccessKey(secret), encrypted);
        const text = new TextDecoder().decode(decrypted);
        const expectedIv = await expectedFileAccessIv(secret, text);
        return equalBytes(iv, expectedIv) ? text : null;
    } catch {
        return null;
    }
}

function splitAccountScopedFileId(value = "") {
    const separatorIndex = value.indexOf(":");
    if (separatorIndex <= 0) {
        return { accountKey: null, fileId: value };
    }

    return {
        accountKey: value.slice(0, separatorIndex),
        fileId: value.slice(separatorIndex + 1)
    };
}

async function resolveRequestFileId({ env, params, pathname }) {
    const parsedPath = parseRequestPath({ env, params, pathname });
    const rawId = parsedPath.rawId;
    const extension = fileExtension(rawId);
    const secret = (env.FILE_ACCESS_SECRET || "").trim();

    if (!secret || extension === "ts") {
        const publicPathname = accountPath(parsedPath.accountKey, rawId, parsedPath.hasExplicitAccountKey);
        return {
            accountKey: parsedPath.accountKey,
            paramId: rawId,
            pathname: publicPathname,
            protected: Boolean(secret),
            extension,
            hasExplicitAccountKey: parsedPath.hasExplicitAccountKey,
            kvKey: parsedPath.hasExplicitAccountKey ? parsedPath.accountKey + "/" + rawId : rawId
        };
    }

    const decrypted = await decryptFileAccessId(stripExtension(rawId), secret);
    if (!decrypted) return null;

    const scopedFile = splitAccountScopedFileId(decrypted);
    if (scopedFile.accountKey && scopedFile.accountKey !== parsedPath.accountKey) {
        return null;
    }

    const decryptedId = scopedFile.fileId;
    const suffix = extension ? "." + extension : "";
    const paramId = decryptedId + suffix;
    const publicPathname = accountPath(parsedPath.accountKey, paramId, parsedPath.hasExplicitAccountKey);
    return {
        accountKey: parsedPath.accountKey,
        paramId,
        pathname: publicPathname,
        protected: true,
        extension,
        hasExplicitAccountKey: parsedPath.hasExplicitAccountKey,
        kvKey: parsedPath.hasExplicitAccountKey ? parsedPath.accountKey + "/" + paramId : paramId
    };
}

function parseTelegramFileId(paramId = "") {
    const rawId = decodePathValue(paramId);
    const idWithoutExtension = stripExtension(rawId);
    const separatorIndex = idWithoutExtension.lastIndexOf(FRIENDLY_FILE_ID_SEPARATOR);
    return separatorIndex >= 0
        ? idWithoutExtension.slice(separatorIndex + FRIENDLY_FILE_ID_SEPARATOR.length)
        : idWithoutExtension;
}

function sanitizeFileName(value = "") {
    const fileName = String(value)
        .replace(/[\\/\u0000-\u001f\u007f"]/g, "_")
        .replace(/^\.+$/g, "")
        .slice(0, 180);
    return fileName || null;
}

function friendlyDownloadFileName(paramId = "") {
    const rawId = decodePathValue(paramId);
    const idWithoutExtension = stripExtension(rawId);
    const separatorIndex = idWithoutExtension.lastIndexOf(FRIENDLY_FILE_ID_SEPARATOR);
    if (separatorIndex <= 0) return null;

    const slug = idWithoutExtension.slice(0, separatorIndex);
    const extension = rawId.slice(idWithoutExtension.length);
    return sanitizeFileName(slug + extension);
}

function contentDispositionHeader(response, fileName) {
    if (!fileName) return null;
    const current = response.headers.get("Content-Disposition") || "";
    const dispositionType = current.split(";")[0].trim().toLowerCase() || "inline";
    const safeType = /^[a-z]+$/.test(dispositionType) ? dispositionType : "inline";
    const asciiName = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/\\/g, "\\\\").replace(/"/g, "_");
    return safeType + "; filename=\"" + asciiName + "\"; filename*=UTF-8''" + encodeURIComponent(fileName);
}

function withFriendlyDownloadName(response, fileName) {
    const disposition = contentDispositionHeader(response, fileName);
    if (!disposition) return response;

    const headers = new Headers(response.headers);
    headers.set("Content-Disposition", disposition);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function shouldRewriteHlsManifest(access) {
    return access?.protected && access.extension === "m3u8";
}

function rewriteHlsManifest(text = "") {
    return String(text).split(/\r?\n/).map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return line;
        if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return line;
        if (/[?#]/.test(trimmed)) return line;
        if (/\.[A-Za-z0-9]{1,8}$/.test(trimmed)) return line;
        return line + ".ts";
    }).join("\n");
}

async function withProtectedHlsManifest(response, access) {
    if (!shouldRewriteHlsManifest(access)) return response;
    const text = await response.text();
    const headers = new Headers(response.headers);
    headers.set("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=300");
    headers.delete("Content-Length");
    return new Response(rewriteHlsManifest(text), {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function parseTelegramAccounts(env) {
    const raw = String(env.TG_ACCOUNTS_JSON || "").trim();
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        console.error("Invalid TG_ACCOUNTS_JSON:", error.message);
        return {};
    }
}

function availableTelegramAccountKeys(env) {
    return Object.keys(parseTelegramAccounts(env));
}

function resolveTelegramAccount(env, accountKey) {
    const accounts = parseTelegramAccounts(env);
    const account = accounts[accountKey];
    if (!account || typeof account !== "object" || !account.botToken) return null;

    return {
        accountKey,
        botToken: String(account.botToken),
        chatId: account.chatId ? String(account.chatId) : ""
    };
}

function isTelegramFileAccess(access) {
    return access.paramId.length > 39 || access.hasExplicitAccountKey;
}

export async function onRequest(context) {
    const {
        request,
        env,
        params,
    } = context;

    const url = new URL(request.url);
    const access = await resolveRequestFileId({ env, params, pathname: url.pathname });
    if (!access) return new Response("Invalid file access token", { status: 403 });

    const telegramFileId = parseTelegramFileId(access.paramId);
    const downloadFileName = friendlyDownloadFileName(access.paramId);
    let fileUrl = "https://telegra.ph" + access.pathname + url.search;
    if (isTelegramFileAccess(access)) {
        const telegramAccount = resolveTelegramAccount(env, access.accountKey);
        if (!telegramAccount) {
            const availableKeys = availableTelegramAccountKeys(env).join(", ") || "none";
            console.error("Unknown Telegram storage account:", access.accountKey, "available:", availableKeys);
            return new Response("Unknown Telegram storage account: " + access.accountKey + " (available: " + availableKeys + ")", { status: 404 });
        }

        const filePath = await getFilePath(telegramAccount.botToken, telegramFileId);
        if (!filePath) return new Response("Telegram file path not found", { status: 502 });

        fileUrl = "https://api.telegram.org/file/bot" + telegramAccount.botToken + "/" + filePath;
    }

    const response = await fetch(fileUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
    });

    // If the response is OK, proceed with further checks
    if (!response.ok) return response;

    // Log response details
    console.log(response.ok, response.status);
    const fileResponse = withFriendlyDownloadName(response, downloadFileName);

    // Allow the admin page to directly view the image
    const isAdmin = request.headers.get('Referer')?.includes(url.origin + "/admin");
    if (isAdmin) {
        return withProtectedHlsManifest(fileResponse, access);
    }

    // Check if KV storage is available
    if (!env.img_url) {
        console.log("KV storage not available, returning image directly");
        return withProtectedHlsManifest(fileResponse, access);  // Directly return image response, terminate execution
    }

    // The following code executes only if KV is available
    let record = await env.img_url.getWithMetadata(access.kvKey);
    if (!record || !record.metadata) {
        // Initialize metadata if it doesn't exist
        console.log("Metadata not found, initializing...");
        record = {
            metadata: {
                ListType: "None",
                Label: "None",
                TimeStamp: Date.now(),
                liked: false,
                fileName: access.paramId,
                fileSize: 0,
            }
        };
        await env.img_url.put(access.kvKey, "", { metadata: record.metadata });
    }

    const metadata = {
        ListType: record.metadata.ListType || "None",
        Label: record.metadata.Label || "None",
        TimeStamp: record.metadata.TimeStamp || Date.now(),
        liked: record.metadata.liked !== undefined ? record.metadata.liked : false,
        fileName: record.metadata.fileName || access.paramId,
        fileSize: record.metadata.fileSize || 0,
    };

    // Handle based on ListType and Label
    if (metadata.ListType === "White") {
        return withProtectedHlsManifest(fileResponse, access);
    } else if (metadata.ListType === "Block" || metadata.Label === "adult") {
        const referer = request.headers.get('Referer');
        const redirectUrl = referer ? "https://static-res.pages.dev/teleimage/img-block-compressed.png" : url.origin + "/block-img.html";
        return Response.redirect(redirectUrl, 302);
    }

    // Check if WhiteList_Mode is enabled
    if (env.WhiteList_Mode === "true") {
        return Response.redirect(url.origin + "/whitelist-on.html", 302);
    }

    // If no metadata or further actions required, moderate content and add to KV if needed
    if (env.ModerateContentApiKey) {
        try {
            console.log("Starting content moderation...");
            const moderateUrl = "https://api.moderatecontent.com/moderate/?key=" + env.ModerateContentApiKey + "&url=https://telegra.ph" + access.pathname + url.search;
            const moderateResponse = await fetch(moderateUrl);

            if (!moderateResponse.ok) {
                console.error("Content moderation API request failed: " + moderateResponse.status);
            } else {
                const moderateData = await moderateResponse.json();
                console.log("Content moderation results:", moderateData);

                if (moderateData && moderateData.rating_label) {
                    metadata.Label = moderateData.rating_label;

                    if (moderateData.rating_label === "adult") {
                        console.log("Content marked as adult, saving metadata and redirecting");
                        await env.img_url.put(access.kvKey, "", { metadata });
                        return Response.redirect(url.origin + "/block-img.html", 302);
                    }
                }
            }
        } catch (error) {
            console.error("Error during content moderation: " + error.message);
            // Moderation failure should not affect user experience, continue processing
        }
    }

    // Only save metadata if content is not adult content
    // Adult content cases are already handled above and will not reach this point
    console.log("Saving metadata");
    await env.img_url.put(access.kvKey, "", { metadata });

    // Return file content
    return withProtectedHlsManifest(fileResponse, access);
}

async function getFilePath(botToken, file_id) {
    try {
        const url = "https://api.telegram.org/bot" + botToken + "/getFile?file_id=" + encodeURIComponent(file_id);
        const res = await fetch(url, {
            method: 'GET',
        });

        if (!res.ok) {
            console.error("HTTP error! status: " + res.status);
            return null;
        }

        const responseData = await res.json();
        const { ok, result } = responseData;

        if (ok && result) {
            return result.file_path;
        } else {
            console.error('Error in response data:', responseData);
            return null;
        }
    } catch (error) {
        console.error('Error fetching file path:', error.message);
        return null;
    }
}
