document.addEventListener("DOMContentLoaded", async function () {
    const subtotalEl = document.getElementById("review-subtotal");
    const savingsRow = document.getElementById("review-savings-row");
    const savingsEl = document.getElementById("review-savings");
    const shippingEl = document.getElementById("review-shipping");
    const totalEl = document.getElementById("review-total");
    const payBtn = document.getElementById("razorpay-trigger-btn");
    const shippingForm = document.getElementById("shipping-form");

    const FREE_SHIPPING_THRESHOLD = 4999;
    const FLAT_SHIPPING_CHARGE = 99;

    const API_BASE_URL = "https://urban-sanskar-backend.onrender.com";

    let finalCalculatedAmount = 0;
    let liveProducts = [];

    // Central Live Fetch Control
    async function fetchLiveProducts() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/products`);
            const data = await res.json();
            if (data.success && data.products) {
                return data.products;
            }
        } catch (err) {
            console.error("Live DB Sync Failed:", err);
        }
        return [];
    }

    // ==========================================
    // 1. LOAD PRICING DATA ON PAGE LOAD
    // ==========================================
    async function loadOrderSummary() {
        let cart = JSON.parse(localStorage.getItem("urbanCart")) || [];

        if (cart.length === 0) {
            alert("Your cart is empty. Redirecting to collections.");
            window.location.href = "collections.html";
            return;
        }

        // Fetch fresh database arrays straight away
        liveProducts = await fetchLiveProducts();

        let subtotal = 0;
        let totalSavings = 0;

        cart.forEach(item => {
            // 🛡️ CRITICAL KEY FIX: Fallback checks both 'productId' and 'id' to map DB records
            const targetId = item.productId || item.id;
            const liveProduct = liveProducts.find(p => p._id === targetId);
            const actualPrice = liveProduct ? liveProduct.price : item.price;

            subtotal += (actualPrice * item.quantity);

            if (liveProduct && liveProduct.mrpPrice && liveProduct.mrpPrice > actualPrice) {
                totalSavings += (liveProduct.mrpPrice - actualPrice) * item.quantity;
            }
        });

        let shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_CHARGE;
        finalCalculatedAmount = subtotal + shipping;

        // Render variables securely to elements
        if (subtotalEl) subtotalEl.textContent = `₹${subtotal.toLocaleString('en-IN')}`;

        // 🛠️ CRITICAL TYPO FIXED: Removed duplicate style object property reference
        if (totalSavings > 0 && savingsRow && savingsEl) {
            savingsEl.textContent = `-₹${totalSavings.toLocaleString('en-IN')}`;
            savingsRow.style.display = "flex";
        } else if (savingsRow) {
            savingsRow.style.display = "none";
        }

        if (shippingEl) {
            shippingEl.textContent = shipping === 0 ? "FREE" : `₹${shipping.toLocaleString('en-IN')}`;
            shippingEl.style.color = shipping === 0 ? "green" : "#111";
        }
        if (totalEl) totalEl.textContent = `₹${finalCalculatedAmount.toLocaleString('en-IN')}`;
    }

    await loadOrderSummary();

    // ==========================================
    // 2. SECURE FORM VALIDATION SHIELD
    // ==========================================
    if (payBtn) {
        payBtn.addEventListener("click", function () {
            if (!shippingForm.checkValidity()) {
                shippingForm.reportValidity();
                return;
            }

            payBtn.disabled = true;
            payBtn.textContent = "Processing Checkout...";
            initiateProductionPayment();
        });
    }

    // ==========================================
    // 3. BACKEND GATEWAY HANDSHAKE (INTEGRATED)
    // ==========================================
    async function initiateProductionPayment() {
        const rawCartItems = JSON.parse(localStorage.getItem("urbanCart")) || [];

        if (liveProducts.length === 0) {
            liveProducts = await fetchLiveProducts();
        }

        let subtotal = 0;
        rawCartItems.forEach(item => {
            const targetId = item.productId || item.id;
            const liveProduct = liveProducts.find(p => p._id === targetId);
            const actualPrice = liveProduct ? liveProduct.price : item.price;
            subtotal += (actualPrice * item.quantity);
        });

        const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_CHARGE;
        const totalAmount = subtotal + shipping;

        const orderPayload = {
            customerInfo: {
                name: document.getElementById("cust-name").value.trim(),
                phone: document.getElementById("cust-phone").value.trim(),
                email: document.getElementById("cust-email").value.trim(),
                address: {
                    street: document.getElementById("cust-address").value.trim(),
                    city: document.getElementById("cust-city").value.trim(),
                    state: document.getElementById("cust-state").value.trim(),
                    pincode: document.getElementById("cust-pincode").value.trim()
                }
            },
            orderItems: rawCartItems.map(item => {
                const targetId = item.productId || item.id;
                const liveProduct = liveProducts.find(p => p._id === targetId);
                return {
                    product: targetId,
                    title: item.title,
                    size: item.size || "M",
                    quantity: item.quantity || 1,
                    price: liveProduct ? liveProduct.price : item.price
                };
            }),
            pricing: {
                subTotal: subtotal,
                shippingCharges: shipping,
                totalAmount: totalAmount
            }
        };

        try {
            const response = await fetch(`${API_BASE_URL}/api/orders/checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderPayload)
            });

            const data = await response.json();

            if (!data.success) {
                alert("Checkout Failed: " + data.message);
                resetPayButton();
                return;
            }

            const options = {
                "key": data.keyId,
                "amount": data.totalAmount * 100, // Amount in paisa
                "currency": "INR",
                "name": "Urban Sanskar",
                "description": "Secure Fashion Checkout",
                "order_id": data.razorpayOrderId,
                "handler": async function (razorpayResponse) {
                    try {
                        payBtn.textContent = "Verifying Payment...";
                        const verifyResponse = await fetch(`${API_BASE_URL}/api/orders/verify`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                razorpay_order_id: razorpayResponse.razorpay_order_id,
                                razorpay_payment_id: razorpayResponse.razorpay_payment_id,
                                razorpay_signature: razorpayResponse.razorpay_signature
                            })
                        });

                        const verifyData = await verifyResponse.json();

                        if (verifyData.success) {
                            if (typeof window.UrbanSanskarMeta?.track === "function") {
                                void window.UrbanSanskarMeta.track("Purchase", {
                                    eventId: razorpayResponse.razorpay_order_id,
                                    email: orderPayload.customerInfo.email,
                                    phone: orderPayload.customerInfo.phone,
                                    customData: {
                                        content_ids: orderPayload.orderItems.map(item => String(item.product)),
                                        content_type: "product",
                                        value: Number(data.totalAmount),
                                        currency: "INR",
                                        num_items: orderPayload.orderItems.reduce(
                                            (total, item) => total + Number(item.quantity),
                                            0
                                        )
                                    }
                                });
                            }

                            localStorage.removeItem("urbanCart");
                            window.location.href = "success.html";
                        } else {
                            alert("Payment Verification Failed: " + verifyData.message);
                            resetPayButton();
                        }
                    } catch (err) {
                        console.error("Verification Error:", err);
                        alert("Network error during payment verification!");
                        resetPayButton();
                    }
                },
                "prefill": {
                    "name": orderPayload.customerInfo.name,
                    "email": orderPayload.customerInfo.email,
                    "contact": orderPayload.customerInfo.phone
                },
                "theme": { "color": "#111111" },
                "modal": {
                    "ondismiss": function () {
                        resetPayButton();
                    }
                }
            };

            const rzp = new Razorpay(options);
            rzp.open();

        } catch (error) {
            console.error("Server Error:", error);
            alert("Could not connect to backend server.");
            resetPayButton();
        }
    }

    function resetPayButton() {
        if (payBtn) {
            payBtn.disabled = false;
            payBtn.textContent = "Proceed to Payment";
        }
    }
});
