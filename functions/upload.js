import { errorHandling, getCorsHeaders, jsonResponse, telemetryData } from "./utils/middleware";

const FILE_ACCESS_KEY_PREFIX = "telegraph-img:file-access:key:";
const FILE_ACCESS_IV_PREFIX = "telegraph-img:file-access:iv:";

function defaultStorageAccountKey(env) {
    return String(env.DEFAULT_STORAGE_ACCOUNT_KEY || "main").trim() || "main";
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
    if (!account || typeof account !== "object" || !account.botToken || !account.chatId) return null;

    return {
        accountKey,
        botToken: String(account.botToken),
        chatId: String(account.chatId)
    };
}

function uploadAccountKey({ env, request, formData }) {
    const url = new URL(request.url);
    const input = formData.get("accountKey") || formData.get("account") || url.searchParams.get("accountKey") || url.searchParams.get("account");
    return String(input || defaultStorageAccountKey(env)).trim() || defaultStorageAccountKey(env);
}

function bytesToBase64Url(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Bytes(value) {
    const data = typeof value === "string" ? new TextEncoder().encode(value) : value;
    return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

async function fileAccessKey(secret) {
    const keyBytes = await sha256Bytes(FILE_ACCESS_KEY_PREFIX + secret);
    return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
}

async function fileAccessIv(secret, value) {
    const digest = await sha256Bytes(FILE_ACCESS_IV_PREFIX + secret + "\0" + value);
    return digest.slice(0, 12);
}

async function encryptFileAccessId(value, secret) {
    if (!secret || !value) return value;
    const iv = await fileAccessIv(secret, value);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        await fileAccessKey(secret),
        new TextEncoder().encode(value)
    ));
    const token = new Uint8Array(iv.length + encrypted.length);
    token.set(iv);
    token.set(encrypted, iv.length);
    return bytesToBase64Url(token);
}

async function publicFileId(env, accountKey, fileId) {
    const secret = String(env.FILE_ACCESS_SECRET || "").trim();
    if (!secret) return fileId;
    return encryptFileAccessId(accountKey + ":" + fileId, secret);
}

function fileAccessPath(accountKey, fileId, fileExtension) {
    return "/file/" + encodeURIComponent(accountKey) + "/" + encodeURIComponent(fileId + "." + fileExtension);
}

export async function onRequestOptions(context) {
    return new Response(null, {
        status: 204,
        headers: getCorsHeaders(context.request, context.env)
    });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const clonedRequest = request.clone();
        const formData = await clonedRequest.formData();

        await errorHandling(context);
        telemetryData(context);

        const uploadFile = formData.get('file');
        if (!uploadFile) {
            throw new Error('No file uploaded');
        }

        const accountKey = uploadAccountKey({ env, request, formData });
        const telegramAccount = resolveTelegramAccount(env, accountKey);
        if (!telegramAccount) {
            const availableKeys = availableTelegramAccountKeys(env).join(", ") || "none";
            throw new Error("Unknown Telegram storage account: " + accountKey + " (available: " + availableKeys + ")");
        }

        const fileName = uploadFile.name;
        const fileExtension = fileName.split('.').pop().toLowerCase();

        const telegramFormData = new FormData();
        telegramFormData.append("chat_id", telegramAccount.chatId);

        // 根据文件类型选择合适的上传方式
        let apiEndpoint;
        if (uploadFile.type.startsWith('image/')) {
            telegramFormData.append("photo", uploadFile);
            apiEndpoint = 'sendPhoto';
        } else if (uploadFile.type.startsWith('audio/')) {
            telegramFormData.append("audio", uploadFile);
            apiEndpoint = 'sendAudio';
        } else if (uploadFile.type.startsWith('video/')) {
            telegramFormData.append("video", uploadFile);
            apiEndpoint = 'sendVideo';
        } else {
            telegramFormData.append("document", uploadFile);
            apiEndpoint = 'sendDocument';
        }

        const result = await sendToTelegram(telegramFormData, apiEndpoint, telegramAccount.botToken);

        if (!result.success) {
            throw new Error(result.error);
        }

        const fileId = getFileId(result.data);

        if (!fileId) {
            throw new Error('Failed to get file ID');
        }

        const accessFileId = await publicFileId(env, accountKey, fileId);
        return jsonResponse(context, [{ 'src': fileAccessPath(accountKey, accessFileId, fileExtension) }], { status: 200 });
    } catch (error) {
        console.error('Upload error:', error);
        return jsonResponse(context, { error: error.message }, { status: 500 });
    }
}

function getFileId(response) {
    if (!response.ok || !response.result) return null;

    const result = response.result;
    if (result.photo) {
        return result.photo.reduce((prev, current) =>
            (prev.file_size > current.file_size) ? prev : current
        ).file_id;
    }
    if (result.document) return result.document.file_id;
    if (result.video) return result.video.file_id;
    if (result.audio) return result.audio.file_id;

    return null;
}

async function sendToTelegram(formData, apiEndpoint, botToken, retryCount = 0) {
    const MAX_RETRIES = 2;
    const apiUrl = `https://api.telegram.org/bot${botToken}/${apiEndpoint}`;

    try {
        const response = await fetch(apiUrl, { method: "POST", body: formData });
        const responseData = await response.json();

        if (response.ok) {
            return { success: true, data: responseData };
        }

        // 图片上传失败时转为文档方式重试
        if (retryCount < MAX_RETRIES && apiEndpoint === 'sendPhoto') {
            console.log('Retrying image as document...');
            const newFormData = new FormData();
            newFormData.append('chat_id', formData.get('chat_id'));
            newFormData.append('document', formData.get('photo'));
            return await sendToTelegram(newFormData, 'sendDocument', botToken, retryCount + 1);
        }

        return {
            success: false,
            error: responseData.description || 'Upload to Telegram failed'
        };
    } catch (error) {
        console.error('Network error:', error);
        if (retryCount < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return await sendToTelegram(formData, apiEndpoint, botToken, retryCount + 1);
        }
        return { success: false, error: 'Network error occurred' };
    }
}