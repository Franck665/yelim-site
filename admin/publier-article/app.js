const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

const state = {
    user: null,
    images: [],
    hashtags: [],
    taxonomyTags: [],
    selectedSizes: new Set(),
    selectedColors: new Set(),
    boutiques: new Map(),
    categories: [],
    templateArticles: [],
    isPublishing: false,
    publishStep: ""
};

const units = [
    ["PIECE", "Pièce"],
    ["DOUZAINE", "Douzaine"],
    ["CENTAINE", "Centaine"],
    ["MILLIER", "Millier"],
    ["BALLE", "Balle"],
    ["CARTON", "Carton"],
    ["LOT_5", "Lot de 5"],
    ["LOT_10", "Lot de 10"],
    ["LOT_20", "Lot de 20"],
    ["LOT_25", "Lot de 25"],
    ["LOT_50", "Lot de 50"],
    ["PAIRE", "Paire"],
    ["TRIO", "Trio"],
    ["PACK_6", "Pack de 6"],
    ["PALETTE", "Palette"],
    ["METRE", "Mètre"],
    ["KILOGRAMME", "Kilogramme"],
    ["LITRE", "Litre"],
    ["CUSTOM", "Personnalisé"]
];

const sizePresets = {
    clothes: ["XS", "S", "M", "L", "XL", "XXL", "3XL"],
    shoes: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"],
    kids: ["0-3 mois", "3-6 mois", "6-12 mois", "1-2 ans", "2-3 ans"]
};

const colors = [
    ["Noir", "#000000"],
    ["Blanc", "#FFFFFF"],
    ["Rouge", "#FF0000"],
    ["Bleu", "#0000FF"],
    ["Vert", "#008000"],
    ["Rose", "#FFC0CB"],
    ["Jaune", "#FFFF00"],
    ["Marron", "#8B4513"],
    ["Gris", "#808080"],
    ["Beige", "#F5F5DC"],
    ["Orange", "#FFA500"],
    ["Violet", "#800080"]
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function value(id) {
    return $(`#${id}`).value.trim();
}

function intValue(id, fallback = 0) {
    const number = Number.parseInt(value(id), 10);
    return Number.isFinite(number) ? number : fallback;
}

function checked(id) {
    return $(`#${id}`).checked;
}

function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showToast(message, isError = false) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.style.background = isError ? "#d92d20" : "#101114";
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
        toast.hidden = true;
    }, 4800);
}

function setButtonLoading(button, loading) {
    button.classList.toggle("loading", loading);
    button.disabled = loading;
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
            showLoginError("Ce compte n'est pas autorisé à publier.");
            return;
        }
        $("#auth-screen").hidden = true;
        $("#app-shell").hidden = false;
        await loadReferenceData();
        updateAll();
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

function showLoginError(message) {
    const error = $("#login-error");
    error.textContent = message;
    error.hidden = !message;
}

async function loadReferenceData() {
    await Promise.all([loadCategories(), loadVendors()]);
}

async function loadCategories() {
    const datalist = $("#categories-list");
    const categoryNames = [];
    const hashtagNames = [];
    try {
        const taxonomy = await db.collection("Config").doc("Taxonomy").get();
        const data = taxonomy.data() || {};
        collectStrings(data.all_tags, categoryNames);
        collectStrings(data.tags, categoryNames);
        collectStrings(data.categories, categoryNames);
        collectStrings(data.category_hierarchy, categoryNames);
        collectStrings(data.categoryTemplates, categoryNames);

        collectStrings(data.all_tags, hashtagNames);
        collectStrings(data.all_hashtags, hashtagNames);
    } catch (error) {
        console.warn("Taxonomy unavailable", error);
    }
    state.categories = uniqueNames(categoryNames).sort((a, b) => a.localeCompare(b));
    state.taxonomyTags = uniqueNames(hashtagNames).sort((a, b) => a.localeCompare(b));
    datalist.innerHTML = state.categories.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
    renderHashtagLibrary();
}

async function loadVendors() {
    const datalist = $("#vendeurs-list");
    const snapshot = await db.collection("Fournisseurs").get();
    snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.nom) state.boutiques.set(data.nom, data);
    });
    datalist.innerHTML = Array.from(state.boutiques.keys())
        .sort((a, b) => a.localeCompare(b))
        .map((item) => `<option value="${escapeHtml(item)}"></option>`)
        .join("");
}

function collectStrings(input, list) {
    if (!input) return;
    if (Array.isArray(input)) {
        input.forEach((item) => collectStrings(item, list));
        return;
    }
    if (typeof input === "string" && input.trim()) {
        list.push(input.trim());
        return;
    }
    if (typeof input === "object") {
        Object.keys(input).forEach((key) => {
            if (key.trim()) list.push(key.trim());
            collectStrings(input[key], list);
        });
    }
}

function uniqueNames(names) {
    const seen = new Set();
    const result = [];
    names.forEach((rawName) => {
        const trimmed = String(rawName || "").trim();
        const normalized = folded(trimmed);
        if (!trimmed || seen.has(normalized)) return;
        seen.add(normalized);
        result.push(trimmed);
    });
    return result;
}

function folded(text) {
    return String(text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function normalizeKeyword(text) {
    return folded(text).replace(/[^\p{L}\p{N}]/gu, "").slice(0, 20);
}

function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[char]));
}

function setupStaticControls() {
    $("#uniteVente").innerHTML = units.map(([raw, label]) => `<option value="${raw}">${label}</option>`).join("");
    renderSelectableChips("size-chips", sizePresets.clothes, state.selectedSizes);
    renderSelectableChips("color-chips", colors.map(([name]) => name), state.selectedColors, true);
}

function renderSelectableChips(containerId, items, selectedSet, withColor = false) {
    const container = $(`#${containerId}`);
    container.innerHTML = "";
    items.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `chip ${selectedSet.has(item) ? "selected" : ""}`;
        if (withColor) {
            const color = colors.find(([name]) => name === item)?.[1] || "#fff";
            button.innerHTML = `<span class="color-dot" style="background:${color}"></span>${escapeHtml(item)}`;
        } else {
            button.textContent = item;
        }
        button.addEventListener("click", () => {
            if (selectedSet.has(item)) selectedSet.delete(item);
            else selectedSet.add(item);
            renderSelectableChips(containerId, items, selectedSet, withColor);
            updateAll();
        });
        container.appendChild(button);
    });
}

$("#size-preset").addEventListener("click", () => {
    const cat = value("categorie").toLowerCase();
    const preset = cat.includes("chaussure") || cat.includes("basket") || cat.includes("sandale")
        ? sizePresets.shoes
        : cat.includes("enfant") || cat.includes("bébé") || cat.includes("bebe")
            ? sizePresets.kids
            : ["S", "M", "L", "XL"];
    preset.forEach((item) => state.selectedSizes.add(item));
    renderSelectableChips("size-chips", getCurrentSizePreset(), state.selectedSizes);
    updateAll();
});

$("#color-preset").addEventListener("click", () => {
    ["Noir", "Blanc", "Rouge", "Bleu", "Vert"].forEach((item) => state.selectedColors.add(item));
    renderSelectableChips("color-chips", colors.map(([name]) => name), state.selectedColors, true);
    updateAll();
});

function getCurrentSizePreset() {
    const cat = value("categorie").toLowerCase();
    if (cat.includes("chaussure") || cat.includes("basket") || cat.includes("sandale") || cat.includes("botte")) {
        return sizePresets.shoes;
    }
    if (cat.includes("enfant") || cat.includes("bébé") || cat.includes("bebe")) {
        return sizePresets.kids;
    }
    return sizePresets.clothes;
}

$("#categorie").addEventListener("change", () => {
    renderSelectableChips("size-chips", getCurrentSizePreset(), state.selectedSizes);
    updateAll();
});

$("#reset-form-button").addEventListener("click", () => {
    const ok = window.confirm("Vider tous les champs du formulaire ?");
    if (!ok) return;
    resetFormCompletely();
    showToast("Formulaire réinitialisé.");
});

$("#article-template-search").addEventListener("input", debounce((event) => {
    searchTemplateArticles(event.target.value);
}, 320));

$("#clear-template-search").addEventListener("click", () => {
    $("#article-template-search").value = "";
    state.templateArticles = [];
    renderTemplateResults();
});

const dropZone = $("#drop-zone");
const imageInput = $("#image-input");

dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
    addImages(Array.from(event.dataTransfer.files || []));
});
imageInput.addEventListener("change", () => addImages(Array.from(imageInput.files || [])));

function addImages(files) {
    const imageFiles = files.filter((file) => file.type.startsWith("image/")).slice(0, 5 - state.images.length);
    imageFiles.forEach((file) => {
        state.images.push({
            id: uuid(),
            file,
            url: URL.createObjectURL(file)
        });
    });
    renderImages();
    updateAll();
}

function renderImages() {
    const preview = $("#image-preview");
    preview.innerHTML = "";
    state.images.forEach((image, index) => {
        const tile = document.createElement("div");
        tile.className = "image-tile";
        tile.innerHTML = `<img src="${image.url}" alt="Image ${index + 1}"><button type="button" aria-label="Retirer">x</button>`;
        $("button", tile).addEventListener("click", () => {
            URL.revokeObjectURL(image.url);
            state.images = state.images.filter((item) => item.id !== image.id);
            renderImages();
            updateAll();
        });
        preview.appendChild(tile);
    });
}

$("#hashtag-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        addHashtag(event.target.value);
        event.target.value = "";
    }
});

$("#toggle-hashtag-library").addEventListener("click", () => {
    const panel = $("#hashtag-library");
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
        $("#hashtag-library-search").focus();
        renderHashtagLibrary();
    }
});

$("#hashtag-library-search").addEventListener("input", renderHashtagLibrary);

$("#apply-suggestions").addEventListener("click", () => {
    getHashtagSuggestions().forEach(addHashtag);
    updateAll();
});

function addHashtag(raw) {
    const tag = normalizeTag(raw);
    if (!tag || state.hashtags.includes(tag)) return;
    state.hashtags.push(tag);
    renderHashtags();
    renderHashtagLibrary();
}

function normalizeTag(raw) {
    return raw.replace(/^#/, "").trim().toLowerCase();
}

function renderHashtags() {
    const chips = $("#hashtag-chips");
    chips.innerHTML = "";
    state.hashtags.forEach((tag) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chip selected";
        button.textContent = `#${tag} x`;
        button.addEventListener("click", () => {
            state.hashtags = state.hashtags.filter((item) => item !== tag);
            renderHashtags();
            renderHashtagLibrary();
            updateAll();
        });
        chips.appendChild(button);
    });
    updateAll();
}

function renderHashtagLibrary() {
    const list = $("#hashtag-library-list");
    const count = $("#hashtag-library-count");
    if (!list || !count) return;

    const query = folded($("#hashtag-library-search").value);
    const selected = new Set(state.hashtags);
    const filtered = state.taxonomyTags
        .filter((tag) => !query || folded(tag).includes(query))
        .slice(0, 180);

    count.textContent = `${state.hashtags.length} sélectionné${state.hashtags.length > 1 ? "s" : ""}`;
    if (!filtered.length) {
        list.innerHTML = `<div class="empty-state">Aucun hashtag trouvé</div>`;
        return;
    }

    list.innerHTML = "";
    filtered.forEach((tag) => {
        const normalized = normalizeTag(tag);
        const label = document.createElement("label");
        label.className = "check-option";
        label.innerHTML = `
            <input type="checkbox" ${selected.has(normalized) ? "checked" : ""}>
            <span>#${escapeHtml(normalized)}</span>
        `;
        $("input", label).addEventListener("change", (event) => {
            if (event.target.checked) {
                addHashtag(normalized);
            } else {
                state.hashtags = state.hashtags.filter((item) => item !== normalized);
                renderHashtags();
                renderHashtagLibrary();
            }
        });
        list.appendChild(label);
    });
}

async function searchTemplateArticles(rawQuery) {
    const query = rawQuery.trim();
    const box = $("#article-template-results");
    if (query.length < 3) {
        state.templateArticles = [];
        renderTemplateResults();
        return;
    }

    box.innerHTML = `<div class="empty-state">Recherche...</div>`;
    try {
        const key = normalizeKeyword(query);
        const keywordResults = key
            ? await db.collection("Articles").where("keywords", "array-contains", key).limit(12).get()
            : null;
        const articles = keywordResults?.docs.map((doc) => ({ id: doc.id, ...doc.data() })) || [];

        state.templateArticles = articles.filter((article) => (
            folded([
                article.nom,
                article.nomCollection,
                article.vendeur,
                ...(article.hashtags || [])
            ].join(" ")).includes(folded(query)) || articles.length <= 5
        ));
        renderTemplateResults();
    } catch (error) {
        console.error(error);
        box.innerHTML = `<div class="empty-state">Recherche impossible</div>`;
    }
}

function renderTemplateResults() {
    const box = $("#article-template-results");
    if (!state.templateArticles.length) {
        box.innerHTML = "";
        return;
    }

    box.innerHTML = "";
    state.templateArticles.forEach((article) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "template-result";
        const imageUrl = article.productImages?.[0] || article.mainImage || "";
        button.innerHTML = `
            ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="">` : `<span class="template-thumb"></span>`}
            <span>
                <strong>${escapeHtml(article.nom || "Article sans nom")}</strong>
                <small>${escapeHtml(article.nomCollection || "Sans catégorie")} · ${escapeHtml(article.vendeur || "Sans boutique")}</small>
            </span>
            <span class="row-price">${formatMoney(article.prix || 0)} FCFA</span>
        `;
        button.addEventListener("click", () => applyTemplateArticle(article));
        box.appendChild(button);
    });
}

function applyTemplateArticle(article) {
    $("#nom").value = article.nom || "";
    $("#categorie").value = article.nomCollection || "";
    $("#vendeur").value = article.vendeur || "";
    $("#details").value = article.desc || "";
    $("#specification").value = article.specification || "";
    $("#lien").value = article.lienVideo || "";
    $("#prix").value = article.prix ?? "";
    $("#prixAchat").value = article.prixAchat ?? "";
    $("#prixNonReduit").value = article.prixNonReduit ?? 0;
    $("#stock").value = article.stock ?? "";
    $("#qtLimit").value = article.quantiteLimite ?? 1;
    $("#cash").value = article.cash ?? "";
    $("#prixExp").value = article.prixExpedition ?? 1000;
    $("#prixLiv").value = article.prixLivraison ?? 750;
    $("#fraisTransportGare").value = article.fraisTransportPourLivrerALaGare ?? 750;
    $("#qtLimitExp").value = article.quantiteLimiteExpedition ?? 5;
    $("#poids").value = article.poidsColis || "léger";
    $("#delai").value = article.delaiLivraison || "2 heures";
    $("#expediable").checked = article.peutEtreExpedier !== false;
    $("#tranchable").checked = article.tranchable !== "false";
    $("#precommande").checked = article.precommande === "true";
    $("#typePrecommande").value = article.typePrecommande || "locale";
    $("#isDerniereMinute").checked = article.isDerniereMinute === true;
    $("#progressif").checked = article.paiementProgressifEnabled === true;
    $("#freqProgressif").value = article.paiementProgressifFrequence || "semaine";
    $("#dureeProgressif").value = article.paiementProgressifDuree || "3 mois";
    $("#venteParQuantiteSpecifique").checked = article.venteParQuantiteSpecifique === true;
    $("#uniteVente").value = article.uniteVente || "PIECE";
    $("#quantiteParUnite").value = article.quantiteParUnite ?? 1;
    $("#prixUniteVente").value = article.prixUniteVente ?? 0;
    $("#prixAchatUniteVente").value = article.prixAchatUniteVente ?? 0;
    $("#prixPieceIndividuelle").value = article.prixPieceIndividuelle ?? 0;
    $("#venteIndividuelleAutorisee").checked = article.venteIndividuelleAutorisee === true;
    $("#quantiteMinimumCommande").value = article.quantiteMinimumCommande ?? 1;
    $("#incrementQuantite").value = article.incrementQuantite ?? 1;
    $("#affichagePrixUnitaire").checked = article.affichagePrixUnitaire !== false;
    $("#libellePrixUnitaire").value = article.libellePrixUnitaire || "";
    $("#informationsQuantite").value = article.informationsQuantite || "";
    $("#reductionQuantite").checked = article.reductionQuantite !== false;
    $("#quantiteLimiteExpeditionUniteDeVente").value = article.quantiteLimiteExpeditionUniteDeVente ?? 5;
    $("#quantiteLimiteLivraisonUniteDeVente").value = article.quantiteLimiteLivraisonUniteDeVente ?? 5;
    $("#prixExpeditionUniteDeVente").value = article.prixExpeditionUniteDeVente ?? 750;
    $("#prixLivraisonUniteDeVente").value = article.prixLivraisonUniteDeVente ?? 750;
    $("#reductions").value = reductionsToText(article.reductions || []);
    $("#restrictionAge").value = article.restrictionAge || "AUCUNE";

    state.hashtags = (article.hashtags || []).filter((tag) => normalizeTag(tag) !== normalizeTag(article.vendeur));
    clearImagesAndVariants();
    renderHashtags();
    renderHashtagLibrary();
    updateAll();
    showToast("Informations chargées. Images et variantes non reprises.");
}

function reductionsToText(reductions) {
    return reductions
        .map((reduction) => `${reduction.condition ?? reduction.quantite ?? ""} to ${reduction.prix ?? ""}`.trim())
        .filter((item) => item !== "to")
        .join(", ");
}

function renderSuggestions() {
    const box = $("#hashtag-suggestions");
    box.innerHTML = "";
    getHashtagSuggestions().forEach((tag) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chip suggestion";
        button.textContent = `#${tag}`;
        button.addEventListener("click", () => addHashtag(tag));
        box.appendChild(button);
    });
}

function getHashtagSuggestions() {
    const parts = [
        value("categorie"),
        value("vendeur"),
        ...value("nom").split(/\s+/).filter((word) => word.length > 3).slice(0, 3)
    ];
    return Array.from(new Set(parts.map(normalizeTag).filter(Boolean))).filter((tag) => !state.hashtags.includes(tag));
}

$("#add-variant").addEventListener("click", () => addVariantCard());
$("#variant-json-input").addEventListener("change", handleVariantJsonImport);

function addVariantCard(seed = {}) {
    const template = $("#variant-template").content.cloneNode(true);
    const card = $(".variant-card", template);
    $(".variant-name", card).value = seed.nom || "";
    $(".variant-required", card).checked = seed.mustBeSelected !== false;
    $(".remove-variant", card).addEventListener("click", () => {
        card.remove();
        updateAll();
    });
    $(".add-option", card).addEventListener("click", () => addOptionRow(card));
    $("#variant-list").appendChild(template);
    (seed.options || [{}]).forEach((option) => addOptionRow(card, option));
}

function addOptionRow(card, seed = {}) {
    const template = $("#option-template").content.cloneNode(true);
    const row = $(".option-row", template);
    row.dataset.imageUrl = seed.imageUrl || "";
    row.dataset.stability = seed.stability ?? "";
    $(".option-value", row).value = seed.valeur || "";
    $(".option-price", row).value = seed.prixSupplementaire || 0;
    $(".option-color", row).value = seed.couleurHexa || "";
    $(".remove-option", row).addEventListener("click", () => {
        row.remove();
        updateAll();
    });
    $(".variant-options", card).appendChild(template);
}

async function handleVariantJsonImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const status = $("#variant-json-status");
    status.className = "helper-text";
    status.textContent = "Lecture du fichier JSON...";
    try {
        const text = await file.text();
        const object = JSON.parse(text);
        const importedVariants = decodeImportedVariants(object);
        const summary = mergeImportedVariants(importedVariants);
        status.className = "helper-text success";
        status.textContent = `Import JSON réussi: ${summary.variants} variante${summary.variants > 1 ? "s" : ""}, ${summary.options} option${summary.options > 1 ? "s" : ""}.`;
        showToast(status.textContent);
        updateAll();
    } catch (error) {
        status.className = "helper-text error";
        status.textContent = `Import JSON impossible: ${error.message}`;
        showToast(status.textContent, true);
    } finally {
        event.target.value = "";
    }
}

function decodeImportedVariants(object) {
    if (Array.isArray(object)) {
        return decodeImportedVariantsFromArray(object, "couleur");
    }

    if (object && typeof object === "object") {
        return decodeImportedVariantsFromDictionary(object);
    }

    throw variantImportError("Le fichier doit contenir un objet JSON ou une liste JSON.");
}

function decodeImportedVariantsFromDictionary(dictionary) {
    const variantsArray = firstArray(dictionary, ["variants", "variantes"]);
    if (variantsArray) {
        return variantsArray.map((item) => importedVariant(item, null));
    }

    if (firstArray(dictionary, ["options", "valeurs", "values", "choix", "items"])) {
        return [importedVariant(dictionary, "couleur")];
    }

    const variants = Object.keys(dictionary)
        .sort((a, b) => a.localeCompare(b))
        .filter((key) => Array.isArray(dictionary[key]))
        .map((key) => importedVariant({ nom: key, options: dictionary[key] }, key));

    if (!variants.length) {
        throw variantImportError('Aucune variante trouvée. Exemple attendu: { "nom": "couleur", "options": [...] }.');
    }

    return variants;
}

function decodeImportedVariantsFromArray(array, defaultName) {
    const containsVariantObjects = array.some((item) => (
        item && typeof item === "object" && !Array.isArray(item)
        && firstArray(item, ["options", "valeurs", "values", "choix", "items"])
    ));

    if (containsVariantObjects) {
        return array.map((item) => importedVariant(item, null));
    }

    return [{
        nom: defaultName,
        mustBeSelected: true,
        options: array.map(importedOption)
    }];
}

function importedVariant(object, defaultName) {
    if (!object || typeof object !== "object" || Array.isArray(object)) {
        throw variantImportError("Une variante doit être un objet JSON.");
    }

    const name = firstString(object, ["nom", "name", "variantName", "type", "titre", "title"])
        || defaultName
        || "Variante";
    const optionsArray = firstArray(object, ["options", "valeurs", "values", "choix", "items"]);

    if (!optionsArray) {
        throw variantImportError(`La variante "${name}" ne contient pas de liste d'options.`);
    }

    const options = optionsArray.map(importedOption);
    if (!options.length) {
        throw variantImportError(`La variante "${name}" ne contient aucune option valide.`);
    }

    return {
        nom: name.trim(),
        mustBeSelected: firstBool(object, ["mustBeSelected", "obligatoire", "required", "isRequired"]) ?? true,
        options
    };
}

function importedOption(object) {
    if (typeof object === "string" || typeof object === "number") {
        return optionFromSimpleValue(String(object));
    }

    if (!object || typeof object !== "object" || Array.isArray(object)) {
        throw variantImportError("Une option doit être un objet JSON, un texte ou un nombre.");
    }

    const hexValue = normalizeHex(firstString(object, ["couleurHexa", "couleurHex", "hex", "hexa", "hexColor", "colorHex", "codeHex", "codeCouleur"]) || "");
    const rawName = firstString(object, ["valeur", "nom", "name", "label", "value", "couleur", "color", "titre", "title"]);
    const name = (rawName || hexValue || "").trim();

    if (!name) {
        throw variantImportError("Une option importée n'a ni nom, ni valeur, ni code couleur.");
    }

    return {
        valeur: name,
        prixSupplementaire: Math.max(0, firstInt(object, ["prixSupplementaire", "prixSupp", "supplement", "prix", "price", "extraPrice", "priceSupplement", "additionalPrice"]) || 0),
        imageUrl: firstString(object, ["imageUrl", "imageURL", "image", "url", "photoUrl", "photoURL"]) || "",
        stability: firstInt(object, ["stability", "stock", "quantite", "quantity"]),
        couleurHexa: hexValue
    };
}

function mergeImportedVariants(importedVariants) {
    let variantsCount = 0;
    let optionsCount = 0;
    removeEmptyVariantCards();

    importedVariants.forEach((variant) => {
        const name = String(variant.nom || "").trim();
        const options = uniqueImportedOptions(variant.options || []);
        if (!name || !options.length) return;

        const existing = $$(".variant-card").find((card) => (
            $(".variant-name", card).value.trim().toLowerCase() === name.toLowerCase()
        ));
        if (existing) existing.remove();

        addVariantCard({
            nom: name,
            mustBeSelected: variant.mustBeSelected !== false,
            options
        });
        variantsCount += 1;
        optionsCount += options.length;
    });

    return { variants: variantsCount, options: optionsCount };
}

function removeEmptyVariantCards() {
    $$(".variant-card").forEach((card) => {
        const name = $(".variant-name", card).value.trim();
        const hasOptionValue = $$(".option-value", card).some((input) => input.value.trim());
        if (!name && !hasOptionValue) card.remove();
    });
}

function uniqueImportedOptions(options) {
    const seen = new Set();
    const unique = [];
    options.forEach((option) => {
        const value = String(option.valeur || "").trim();
        if (!value) return;
        const key = `${value.toLowerCase()}|${String(option.couleurHexa || "").toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        unique.push({ ...option, valeur: value });
    });
    return unique;
}

function optionFromSimpleValue(rawValue) {
    const value = String(rawValue || "").trim();
    return {
        valeur: value,
        prixSupplementaire: 0,
        imageUrl: "",
        couleurHexa: normalizeHex(value)
    };
}

function firstArray(dictionary, keys) {
    for (const key of keys) {
        if (Array.isArray(dictionary[key])) return dictionary[key];
    }
    return null;
}

function firstString(dictionary, keys) {
    for (const key of keys) {
        const value = dictionary[key];
        if (typeof value === "string" && value.trim()) return value.trim();
        if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return null;
}

function firstInt(dictionary, keys) {
    for (const key of keys) {
        const value = dictionary[key];
        if (Number.isInteger(value)) return value;
        if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
        if (typeof value === "string") {
            const cleaned = value.replace(/FCFA/gi, "").replace(/\s+/g, "").trim();
            const parsed = Number.parseInt(cleaned, 10);
            if (Number.isFinite(parsed)) return parsed;
        }
    }
    return null;
}

function firstBool(dictionary, keys) {
    for (const key of keys) {
        const value = dictionary[key];
        if (typeof value === "boolean") return value;
        if (typeof value === "number") return Boolean(value);
        if (typeof value === "string") {
            switch (value.trim().toLowerCase()) {
                case "true":
                case "oui":
                case "yes":
                case "1":
                    return true;
                case "false":
                case "non":
                case "no":
                case "0":
                    return false;
                default:
                    break;
            }
        }
    }
    return null;
}

function variantImportError(message) {
    return new Error(message);
}

["precommande", "progressif", "venteParQuantiteSpecifique"].forEach((id) => {
    $(`#${id}`).addEventListener("change", updateConditionalFields);
});

function updateConditionalFields() {
    $("#precommande-fields").hidden = !checked("precommande");
    $("#progressif-fields").hidden = !checked("progressif");
    $("#quantity-fields").hidden = !checked("venteParQuantiteSpecifique");
}

function scanInputs() {
    $$("input, textarea, select", $("#article-form")).forEach((input) => {
        input.addEventListener("input", updateAll);
        input.addEventListener("change", updateAll);
    });
}

function updateAll() {
    updateConditionalFields();
    renderSuggestions();
    updatePreview();
    updateCompletion();
    renderWarnings();
    updateActiveNav();
}

function updatePreview() {
    $("#preview-title").textContent = value("nom") || "Nom de l'article";
    $("#preview-category").textContent = value("categorie") || "Catégorie";
    $("#preview-vendor").textContent = value("vendeur") || "Boutique";
    $("#preview-price").textContent = `${formatMoney(intValue("prix"))} FCFA`;
    const holder = $("#preview-image");
    holder.innerHTML = state.images[0] ? `<img src="${state.images[0].url}" alt="">` : "";
}

function formatMoney(amount) {
    return new Intl.NumberFormat("fr-FR").format(amount || 0);
}

function updateCompletion() {
    const missing = getMissingFields();
    const checks = [
        state.images.length > 0,
        Boolean(value("nom")),
        Boolean(value("vendeur")),
        Boolean(value("categorie")),
        intValue("prix") > 0,
        intValue("stock") > 0,
        Boolean(value("details")),
        state.hashtags.length > 0
    ];
    const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
    $("#completion-score").textContent = `${score}%`;
    $("#completion-bar").style.width = `${score}%`;
    $("#missing-list").innerHTML = missing.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function getMissingFields() {
    const missing = [];
    if (state.images.length === 0) missing.push("Ajouter au moins une image");
    if (!value("nom")) missing.push("Renseigner le nom");
    if (!value("vendeur")) missing.push("Choisir une boutique");
    if (intValue("prix") <= 0) missing.push("Prix de vente supérieur à 0");
    if (intValue("stock") <= 0) missing.push("Stock supérieur à 0");
    return missing;
}

function renderWarnings() {
    const warnings = validate(false).warnings;
    $("#warnings").innerHTML = warnings.map((warning) => `<div class="warning-item">${escapeHtml(warning)}</div>`).join("");
}

function validate(blocking = true) {
    const errors = [];
    const warnings = [];
    if (state.images.length === 0) errors.push("Veuillez sélectionner au moins une image.");
    if (!value("nom")) errors.push("Le nom de l'article est requis.");
    if (!value("vendeur")) errors.push("La boutique / vendeur est requis.");
    if (intValue("stock") <= 0) errors.push("Le stock de l'article doit être supérieur à 0.");
    if (intValue("qtLimit", 0) <= 0) errors.push("La quantité limite de livraison doit être supérieure ou égale à 1.");
    if (intValue("qtLimitExp", 0) <= 0) errors.push("La quantité limite d'expédition doit être supérieure ou égale à 1.");
    if (intValue("prixAchat") > intValue("prix")) errors.push("Le prix d'achat ne peut pas dépasser le prix de vente.");
    if (checked("venteParQuantiteSpecifique") && intValue("prixAchatUniteVente") > intValue("prixUniteVente")) {
        errors.push("Le prix d'achat de l'unité ne peut pas dépasser son prix de vente.");
    }
    const days = daysFromDelay(value("delai"));
    if (checked("precommande") && days < 2) errors.push("Pour une précommande, choisissez un délai de 2 jours minimum.");
    if (!checked("precommande") && days >= 2) errors.push("Ce délai indique plusieurs jours. Activez Précommande.");
    if (intValue("prixExp") > 2000) warnings.push(`Prix d'expédition élevé: ${intValue("prixExp")} FCFA.`);
    if (intValue("prixLiv") > 2000) warnings.push(`Prix de livraison élevé: ${intValue("prixLiv")} FCFA.`);
    if (intValue("prix") >= 25000 && intValue("prixExp") <= 1000) {
        warnings.push("Article cher avec expédition basse. Vérifiez que le transport couvre le risque.");
    }
    if (checked("precommande")) warnings.push(`Précommande active avec délai ${value("delai")}.`);
    if (blocking && errors.length) showToast(errors[0], true);
    return { errors, warnings };
}

function daysFromDelay(delay) {
    const normalized = delay.toLowerCase().trim();
    if (normalized.includes("48h")) return 2;
    if (normalized.includes("24h")) return 1;
    const number = Number.parseInt((normalized.match(/\d+/) || ["1"])[0], 10);
    if (normalized.includes("mois")) return number * 30;
    if (normalized.includes("semaine")) return number * 7;
    if (normalized.includes("jour")) return number;
    return 0;
}

$("#article-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const validation = validate(true);
    if (validation.errors.length || state.isPublishing) return;
    await publishArticle(event.submitter);
});

async function publishArticle(button) {
    state.isPublishing = true;
    document.body.classList.add("busy");
    setButtonLoading(button, true);
    setVariantJsonStatus("");
    try {
        setPublishStatus("Vérification de la boutique...");
        const vendor = await getVendorData();
        const imageUrls = [];
        for (const image of state.images) {
            setPublishStatus(`Upload image ${imageUrls.length + 1}/${state.images.length}...`);
            imageUrls.push(await uploadImage(image.file, "article_images", 0.78));
        }
        setPublishStatus("Préparation des variantes...");
        const variants = await buildVariants();
        setPublishStatus("Création de l'article dans Firestore...");
        const articleIds = await writeArticleDocuments(imageUrls, vendor, variants);
        await adjustTotalArticlesBestEffort(articleIds.length);
        resetAfterPublish();
        showToast(articleIds.length > 1 ? "Articles gros et détail publiés." : "Article publié avec succès.");
    } catch (error) {
        console.error(error);
        const friendly = friendlyFirebaseError(error);
        setPublishStatus(friendly, true);
        showToast(friendly, true);
    } finally {
        state.isPublishing = false;
        document.body.classList.remove("busy");
        setButtonLoading(button, false);
    }
}

function setPublishStatus(message, isError = false) {
    state.publishStep = message;
    const status = $("#variant-json-status");
    if (!status) return;
    status.className = `helper-text ${isError ? "error" : ""}`;
    status.textContent = message;
}

function setVariantJsonStatus(message, kind = "") {
    const status = $("#variant-json-status");
    if (!status) return;
    status.className = `helper-text ${kind}`;
    status.textContent = message;
}

function friendlyFirebaseError(error) {
    const code = error?.code || "";
    const message = error?.message || "Publication impossible.";
    if (code.includes("permission-denied") || /permission/i.test(message)) {
        return `Permissions refusées par Firebase pendant: ${state.publishStep || "étape inconnue"}.`;
    }
    return message;
}

async function getVendorData() {
    const vendorName = value("vendeur");
    if (state.boutiques.has(vendorName)) return state.boutiques.get(vendorName);
    const snapshot = await db.collection("Fournisseurs").where("nom", "==", vendorName).limit(1).get();
    if (snapshot.empty) throw new Error(`Vendeur '${vendorName}' introuvable.`);
    return snapshot.docs[0].data();
}

async function uploadImage(file, folder, quality) {
    const image = await compressImage(file, {
        initialQuality: quality,
        targetBytes: folder.includes("variants") ? 70 * 1024 : 100 * 1024,
        maxSide: folder.includes("variants") ? 1200 : 1600,
        minQuality: folder.includes("variants") ? 0.5 : 0.55
    });
    const ref = storage.ref().child(`${folder}/${uuid()}.${image.extension}`);
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
        image.onload = () => {
            compressImageAdaptive(image, { initialQuality, targetBytes, maxSide, minQuality })
                .then(resolve)
                .catch(reject)
                .finally(() => URL.revokeObjectURL(image.src));
        };
        image.onerror = () => reject(new Error("Image invalide."));
        image.src = URL.createObjectURL(file);
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
    return new Promise((resolve) => {
        canvas.toBlob(resolve, type, quality);
    });
}

async function buildVariants() {
    const variants = [];
    if (state.selectedSizes.size) {
        variants.push({
            nom: "taille",
            mustBeSelected: true,
            options: Array.from(state.selectedSizes).map((valeur) => ({ valeur, prixSupplementaire: 0, imageUrl: "" }))
        });
    }
    if (state.selectedColors.size) {
        variants.push({
            nom: "couleur",
            mustBeSelected: true,
            options: Array.from(state.selectedColors).map((valeur) => ({
                valeur,
                prixSupplementaire: 0,
                imageUrl: "",
                couleurHexa: colors.find(([name]) => name === valeur)?.[1] || null
            }))
        });
    }

    for (const card of $$(".variant-card")) {
        const nom = $(".variant-name", card).value.trim();
        if (!nom) continue;
        const options = [];
        for (const row of $$(".option-row", card)) {
            const valeur = $(".option-value", row).value.trim();
            if (!valeur) continue;
            const file = $(".option-file", row).files[0];
            options.push({
                valeur,
                prixSupplementaire: Number.parseInt($(".option-price", row).value, 10) || 0,
                imageUrl: file ? await uploadImage(file, "images/variants", 0.65) : (row.dataset.imageUrl || ""),
                couleurHexa: normalizeHex($(".option-color", row).value.trim()),
                stability: Number.parseInt(row.dataset.stability, 10) || 0
            });
        }
        variants.push({
            nom,
            mustBeSelected: $(".variant-required", card).checked,
            options
        });
    }
    return variants;
}

function normalizeHex(input) {
    if (!input) return null;
    const value = input.startsWith("#") ? input.slice(1) : input;
    if (!/^[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(value)) return null;
    return `#${value.toUpperCase()}`;
}

async function writeArticleDocuments(imageUrls, vendor, variants) {
    const batch = db.batch();
    const shouldDualPublish = checked("venteParQuantiteSpecifique") && checked("venteIndividuelleAutorisee");
    const ids = shouldDualPublish ? [uuid(), uuid()] : [uuid()];
    const codeLiaison = shouldDualPublish ? `LINK_${Math.floor(Date.now() / 1000)}_${Math.floor(1000 + Math.random() * 9000)}` : null;

    if (shouldDualPublish) {
        batch.set(db.collection("Articles").doc(ids[0]), buildArticlePayload({
            id: ids[0],
            typeVente: "gros",
            mainImage: imageUrls[0],
            images: imageUrls,
            vendor,
            variants,
            codeLiaison,
            articleLieId: ids[1]
        }));
        batch.set(db.collection("Articles").doc(ids[1]), buildArticlePayload({
            id: ids[1],
            typeVente: "detail",
            mainImage: imageUrls[0],
            images: imageUrls,
            vendor,
            variants,
            codeLiaison,
            articleLieId: ids[0]
        }));
    } else {
        batch.set(db.collection("Articles").doc(ids[0]), buildArticlePayload({
            id: ids[0],
            typeVente: checked("venteParQuantiteSpecifique") ? "gros" : "normal",
            mainImage: imageUrls[0],
            images: imageUrls,
            vendor,
            variants,
            codeLiaison: null,
            articleLieId: null
        }));
    }
    await batch.commit();
    return ids;
}

function buildArticlePayload({ id, typeVente, mainImage, images, vendor, variants, codeLiaison, articleLieId }) {
    const isGros = typeVente === "gros";
    const isDetail = typeVente === "detail";
    const restriction = value("restrictionAge") || "AUCUNE";
    const quantiteParUnite = intValue("quantiteParUnite", 1);
    const basePrice = intValue("prix");
    const finalPrice = isGros ? intValue("prixUniteVente") : basePrice;
    const stock = intValue("stock");
    const hashtags = buildNormalizedHashtags();

    return {
        articleId: id,
        nom: value("nom") + (isGros ? ` (${unitLabel(value("uniteVente"))})` : ""),
        nomCollection: value("categorie"),
        prix: finalPrice,
        prixAchat: isGros ? intValue("prixAchatUniteVente") : intValue("prixAchat"),
        mainImage,
        productImages: images,
        desc: value("details"),
        vendeur: value("vendeur"),
        logoBoutique: vendor.logoBoutique || "",
        keywords: generateKeywords(value("nom"), value("categorie"), value("vendeur")),
        hashtags,
        date: formatDate(new Date()),
        typeVente,
        codeLiaison,
        articleLieId,
        poidsColis: value("poids"),
        delaiLivraison: value("delai"),
        precommande: checked("precommande") ? "true" : "false",
        typePrecommande: checked("precommande") ? value("typePrecommande") : "locale",
        tranchable: checked("tranchable") ? "true" : "false",
        peutEtreExpedier: checked("expediable"),
        isDerniereMinute: checked("isDerniereMinute"),
        paiementProgressifEnabled: checked("progressif"),
        paiementProgressifFrequence: value("freqProgressif"),
        paiementProgressifDuree: value("dureeProgressif"),
        cash: value("cash"),
        venteParQuantiteSpecifique: isDetail ? false : checked("venteParQuantiteSpecifique"),
        uniteVente: isGros ? value("uniteVente") : isDetail ? "PIECE" : null,
        quantiteParUnite: isDetail ? 1 : quantiteParUnite,
        venteIndividuelleAutorisee: isGros ? false : checked("venteIndividuelleAutorisee"),
        prixUniteVente: isGros ? intValue("prixUniteVente") : finalPrice,
        prixAchatUniteVente: isGros ? intValue("prixAchatUniteVente") : 0,
        prixPieceIndividuelle: isGros ? intValue("prixPieceIndividuelle") : finalPrice,
        quantiteMinimumCommande: isDetail ? 1 : intValue("quantiteMinimumCommande", 1),
        incrementQuantite: isDetail ? 1 : intValue("incrementQuantite", 1),
        affichagePrixUnitaire: checked("affichagePrixUnitaire"),
        libellePrixUnitaire: isDetail ? "Prix à l'unité" : value("libellePrixUnitaire"),
        informationsQuantite: value("informationsQuantite"),
        reductionQuantite: isDetail ? false : checked("reductionQuantite"),
        prixLivraison: intValue("prixLiv"),
        fraisTransportPourLivrerALaGare: intValue("fraisTransportGare"),
        prixExpedition: intValue("prixExp"),
        prixNonReduit: intValue("prixNonReduit"),
        quantiteLimite: Math.max(1, intValue("qtLimit", 1)),
        quantiteLimiteExpedition: Math.max(1, intValue("qtLimitExp", 1)),
        quantiteLimiteExpeditionUniteDeVente: intValue("quantiteLimiteExpeditionUniteDeVente", 5),
        quantiteLimiteLivraisonUniteDeVente: intValue("quantiteLimiteLivraisonUniteDeVente", 5),
        prixExpeditionUniteDeVente: intValue("prixExpeditionUniteDeVente", 750),
        prixLivraisonUniteDeVente: intValue("prixLivraisonUniteDeVente", 750),
        variants,
        specification: value("specification"),
        lienVideo: value("lien"),
        reductions: parseReductions(value("reductions")),
        restrictionAge: restriction,
        categorieRestreinte: restrictedCategory(restriction),
        requiresAgeVerification: restriction !== "AUCUNE",
        ageMinimum: ageMinimum(restriction),
        stock: isDetail && quantiteParUnite > 0 ? stock * quantiteParUnite : stock,
        randomInt: randomInt(),
        randomInt1: Math.floor(Date.now() / 1000),
        randomInt2: -randomInt(),
        randomInt3: stringHash(value("nom")) + randomInt(),
        randomInt4: randomInt(),
        bookmarkedBy: [],
        estPlaceholder: false
    };
}

function unitLabel(raw) {
    return units.find(([value]) => value === raw)?.[1] || "Unité";
}

function buildNormalizedHashtags() {
    const vendor = normalizeTag(value("vendeur"));
    const seen = new Set();
    const list = [];
    [...state.hashtags, vendor].forEach((tag) => {
        const normalized = normalizeTag(tag);
        if (normalized && !seen.has(normalized)) {
            seen.add(normalized);
            list.push(normalized);
        }
    });
    return list;
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
            for (let i = 3; i <= Math.min(word.length, 20); i += 1) {
                keywords.add(word.slice(0, i));
            }
        }
    });
    return Array.from(keywords).slice(0, 500);
}

function parseReductions(text) {
    if (!text) return [];
    return text.split(",").map((pair) => {
        const [condition, price] = pair.trim().split(/\s+to\s+/i);
        return condition && Number.parseInt(price, 10)
            ? { condition, prix: Number.parseInt(price, 10) }
            : null;
    }).filter(Boolean);
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

function formatDate(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function randomInt() {
    return Math.floor(Math.random() * 1000000);
}

function stringHash(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

async function adjustTotalArticlesBestEffort(delta) {
    const ref = db.collection("Config").doc("Stats");
    try {
        await ref.set({
            totalArticles: firebase.firestore.FieldValue.increment(delta),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (error) {
        console.warn("Stats update skipped:", error);
    }
}

function resetAfterPublish() {
    clearImagesAndVariants();
    updateAll();
}

function clearImagesAndVariants() {
    state.images.forEach((image) => URL.revokeObjectURL(image.url));
    state.images = [];
    state.selectedSizes.clear();
    state.selectedColors.clear();
    $("#variant-list").innerHTML = "";
    renderImages();
    renderSelectableChips("size-chips", getCurrentSizePreset(), state.selectedSizes);
    renderSelectableChips("color-chips", colors.map(([name]) => name), state.selectedColors, true);
}

function resetFormCompletely() {
    $("#article-form").reset();
    state.hashtags = [];
    state.templateArticles = [];
    $("#article-template-search").value = "";
    $("#article-template-results").innerHTML = "";
    $("#variant-json-status").textContent = "";
    clearImagesAndVariants();
    renderHashtags();
    renderHashtagLibrary();
    updateAll();
}

function updateActiveNav() {
    const sections = $$(".panel");
    const active = sections.findLast ? sections.findLast((section) => section.getBoundingClientRect().top < 160) : sections[0];
    if (!active) return;
    $$(".nav-item").forEach((item) => item.classList.toggle("active", item.getAttribute("href") === `#${active.id}`));
}

window.addEventListener("scroll", updateActiveNav, { passive: true });
setupStaticControls();
scanInputs();
addVariantCard();
updateAll();
