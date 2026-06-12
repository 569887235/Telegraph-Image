const FRIENDLY_FILE_ID_SEPARATOR = "~tg~";

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

function parseTelegramFileId(pathname = "", paramId = "") {
    const rawId = decodePathValue(paramId || pathname.split("/").filter(Boolean).pop() || "");
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

function friendlyDownloadFileName(pathname = "", paramId = "") {
    const rawId = decodePathValue(paramId || pathname.split("/").filter(Boolean).pop() || "");
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
    return safeType + `; filename="${asciiName}"; filename*=UTF-8''` + encodeURIComponent(fileName);
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

export async function onRequest(context) {
    const {
        request,
        env,
        params,
    } = context;

    const url = new URL(request.url);
    const telegramFileId = parseTelegramFileId(url.pathname, params.id);
    const downloadFileName = friendlyDownloadFileName(url.pathname, params.id);
    let fileUrl = 'https://telegra.ph/' + url.pathname + url.search
    if (url.pathname.length > 39) { // Path length > 39 indicates file uploaded via Telegram Bot API
        console.log(telegramFileId)
        const filePath = await getFilePath(env, telegramFileId);
        console.log(filePath)
        fileUrl = `https://api.telegram.org/file/bot${env.TG_Bot_Token}/${filePath}`;
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
    const isAdmin = request.headers.get('Referer')?.includes(`${url.origin}/admin`);
    if (isAdmin) {
        return fileResponse;
    }

    // Check if KV storage is available
    if (!env.img_url) {
        console.log("KV storage not available, returning image directly");
        return fileResponse;  // Directly return image response, terminate execution
    }

    // The following code executes only if KV is available
    let record = await env.img_url.getWithMetadata(params.id);
    if (!record || !record.metadata) {
        // Initialize metadata if it doesn't exist
        console.log("Metadata not found, initializing...");
        record = {
            metadata: {
                ListType: "None",
                Label: "None",
                TimeStamp: Date.now(),
                liked: false,
                fileName: params.id,
                fileSize: 0,
            }
        };
        await env.img_url.put(params.id, "", { metadata: record.metadata });
    }

    const metadata = {
        ListType: record.metadata.ListType || "None",
        Label: record.metadata.Label || "None",
        TimeStamp: record.metadata.TimeStamp || Date.now(),
        liked: record.metadata.liked !== undefined ? record.metadata.liked : false,
        fileName: record.metadata.fileName || params.id,
        fileSize: record.metadata.fileSize || 0,
    };

    // Handle based on ListType and Label
    if (metadata.ListType === "White") {
        return fileResponse;
    } else if (metadata.ListType === "Block" || metadata.Label === "adult") {
        const referer = request.headers.get('Referer');
        const redirectUrl = referer ? "https://static-res.pages.dev/teleimage/img-block-compressed.png" : `${url.origin}/block-img.html`;
        return Response.redirect(redirectUrl, 302);
    }

    // Check if WhiteList_Mode is enabled
    if (env.WhiteList_Mode === "true") {
        return Response.redirect(`${url.origin}/whitelist-on.html`, 302);
    }

    // If no metadata or further actions required, moderate content and add to KV if needed
    if (env.ModerateContentApiKey) {
        try {
            console.log("Starting content moderation...");
            const moderateUrl = `https://api.moderatecontent.com/moderate/?key=${env.ModerateContentApiKey}&url=https://telegra.ph${url.pathname}${url.search}`;
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
                        await env.img_url.put(params.id, "", { metadata });
                        return Response.redirect(`${url.origin}/block-img.html`, 302);
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
    await env.img_url.put(params.id, "", { metadata });

    // Return file content
    return fileResponse;
}

async function getFilePath(env, file_id) {
    try {
        const url = `https://api.telegram.org/bot${env.TG_Bot_Token}/getFile?file_id=${encodeURIComponent(file_id)}`;
        const res = await fetch(url, {
            method: 'GET',
        });

        if (!res.ok) {
            console.error(`HTTP error! status: ${res.status}`);
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