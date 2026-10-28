const { ParamBuilder } = require("capi-param-builder-nodejs");

const DATASET_ID = process.env.META_DATASET_ID || "772800845173915";
const GRAPH_API_VERSION = "v26.0";
const MAX_BODY_BYTES = 16 * 1024;
const ALLOWED_EVENTS = new Set(["Purchase", "ViewContent", "AddToCart"]);
const DEFAULT_ORIGINS = ["https://urbansanskar.co.in", "https://www.urbansanskar.co.in"];

function getAllowedOrigins() {
    const configuredOrigins = process.env.META_ALLOWED_ORIGINS;
    const origins = configuredOrigins
        ? configuredOrigins.split(",").map(origin => origin.trim()).filter(Boolean)
        : DEFAULT_ORIGINS;

    return new Set(origins.map(origin => new URL(origin).origin));
}

function sendJson(res, status, payload) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(payload));
}

function readBody(req) {
    if (typeof req.body === "string") {
        if (Buffer.byteLength(req.body) > MAX_BODY_BYTES) {
            return { error: "Request body is too large." };
        }

        try {
            return { body: JSON.parse(req.body) };
        } catch {
            return { error: "Request body must be valid JSON." };
        }
    }

    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return { error: "Request body must be a JSON object." };
    }

    if (Buffer.byteLength(JSON.stringify(req.body)) > MAX_BODY_BYTES) {
        return { error: "Request body is too large." };
    }

    return { body: req.body };
}

function hasMarketingConsent(req) {
    const cookieHeader = req.headers.cookie || "";
    return cookieHeader.split(";").some(cookie => cookie.trim() === "meta_marketing_consent=accepted");
}

function normalizePhone(phone) {
    const cleaned = String(phone).trim().replace(/[^\d+]/g, "");
    const digits = cleaned.replace(/\D/g, "");

    if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
    if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
    if (cleaned.startsWith("+") && digits.length >= 8 && digits.length <= 15) {
        return `+${digits}`;
    }

    return null;
}

function validString(value, maxLength) {
    return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function buildCustomData(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return { error: "custom_data must be an object." };
    }

    const customData = {};

    if (input.value !== undefined) {
        if (typeof input.value !== "number" || !Number.isFinite(input.value) || input.value < 0) {
            return { error: "custom_data.value must be a non-negative number." };
        }
        customData.value = input.value;
    }

    if (input.currency !== undefined) {
        if (input.currency !== "INR") {
            return { error: "custom_data.currency must be INR." };
        }
        customData.currency = input.currency;
    }

    if (input.content_ids !== undefined) {
        if (!Array.isArray(input.content_ids) || input.content_ids.length > 50 ||
            input.content_ids.some(id => !validString(id, 100))) {
            return { error: "custom_data.content_ids must be an array of product IDs." };
        }
        customData.content_ids = input.content_ids;
    }

    for (const key of ["content_type", "content_name"]) {
        if (input[key] !== undefined) {
            const maxLength = key === "content_name" ? 200 : 20;
            if (!validString(input[key], maxLength)) {
                return { error: `custom_data.${key} is invalid.` };
            }
            customData[key] = input[key];
        }
    }

    if (input.num_items !== undefined) {
        if (!Number.isInteger(input.num_items) || input.num_items < 1 || input.num_items > 1000) {
            return { error: "custom_data.num_items must be a positive integer." };
        }
        customData.num_items = input.num_items;
    }

    return { customData };
}

function cookieHeader(cookie) {
    const parts = [
        `${cookie.name}=${encodeURIComponent(cookie.value)}`,
        `Max-Age=${cookie.maxAge}`,
        "Path=/",
        "SameSite=Lax",
        "Secure"
    ];

    if (cookie.domain) parts.push(`Domain=${cookie.domain}`);
    return parts.join("; ");
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return sendJson(res, 405, { error: "Method not allowed." });
    }

    if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
        return sendJson(res, 415, { error: "Content-Type must be application/json." });
    }

    const allowedOrigins = getAllowedOrigins();
    const origin = req.headers.origin;
    if (!origin || !allowedOrigins.has(origin)) {
        return sendJson(res, 403, { error: "Origin is not allowed." });
    }

    if (!hasMarketingConsent(req)) {
        return sendJson(res, 403, { error: "Marketing consent is required." });
    }

    if (Number(req.headers["content-length"]) > MAX_BODY_BYTES) {
        return sendJson(res, 413, { error: "Request body is too large." });
    }

    const parsed = readBody(req);
    if (parsed.error) return sendJson(res, parsed.error === "Request body is too large." ? 413 : 400, { error: parsed.error });
    const body = parsed.body;

    if (!ALLOWED_EVENTS.has(body.event_name)) {
        return sendJson(res, 400, { error: "Unsupported event_name." });
    }

    if (!validString(body.event_id, 100) || !/^[A-Za-z0-9._:-]+$/.test(body.event_id)) {
        return sendJson(res, 400, { error: "A valid event_id is required." });
    }

    if (!validString(body.event_source_url, 2048)) {
        return sendJson(res, 400, { error: "A valid event_source_url is required." });
    }

    let eventSourceUrl;
    try {
        eventSourceUrl = new URL(body.event_source_url);
    } catch {
        return sendJson(res, 400, { error: "event_source_url must be a valid URL." });
    }

    if (!allowedOrigins.has(eventSourceUrl.origin) || !["http:", "https:"].includes(eventSourceUrl.protocol)) {
        return sendJson(res, 400, { error: "event_source_url origin is not allowed." });
    }
    if (eventSourceUrl.username || eventSourceUrl.password) {
        return sendJson(res, 400, { error: "event_source_url cannot contain credentials." });
    }
    eventSourceUrl.search = "";
    eventSourceUrl.hash = "";

    const customDataResult = buildCustomData(body.custom_data || {});
    if (customDataResult.error) return sendJson(res, 400, { error: customDataResult.error });
    if (body.event_name === "Purchase" &&
        (customDataResult.customData.value === undefined || customDataResult.customData.currency !== "INR")) {
        return sendJson(res, 400, { error: "Purchase requires value and INR currency." });
    }

    if (body.user_data !== undefined &&
        (!body.user_data || typeof body.user_data !== "object" || Array.isArray(body.user_data))) {
        return sendJson(res, 400, { error: "user_data must be an object." });
    }
    const userDataInput = body.user_data || {};
    if (userDataInput.email !== undefined &&
        (typeof userDataInput.email !== "string" || userDataInput.email.length > 254)) {
        return sendJson(res, 400, { error: "user_data.email is invalid." });
    }
    if (userDataInput.phone !== undefined &&
        (typeof userDataInput.phone !== "string" || userDataInput.phone.length > 40)) {
        return sendJson(res, 400, { error: "user_data.phone is invalid." });
    }

    const accessToken = process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
        console.error("META_ACCESS_TOKEN is not configured.");
        return sendJson(res, 500, { error: "Meta CAPI is not configured." });
    }

    const builder = new ParamBuilder(["urbansanskar.co.in"]);
    const cookiesToSet = builder.processRequestFromContext(req);
    if (cookiesToSet.length) {
        res.setHeader("Set-Cookie", cookiesToSet.map(cookieHeader));
    }

    const userData = {};
    const fbp = builder.getFbp();
    const fbc = builder.getFbc();
    const clientIpAddress = builder.getClientIpAddress();
    const userAgent = req.headers["user-agent"];

    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;
    if (clientIpAddress) userData.client_ip_address = clientIpAddress;
    if (typeof userAgent === "string" && userAgent.length <= 512) {
        userData.client_user_agent = userAgent;
    }

    const email = typeof userDataInput.email === "string" ? userDataInput.email.trim().toLowerCase() : "";
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        userData.em = [builder.getNormalizedAndHashedPII(email, "email")];
    }

    const phone = typeof userDataInput.phone === "string" ? normalizePhone(userDataInput.phone) : null;
    if (phone) {
        userData.ph = [builder.getNormalizedAndHashedPII(phone, "phone")];
    }

    const event = {
        event_name: body.event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id: body.event_id,
        event_source_url: eventSourceUrl.toString(),
        action_source: "website",
        user_data: userData,
        custom_data: customDataResult.customData
    };
    const referrerUrl = builder.getReferrerUrl();
    if (referrerUrl) event.referrer_url = referrerUrl;

    let metaResponse;
    try {
        metaResponse = await fetch(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/${DATASET_ID}/events?access_token=${encodeURIComponent(accessToken)}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ data: [event] }),
                signal: AbortSignal.timeout(8000)
            }
        );
    } catch (error) {
        console.error("Meta CAPI network request failed.");
        return sendJson(res, 502, { error: "Meta CAPI request failed." });
    }

    if (!metaResponse.ok) {
        console.error(`Meta CAPI returned HTTP ${metaResponse.status}.`);
        return sendJson(res, 502, { error: "Meta CAPI rejected the event." });
    }

    let result;
    try {
        result = await metaResponse.json();
    } catch (error) {
        console.error("Meta CAPI returned an invalid response.");
        return sendJson(res, 502, { error: "Meta CAPI returned an invalid response." });
    }

    return sendJson(res, 200, {
        success: true,
        events_received: result.events_received,
        fbtrace_id: result.fbtrace_id
    });
};
