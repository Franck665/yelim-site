const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

const state = {
    user: null,
    articles: [],
    selected: null,
    lastDoc: null,
    hasMore: true,
    isLoading: false,
    pageSize: 24,
    search: "",
    editImages: []
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function value(id) {
    return $(`#${id}`).value.trim();
}

function intValue(id, fallback = 0) {
    const parsed = Number.parseInt(value(id), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function setButtonLoading(button, loading) {
    if (!button) return;
    button.classList.toggle("loading", loading);
    button.disabled = loading;
}

function showToast(message, isError = false) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.style.background = isError ? "#d92d20" : "#101114";
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
        toast.hidden = true;
    }, 4200);
}

auth.onAuthStateChanged(async (user) => {
    state.user = user;
    if (!user) {
        $("#auth-screen").hidden = false;
        $("#app-shell").hidden = true;
        return;
    }

    try {
        const adminProfile = await resolveAdminProfile(user);
        if (!adminProfile || adminProfile.actif !== true) {
            await auth.signOut();
            showLoginError("Ce compte n'est pas autorisé.");
            return;
        }
        $("#auth-screen").hidden = true;
        $("#app-shell").hidden = false;
        await refreshArticles();
    } catch (error) {
        showLoginError(error.message);
    }
});

async function resolveAdminProfile(user) {
    try {
        const directDoc = await db.collection("Administrateurs").doc(user.uid).get();
        if (directDoc.exists) return directDoc.data();
    } catch (error) {
        if (error.code !== "permission-denied") throw error;
    }

    try {
        const byUserId = await db.collection("Administrateurs")
            .where("userId", "==", user.uid)
            .limit(1)
            .get();
        if (!byUserId.empty) return byUserId.docs[0].data();
    } catch (error) {
        if (error.code !== "permission-denied") throw error;
    }

    try {
        const email = (user.email || "").trim().toLowerCase();
        if (!email) return null;
        const byEmail = await db.collection("Administrateurs")
            .where("email", "==", email)
            .limit(1)
            .get();
        if (!byEmail.empty) return byEmail.docs[0].data();
    } catch (error) {
        if (error.code !== "permission-denied") throw error;
    }

    return null;
}

$("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    setButtonLoading(button, true);
    showLoginError("");
    try {
        await auth.signInWithEmailAndPassword(value("login-email"), value("login-password"));
    } catch (error) {
        showLoginError("Connexion impossible. Vérifie l'email et le mot de passe.");
    } finally {
        setButtonLoading(button, false);
    }
});

$("#logout-button").addEventListener("click", () => auth.signOut());
$("#refresh-button").addEventListener("click", refreshArticles);
$("#load-more-button").addEventListener("click", () => loadArticles({ append: true }));
$("#search-input").addEventListener("input", debounce(async (event) => {
    state.search = event.target.value.trim();
    renderArticles();
    if (state.search.length >= 3) {
        await searchRemoteArticles(state.search);
    }
}, 260));

$("#close-edit").addEventListener("click", () => $("#edit-dialog").close());
$("#cancel-edit").addEventListener("click", () => $("#edit-dialog").close());
$("#edit-form").addEventListener("submit", saveEdit);
$("#edit-image-input").addEventListener("change", () => addEditImages(Array.from($("#edit-image-input").files || [])));

function showLoginError(message) {
    const error = $("#login-error");
    error.textContent = message;
    error.hidden = !message;
}

async function refreshArticles() {
    state.articles = [];
    state.lastDoc = null;
    state.hasMore = true;
    state.selected = null;
    renderDetail(null);
    await loadArticles({ append: false });
}

async function loadArticles({ append }) {
    if (state.isLoading || (!state.hasMore && append)) return;
    state.isLoading = true;
    setListStatus("Chargement des articles...");
    $("#load-more-button").disabled = true;
    try {
        let query = db.collection("Articles")
            .orderBy("date", "desc")
            .limit(state.pageSize);
        if (append && state.lastDoc) query = query.startAfter(state.lastDoc);
        const snapshot = await query.get();
        const incoming = snapshot.docs.map(articleFromDoc);
        state.lastDoc = snapshot.docs[snapshot.docs.length - 1] || state.lastDoc;
        state.hasMore = snapshot.docs.length === state.pageSize;
        state.articles = append ? uniqueArticles([...state.articles, ...incoming]) : incoming;
        renderArticles();
        setListStatus(`${state.articles.length} article${state.articles.length > 1 ? "s" : ""} chargé${state.articles.length > 1 ? "s" : ""}.`);
    } catch (error) {
        console.error(error);
        setListStatus(friendlyFirebaseError(error), true);
    } finally {
        state.isLoading = false;
        $("#load-more-button").hidden = !state.hasMore;
        $("#load-more-button").disabled = false;
    }
}

async function searchRemoteArticles(rawQuery) {
    const key = normalizeKeyword(rawQuery);
    if (!key) return;
    try {
        const snapshot = await db.collection("Articles")
            .where("keywords", "array-contains", key)
            .limit(20)
            .get();
        if (!snapshot.empty) {
            state.articles = uniqueArticles([...snapshot.docs.map(articleFromDoc), ...state.articles]);
            renderArticles();
        }
    } catch (error) {
        console.warn("Remote search skipped", error);
    }
}

function articleFromDoc(doc) {
    return { id: doc.id, ...doc.data() };
}

function uniqueArticles(articles) {
    const map = new Map();
    articles.forEach((article) => map.set(article.articleId || article.id, article));
    return Array.from(map.values());
}

function renderArticles() {
    const list = $("#articles-list");
    const filtered = filteredArticles();
    if (!filtered.length) {
        list.innerHTML = `<div class="empty-state">Aucun article trouvé</div>`;
        return;
    }

    list.innerHTML = "";
    filtered.forEach((article) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `article-row ${state.selected && articleKey(state.selected) === articleKey(article) ? "active" : ""}`;
        button.innerHTML = `
            ${articleImage(article) ? `<img class="article-thumb" src="${escapeAttr(articleImage(article))}" alt="">` : `<div class="article-thumb"></div>`}
            <span>
                <h3>${escapeHtml(article.nom || "Article sans nom")}</h3>
                <span class="row-meta">
                    <span>${escapeHtml(article.nomCollection || "Sans catégorie")}</span>
                    <span>${escapeHtml(article.vendeur || "Sans boutique")}</span>
                    <span>Stock ${number(article.stock)}</span>
                </span>
            </span>
            <strong class="row-price">${money(article.prix)} FCFA</strong>
        `;
        button.addEventListener("click", () => {
            state.selected = article;
            renderArticles();
            renderDetail(article);
        });
        list.appendChild(button);
    });
}

function filteredArticles() {
    const query = folded(state.search);
    if (!query) return state.articles;
    return state.articles.filter((article) => {
        const haystack = [
            article.nom,
            article.nomCollection,
            article.vendeur,
            article.desc,
            ...(article.hashtags || [])
        ].join(" ");
        return folded(haystack).includes(query);
    });
}

function renderDetail(article) {
    const panel = $("#detail-panel");
    if (!article) {
        panel.innerHTML = `
            <div class="empty-detail">
                <div class="brand-mark">Y</div>
                <h2>Sélectionne un article</h2>
                <p>Les informations, images et actions apparaîtront ici.</p>
            </div>
        `;
        return;
    }

    const images = article.productImages?.length ? article.productImages : [article.mainImage].filter(Boolean);
    panel.innerHTML = `
        <div class="detail-head">
            <div>
                <p class="eyebrow">${escapeHtml(article.nomCollection || "Article")}</p>
                <h2>${escapeHtml(article.nom || "Article sans nom")}</h2>
                <div class="detail-meta">
                    <span>${escapeHtml(article.vendeur || "Sans boutique")}</span>
                    <span>${escapeHtml(article.articleId || article.id)}</span>
                    <span>${escapeHtml(article.date || "")}</span>
                </div>
            </div>
            <div class="action-row">
                <button id="edit-article" class="secondary-button" type="button">Modifier</button>
                <button id="delete-article" class="danger-button" type="button">Supprimer</button>
            </div>
        </div>
        <div class="image-strip">
            ${images.length ? images.map((url) => `<img src="${escapeAttr(url)}" alt="">`).join("") : `<div class="image-placeholder"></div>`}
        </div>
        <div class="detail-grid">
            ${metric("Prix", `${money(article.prix)} FCFA`)}
            ${metric("Stock", number(article.stock))}
            ${metric("Prix achat", `${money(article.prixAchat)} FCFA`)}
            ${metric("Livraison", `${money(article.prixLivraison)} FCFA`)}
            ${metric("Expédition", `${money(article.prixExpedition)} FCFA`)}
            ${metric("Type vente", article.typeVente || "normal")}
            ${metric("Délai", article.delaiLivraison || "-")}
            ${metric("Poids", article.poidsColis || "-")}
            ${metric("Restriction", article.restrictionAge || "AUCUNE")}
        </div>
        <div class="detail-section">
            <h3>Description</h3>
            <p>${escapeHtml(article.desc || "Aucune description.")}</p>
        </div>
        <div class="detail-section">
            <h3>Hashtags</h3>
            <div class="tag-list">${(article.hashtags || []).map((tag) => `<span class="chip">#${escapeHtml(tag)}</span>`).join("") || `<p>Aucun hashtag.</p>`}</div>
        </div>
        <div class="detail-section">
            <h3>Variantes</h3>
            ${renderVariants(article.variants || article.colorsVariants || [])}
        </div>
    `;
    $("#edit-article").addEventListener("click", () => openEditDialog(article));
    $("#delete-article").addEventListener("click", () => deleteArticle(article));
}

function metric(label, value) {
    return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "-")}</strong></div>`;
}

function renderVariants(variants) {
    if (!variants.length) return `<p>Aucune variante.</p>`;
    return variants.map((variant) => `
        <div class="variant-summary">
            <strong>${escapeHtml(variant.nom || "Variante")}</strong>
            <div class="tag-list">
                ${(variant.options || []).map((option) => `<span class="chip">${escapeHtml(option.valeur || "")}${option.prixSupplementaire ? ` +${number(option.prixSupplementaire)}` : ""}</span>`).join("")}
            </div>
        </div>
    `).join("");
}

function openEditDialog(article) {
    $("#edit-id").value = article.id || article.articleId || "";
    setupEditImages(article);
    $("#edit-nom").value = article.nom || "";
    $("#edit-categorie").value = article.nomCollection || "";
    $("#edit-vendeur").value = article.vendeur || "";
    $("#edit-lienVideo").value = article.lienVideo || "";
    $("#edit-desc").value = article.desc || "";
    $("#edit-specification").value = article.specification || "";
    $("#edit-hashtags").value = (article.hashtags || []).join(", ");
    $("#edit-prix").value = article.prix ?? 0;
    $("#edit-prixAchat").value = article.prixAchat ?? 0;
    $("#edit-prixNonReduit").value = article.prixNonReduit ?? 0;
    $("#edit-stock").value = article.stock ?? 0;
    $("#edit-prixLivraison").value = article.prixLivraison ?? 0;
    $("#edit-prixExpedition").value = article.prixExpedition ?? 0;
    $("#edit-fraisGare").value = article.fraisTransportPourLivrerALaGare ?? 0;
    $("#edit-quantiteLimite").value = article.quantiteLimite ?? 1;
    $("#edit-quantiteLimiteExpedition").value = article.quantiteLimiteExpedition ?? 1;
    $("#edit-poidsColis").value = article.poidsColis || "léger";
    $("#edit-delaiLivraison").value = article.delaiLivraison || "";
    $("#edit-restrictionAge").value = article.restrictionAge || "AUCUNE";
    $("#edit-peutEtreExpedier").checked = article.peutEtreExpedier !== false;
    $("#edit-tranchable").checked = article.tranchable !== "false";
    $("#edit-precommande").checked = article.precommande === "true";
    $("#edit-isDerniereMinute").checked = article.isDerniereMinute === true;
    $("#edit-progressif").checked = article.paiementProgressifEnabled === true;
    $("#edit-status").textContent = "";
    $("#edit-dialog").showModal();
}

function setupEditImages(article) {
    state.editImages.forEach((image) => {
        if (image.localUrl) URL.revokeObjectURL(image.localUrl);
    });
    const urls = article.productImages?.length ? article.productImages : [article.mainImage].filter(Boolean);
    state.editImages = urls.map((url) => ({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        url,
        file: null,
        localUrl: null,
        isNew: false
    }));
    $("#edit-image-input").value = "";
    renderEditImages();
}

function addEditImages(files) {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    imageFiles.forEach((file) => {
        state.editImages.push({
            id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
            url: "",
            file,
            localUrl: URL.createObjectURL(file),
            isNew: true
        });
    });
    $("#edit-image-input").value = "";
    renderEditImages();
}

function renderEditImages() {
    const list = $("#edit-image-list");
    if (!state.editImages.length) {
        list.innerHTML = `<div class="empty-state">Aucune image sélectionnée</div>`;
        return;
    }
    list.innerHTML = "";
    state.editImages.forEach((image, index) => {
        const tile = document.createElement("div");
        tile.className = "edit-image-tile";
        tile.innerHTML = `
            <img src="${escapeAttr(image.localUrl || image.url)}" alt="Image ${index + 1}">
            <button type="button" aria-label="Supprimer">x</button>
            <span class="edit-image-badge">${index === 0 ? "Principale" : image.isNew ? "Nouvelle" : `Image ${index + 1}`}</span>
        `;
        $("button", tile).addEventListener("click", () => {
            if (image.localUrl) URL.revokeObjectURL(image.localUrl);
            state.editImages = state.editImages.filter((item) => item.id !== image.id);
            renderEditImages();
        });
        list.appendChild(tile);
    });
}

async function saveEdit(event) {
    event.preventDefault();
    const button = $("#save-edit");
    const id = value("edit-id");
    if (!id) return;
    setButtonLoading(button, true);
    $("#edit-status").textContent = "Sauvegarde...";
    try {
        $("#edit-status").textContent = "Préparation des images...";
        const finalImages = await resolveEditedImageUrls();
        const restriction = value("edit-restrictionAge") || "AUCUNE";
        const updates = {
            nom: value("edit-nom"),
            nomCollection: value("edit-categorie"),
            vendeur: value("edit-vendeur"),
            lienVideo: value("edit-lienVideo"),
            desc: value("edit-desc"),
            specification: value("edit-specification"),
            hashtags: parseTags(value("edit-hashtags"), value("edit-vendeur"), value("edit-categorie")),
            prix: intValue("edit-prix"),
            prixAchat: intValue("edit-prixAchat"),
            prixNonReduit: intValue("edit-prixNonReduit"),
            stock: intValue("edit-stock"),
            prixLivraison: intValue("edit-prixLivraison"),
            prixExpedition: intValue("edit-prixExpedition"),
            fraisTransportPourLivrerALaGare: intValue("edit-fraisGare"),
            quantiteLimite: Math.max(1, intValue("edit-quantiteLimite", 1)),
            quantiteLimiteExpedition: Math.max(1, intValue("edit-quantiteLimiteExpedition", 1)),
            poidsColis: value("edit-poidsColis"),
            delaiLivraison: value("edit-delaiLivraison"),
            restrictionAge: restriction,
            requiresAgeVerification: restriction !== "AUCUNE",
            ageMinimum: ageMinimum(restriction),
            categorieRestreinte: restrictedCategory(restriction),
            peutEtreExpedier: $("#edit-peutEtreExpedier").checked,
            tranchable: $("#edit-tranchable").checked ? "true" : "false",
            precommande: $("#edit-precommande").checked ? "true" : "false",
            isDerniereMinute: $("#edit-isDerniereMinute").checked,
            paiementProgressifEnabled: $("#edit-progressif").checked,
            keywords: generateKeywords(value("edit-nom"), value("edit-categorie"), value("edit-vendeur")),
            productImages: finalImages,
            mainImage: finalImages[0] || null
        };
        $("#edit-status").textContent = "Sauvegarde Firestore...";
        await db.collection("Articles").doc(id).update(updates);
        const updated = { ...state.selected, ...updates };
        state.selected = updated;
        state.articles = state.articles.map((article) => articleKey(article) === articleKey(updated) ? updated : article);
        renderArticles();
        renderDetail(updated);
        $("#edit-dialog").close();
        showToast("Article modifié.");
    } catch (error) {
        console.error(error);
        $("#edit-status").textContent = friendlyFirebaseError(error);
        $("#edit-status").className = "helper-text error";
    } finally {
        setButtonLoading(button, false);
    }
}

async function deleteArticle(article) {
    const label = article.nom || article.articleId || article.id;
    const ok = window.confirm(`Supprimer définitivement "${label}" ?`);
    if (!ok) return;
    try {
        await db.collection("Articles").doc(article.id || article.articleId).delete();
        state.articles = state.articles.filter((item) => articleKey(item) !== articleKey(article));
        state.selected = null;
        renderArticles();
        renderDetail(null);
        showToast("Article supprimé.");
    } catch (error) {
        console.error(error);
        showToast(friendlyFirebaseError(error), true);
    }
}

async function resolveEditedImageUrls() {
    const urls = [];
    for (const image of state.editImages) {
        if (image.file) {
            $("#edit-status").textContent = `Upload image ${urls.length + 1}/${state.editImages.length}...`;
            urls.push(await uploadEditedImage(image.file));
        } else if (image.url) {
            urls.push(image.url);
        }
    }
    return urls;
}

async function uploadEditedImage(file) {
    const image = await compressImage(file, {
        initialQuality: 0.78,
        targetBytes: 100 * 1024,
        maxSide: 1600,
        minQuality: 0.55
    });
    const ref = storage.ref().child(`article_images/${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}.${image.extension}`);
    await ref.put(image.blob, { contentType: image.contentType });
    return ref.getDownloadURL();
}

function compressImage(file, options = {}) {
    const {
        initialQuality = 0.78,
        targetBytes = 100 * 1024,
        maxSide = 1600,
        minQuality = 0.55
    } = options;

    return new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(file);
        image.onload = () => {
            compressImageAdaptive(image, { initialQuality, targetBytes, maxSide, minQuality })
                .then(resolve)
                .catch(reject)
                .finally(() => URL.revokeObjectURL(url));
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Image invalide."));
        };
        image.src = url;
    });
}

async function compressImageAdaptive(image, options) {
    const sizeSteps = [options.maxSide, Math.round(options.maxSide * 0.85), Math.round(options.maxSide * 0.72)];
    let best = null;

    for (const side of sizeSteps) {
        const canvas = drawImageToCanvas(image, side);
        for (let quality = options.initialQuality; quality >= options.minQuality; quality -= 0.06) {
            const blob = await canvasToBlob(canvas, "image/webp", quality);
            if (!blob) break;
            best = { blob, contentType: "image/webp", extension: "webp" };
            if (blob.size <= options.targetBytes) return best;
        }
    }

    if (best) return best;
    const fallbackCanvas = drawImageToCanvas(image, Math.round(options.maxSide * 0.72));
    const jpegBlob = await canvasToBlob(fallbackCanvas, "image/jpeg", Math.max(options.minQuality, 0.58));
    if (!jpegBlob) throw new Error("Compression image impossible.");
    return { blob: jpegBlob, contentType: "image/jpeg", extension: "jpg" };
}

function drawImageToCanvas(image, maxSide) {
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function parseTags(text, vendor, category) {
    const seen = new Set();
    const tags = text.split(",").map((tag) => normalizeTag(tag)).filter(Boolean);
    tags.push(normalizeTag(category));
    tags.push(normalizeTag(vendor));
    return tags.filter((tag) => {
        if (!tag || seen.has(tag)) return false;
        seen.add(tag);
        return true;
    });
}

function normalizeTag(text) {
    return String(text || "").replace(/^#/, "").trim().toLowerCase();
}

function generateKeywords(name, category, brand) {
    const cleaned = `${name} ${category} ${brand}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .toLowerCase();
    const keywords = new Set();
    cleaned.split(/\s+/).filter(Boolean).forEach((word) => {
        keywords.add(word);
        if (word.length > 2) {
            for (let i = 3; i <= Math.min(word.length, 20); i += 1) keywords.add(word.slice(0, i));
        }
    });
    return Array.from(keywords).slice(0, 500);
}

function restrictedCategory(restriction) {
    return {
        TABAC_VAPOTAGE: "TABAC_VAPOTAGE",
        ALCOOL: "ALCOOL",
        CONTENU_ADULTE: "CONTENU_ADULTE",
        PRODUITS_PHARMACEUTIQUES: "MEDICAMENTS"
    }[restriction] || null;
}

function ageMinimum(restriction) {
    if (restriction === "PRODUITS_PHARMACEUTIQUES") return 16;
    return restriction === "AUCUNE" ? 0 : 18;
}

function articleKey(article) {
    return article?.articleId || article?.id || "";
}

function articleImage(article) {
    return article?.productImages?.[0] || article?.mainImage || "";
}

function setListStatus(message, isError = false) {
    const status = $("#list-status");
    status.textContent = message;
    status.className = `helper-text ${isError ? "error" : ""}`;
}

function friendlyFirebaseError(error) {
    const code = error?.code || "";
    const message = error?.message || "Action impossible.";
    if (code.includes("permission-denied") || /permission/i.test(message)) {
        return "Permissions refusées par Firebase pour cette action.";
    }
    return message;
}

function normalizeKeyword(text) {
    return folded(text).replace(/[^\p{L}\p{N}]/gu, "").slice(0, 20);
}

function folded(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function money(value) {
    return new Intl.NumberFormat("fr-FR").format(Number(value) || 0);
}

function number(value) {
    return new Intl.NumberFormat("fr-FR").format(Number(value) || 0);
}

function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[char]));
}

function escapeAttr(text) {
    return escapeHtml(text).replace(/`/g, "&#096;");
}

function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}
