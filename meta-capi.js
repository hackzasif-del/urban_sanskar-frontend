(function () {
    const CONSENT_COOKIE = "meta_marketing_consent";
    const CONSENT_MAX_AGE = 60 * 60 * 24 * 180;
    const MARKETING_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;
    let collectionPromise = null;
    let clientSdkPromise = null;

    function getCookie(name) {
        const prefix = `${name}=`;
        const value = document.cookie
            .split("; ")
            .find(cookie => cookie.startsWith(prefix));

        if (!value) return null;

        try {
            return decodeURIComponent(value.slice(prefix.length));
        } catch {
            return value.slice(prefix.length);
        }
    }

    function hasMarketingConsent() {
        return getCookie(CONSENT_COOKIE) === "accepted";
    }

    function setConsent(choice) {
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `${CONSENT_COOKIE}=${choice}; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
    }

    function captureFacebookClickId() {
        const fbclid = new URLSearchParams(window.location.search).get("fbclid");

        if (!fbclid || !/^[A-Za-z0-9._-]{1,512}$/.test(fbclid)) return;

        const existingFbc = getCookie("_fbc");
        if (existingFbc && existingFbc.split(".")[3] === fbclid) return;

        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        const fbc = `fb.1.${Date.now()}.${fbclid}`;
        document.cookie = `_fbc=${encodeURIComponent(fbc)}; Max-Age=${MARKETING_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
    }

    function clearMarketingCookies() {
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        for (const name of ["_fbp", "_fbc"]) {
            document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
            document.cookie = `${name}=; Max-Age=0; Domain=urbansanskar.co.in; Path=/; SameSite=Lax${secure}`;
        }
    }

    async function collectBrowserParams() {
        if (!hasMarketingConsent()) return null;

        if (!window.clientParamBuilder) {
            clientSdkPromise ||= new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = "https://cdn.jsdelivr.net/npm/meta-capi-param-builder-clientjs@1.3.3/dist/clientParamBuilder.bundle.js";
                script.onload = resolve;
                script.onerror = () => reject(new Error("Meta client SDK failed to load."));
                document.head.append(script);
            });

            try {
                await clientSdkPromise;
            } catch (error) {
                console.warn("Meta client SDK could not be loaded.", error);
            }
        }

        if (!hasMarketingConsent()) return null;

        if (window.clientParamBuilder &&
            typeof window.clientParamBuilder.processAndCollectAllParams === "function") {
            try {
                return await window.clientParamBuilder.processAndCollectAllParams(window.location.href);
            } catch (error) {
                console.warn("Meta Parameter Builder could not collect browser parameters.", error);
            }
        }

        if (hasMarketingConsent()) captureFacebookClickId();
        return null;
    }

    function createButton(label, action, primary) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.style.cssText = [
            "border:1px solid #111",
            "border-radius:3px",
            "padding:10px 14px",
            "font:inherit",
            "font-size:14px",
            "cursor:pointer",
            primary ? "background:#111;color:#fff" : "background:#fff;color:#111"
        ].join(";");
        button.addEventListener("click", action);
        return button;
    }

    function showConsentPanel() {
        document.getElementById("meta-consent-panel")?.remove();

        const panel = document.createElement("section");
        panel.id = "meta-consent-panel";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "Marketing cookie settings");
        panel.style.cssText = [
            "position:fixed",
            "z-index:10000",
            "left:16px",
            "right:16px",
            "bottom:16px",
            "max-width:760px",
            "margin:0 auto",
            "padding:18px",
            "background:#fff",
            "color:#111",
            "border:1px solid #ddd",
            "box-shadow:0 4px 24px rgba(0,0,0,.18)",
            "font:14px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"
        ].join(";");

        const heading = document.createElement("strong");
        heading.textContent = "Marketing measurement cookies";
        const message = document.createElement("p");
        message.textContent = "If you accept, we use Meta browser identifiers and send browsing or purchase events to Meta for advertising measurement. Email and phone from a verified purchase are hashed before sending. You can change this choice later in Privacy settings.";
        message.style.margin = "8px 0 14px";

        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;gap:10px;flex-wrap:wrap";
        const closePanel = () => panel.remove();

        actions.append(
            createButton("Accept marketing", () => {
                setConsent("accepted");
                collectionPromise = collectBrowserParams();
                window.dispatchEvent(new Event("metaMarketingConsentGranted"));
                closePanel();
            }, true),
            createButton("Reject", () => {
                setConsent("rejected");
                clearMarketingCookies();
                collectionPromise = null;
                closePanel();
            }, false)
        );
        panel.append(heading, message, actions);
        document.body.append(panel);
    }

    function addPrivacySettingsButton() {
        if (document.getElementById("meta-privacy-settings")) return;

        const button = createButton("Privacy settings", showConsentPanel, false);
        button.id = "meta-privacy-settings";
        button.style.cssText += ";position:fixed;z-index:9999;right:12px;bottom:12px;padding:7px 10px;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.15)";
        document.body.append(button);
    }

    if (hasMarketingConsent()) {
        collectionPromise = collectBrowserParams();
    }

    document.addEventListener("DOMContentLoaded", () => {
        addPrivacySettingsButton();
        if (!getCookie(CONSENT_COOKIE)) showConsentPanel();
    });

    async function track(eventName, options = {}) {
        if (!hasMarketingConsent()) return false;

        collectionPromise ||= collectBrowserParams();
        await collectionPromise;
        if (!hasMarketingConsent()) return false;

        const payload = {
            event_name: eventName,
            event_id: options.eventId || (window.crypto?.randomUUID
                ? window.crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
            event_source_url: window.location.href,
            user_data: {
                email: options.email,
                phone: options.phone
            },
            custom_data: options.customData || {}
        };

        try {
            const response = await fetch("/api/meta-events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                keepalive: true
            });

            if (!response.ok) {
                console.warn(`Meta event request failed with status ${response.status}.`);
                return false;
            }

            return true;
        } catch (error) {
            console.warn("Meta event request could not be sent.", error);
            return false;
        }
    }

    window.UrbanSanskarMeta = { track, hasMarketingConsent };
})();
