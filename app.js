const API_BASE_URL = "https://urban-sanskar-backend.onrender.com";

const FALLBACK_PRODUCTS = [
    {
        _id: "fallback-1",
        title: "Luxury Linen Co-ord Set",
        price: 4999,
        mrpPrice: 6999,
        category: "coord-sets",
        images: ["1.JPG"]
    },
    {
        _id: "fallback-2",
        title: "Premium Handloom Dupatta",
        price: 2199,
        mrpPrice: 2999,
        category: "handloom-dupatta",
        images: ["dupatta.png"]
    },
    {
        _id: "fallback-3",
        title: "Signature Linen Dress",
        price: 3899,
        mrpPrice: 4999,
        category: "dress",
        images: ["5.png"]
    }
];

async function fetchProducts(endpoint, fallbackLabel) {
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data || !Array.isArray(data.products) || data.products.length === 0) {
            console.warn(`${fallbackLabel}: API returned no products. Falling back to static catalog.`);
            return FALLBACK_PRODUCTS;
        }

        return data.products;
    } catch (err) {
        console.warn(`${fallbackLabel}: Using static fallback catalog because the API is unavailable.`, err);
        return FALLBACK_PRODUCTS;
    }
}

// --- EXISTING NAVBAR DRAWER ACTIONS CODE ---
document.addEventListener('DOMContentLoaded', () => {
    const openMenuBtn = document.getElementById('menu-open-btn');
    const closeMenuBtn = document.getElementById('menu-close-btn');
    const drawerOverlay = document.getElementById('mobile-drawer-overlay');
    const navDrawer = document.getElementById('mobile-nav-drawer');

    function openMobileDrawer() {
        if (navDrawer && drawerOverlay) {
            navDrawer.classList.add('is-open');
            drawerOverlay.classList.add('is-visible');
            document.body.style.overflow = 'hidden';
            history.pushState({ mobileMenuState: 'activeOpen' }, '');
        }
    }

    function closeMobileDrawer() {
        if (navDrawer && drawerOverlay) {
            navDrawer.classList.remove('is-open');
            drawerOverlay.classList.remove('is-visible');
            document.body.style.overflow = '';
            if (history.state && history.state.mobileMenuState === 'activeOpen') {
                history.back();
            }
        }
    }

    if (openMenuBtn && closeMenuBtn && drawerOverlay && navDrawer) {
        openMenuBtn.addEventListener('click', openMobileDrawer);
        closeMenuBtn.addEventListener('click', closeMobileDrawer);
        drawerOverlay.addEventListener('click', closeMobileDrawer);
    }

    window.addEventListener('popstate', () => {
        if (navDrawer && navDrawer.classList.contains('is-open')) {
            navDrawer.classList.remove('is-open');
            if (drawerOverlay) drawerOverlay.classList.remove('is-visible');
            document.body.style.overflow = '';
        }
    });

    // --- CINEMATIC HERO REVEAL ENGINE ---
    const heroSection = document.getElementById('hero-section');
    if (heroSection) {
        setTimeout(() => {
            heroSection.classList.add('is-activated');
        }, 150);
    }
});

// --- UNIVERSAL HORIZONTAL SCROLL ENGINE ---
function initializeSlider(trackId, leftBtnId, rightBtnId) {
    const sliderTrack = document.getElementById(trackId);
    const leftArrow = document.getElementById(leftBtnId);
    const rightArrow = document.getElementById(rightBtnId);

    if (sliderTrack && leftArrow && rightArrow) {
        const getScrollAmount = () => {
            const firstCard = sliderTrack.querySelector('.product-card');
            return firstCard ? firstCard.clientWidth + 24 : 320;
        };

        rightArrow.addEventListener('click', () => {
            sliderTrack.scrollBy({ left: getScrollAmount(), behavior: 'smooth' });
        });

        leftArrow.addEventListener('click', () => {
            sliderTrack.scrollBy({ left: -getScrollAmount(), behavior: 'smooth' });
        });
    }
}

initializeSlider('new-arrivals-track', 'arrival-slide-left-btn', 'arrival-slide-right-btn');
initializeSlider('product-slider-track', 'slide-left-btn', 'slide-right-btn');
initializeSlider('rec-slider-track', 'slide-left-btn', 'slide-right-btn');

async function loadProductDetails(productId) {
    if (!productId) return;

    try {
        const res = await fetch(`${API_BASE_URL}/api/products/${productId}`);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        if (!data.success || !data.product) {
            console.warn(`Product ID '${productId}' database me nahi mila!`);
            return;
        }

        const product = data.product;
        const titleEl = document.getElementById('dyn-title');
        if (!titleEl) return;

        titleEl.innerText = product.title;

        const priceEl = document.getElementById('dyn-price');
        if (priceEl) {
            if (product.mrpPrice && product.mrpPrice > product.price) {
                priceEl.innerHTML = `
                    <span style="text-decoration: line-through; color: #888; margin-right: 12px; font-weight: 400; font-size: 1.1rem;">₹${Number(product.mrpPrice).toLocaleString('en-IN')}</span>
                    <span style="color: #111; font-weight: 800;">₹${Number(product.price).toLocaleString('en-IN')}</span>
                `;
            } else {
                priceEl.innerHTML = `₹${Number(product.price || 0).toLocaleString('en-IN')}`;
            }
        }

        const descEl = document.getElementById('dyn-desc');
        if (descEl) descEl.innerText = product.desc;
        document.title = `${product.title} | Urban Sanskar`;

        if (document.getElementById('dyn-collection')) {
            document.getElementById('dyn-collection').innerText = product.collectionTag;
        }
        if (document.getElementById('dyn-fabric')) {
            document.getElementById('dyn-fabric').innerText = product.fabric || "100% Certified Organic Premium Linen";
        }
        if (document.getElementById('dyn-fit')) {
            document.getElementById('dyn-fit').innerText = product.fit || "Relaxed";
        }
        if (document.getElementById('dyn-details')) {
            document.getElementById('dyn-details').innerText = product.details || "Minimalist Tailoring";
        }

        const stageImg = document.getElementById('stage-display-img');
        if (stageImg && product.images && product.images.length > 0) {
            stageImg.src = product.images[0].replace("/upload/", "/upload/f_auto,q_auto,w_800/");
        }

        const thumbs = document.querySelectorAll('.thumb-img');
        thumbs.forEach((thumb, index) => {
            if (product.images && product.images[index]) {
                thumb.src = product.images[index];
                thumb.style.display = "block";
                if (index === 0) thumb.classList.add('active');
                else thumb.classList.remove('active');
            } else {
                thumb.style.display = "none";
            }
        });

        generateRecommendations(product.category, product._id);
    } catch (err) {
        console.error("Product detail load karne me error aayi:", err);
    }
}

async function generateRecommendations(currentCategory, currentProductId) {
    const recTrack = document.getElementById('rec-slider-track');
    if (!recTrack) return;

    recTrack.innerHTML = "";

    try {
        const res = await fetch(`${API_BASE_URL}/api/products`);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data.success || !data.products) return;

        let matchCount = 0;
        data.products.forEach(product => {
            if (product.category === currentCategory && product._id !== currentProductId) {
                matchCount++;
                recTrack.innerHTML += createCardHTML(product);
            }
        });

        if (matchCount === 0) {
            data.products.forEach(product => {
                if (product._id !== currentProductId) {
                    recTrack.innerHTML += createCardHTML(product);
                }
            });
        }
    } catch (err) {
        console.error("Recommendations fetch karne me error:", err);
    }
}

async function loadHomepageBestSellers() {
    const homeSliderTrack = document.getElementById('product-slider-track');
    if (!homeSliderTrack) return;

    homeSliderTrack.innerHTML = "";

    const products = await fetchProducts('/api/products/bestsellers', 'Best sellers API');
    products.forEach(product => {
        homeSliderTrack.innerHTML += createCardHTML(product);
    });
}

async function loadHomepageNewArrivals() {
    const newArrivalsTrack = document.getElementById('new-arrivals-track');
    if (!newArrivalsTrack) return;

    newArrivalsTrack.innerHTML = "";

    const products = await fetchProducts('/api/products/newarrivals', 'New arrivals API');
    products.forEach(product => {
        newArrivalsTrack.innerHTML += createCardHTML(product);
    });
}

function createCardHTML(product) {
    const safeProduct = product || {};
    const price = Number(safeProduct.price || 0);
    const mrp = Number(safeProduct.mrpPrice || 0);
    const isOnSale = mrp > 0 && mrp > price;
    const imageUrl = Array.isArray(safeProduct.images) && safeProduct.images[0]
        ? safeProduct.images[0]
        : "1.JPG";

    const priceDisplay = isOnSale
        ? `<span style="text-decoration: line-through; color: #999; margin-right: 8px; font-size: 0.85rem; font-weight: normal;">₹${mrp.toLocaleString('en-IN')}</span><span style="color: #111; font-weight: 700;">₹${price.toLocaleString('en-IN')}</span>`
        : `₹${price.toLocaleString('en-IN')}`;

    return `
        <div onclick="redirectFromRecs('${safeProduct._id || 'fallback'}')" class="product-card" style="cursor:pointer;">
            <div class="prod-image-holder">
                <img src="${imageUrl}" class="prod-main-img" alt="${safeProduct.title || 'Urban Sanskar product'}">
            </div>
            <div class="prod-details-meta">
                <h4 class="prod-display-name">${safeProduct.title || 'Luxury Collection'}</h4>
                <span class="prod-display-price">${priceDisplay}</span>
            </div>
        </div>
    `;
}

function redirectFromRecs(id) {
    window.location.href = `product-detail.html?id=${id}`;
}

document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    if (productId) {
        loadProductDetails(productId);
    } else {
        loadHomepageNewArrivals();
        loadHomepageBestSellers();
    }

    const sizeChips = document.querySelectorAll('.size-chip-btn');
    if (sizeChips.length > 0) {
        sizeChips.forEach(chip => {
            chip.addEventListener('click', () => {
                sizeChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
            });
        });
    }
});

document.addEventListener("DOMContentLoaded", function () {
    function updateGlobalCartBadge() {
        let cart = JSON.parse(localStorage.getItem("urbanCart")) || [];
        let totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

        const cartBadge = document.querySelector(".cart-badge-dot");
        if (cartBadge) {
            cartBadge.textContent = totalItems;
            if (totalItems > 0) {
                cartBadge.style.display = "flex";
            } else {
                cartBadge.style.display = "none";
            }
        }
    }
    updateGlobalCartBadge();
});
