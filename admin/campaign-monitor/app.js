const auth = firebase.auth();
const db = firebase.firestore();

const state = {
    clicks: [],
    filtered: [],
    user: null,
    isLoading: false
};

const $ = (selector, root = document) => root.querySelector(selector);

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
        await refreshClicks();
    } catch (error) {
        showLoginError(error.message);
    }
});

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
$("#refresh-button").addEventListener("click", refreshClicks);
$("#period-select").addEventListener("change", refreshClicks);
$("#segment-select").addEventListener("change", applyFilters);
$("#search-input").addEventListener("input", debounce(applyFilters, 180));

function value(id) {
    return $(`#${id}`).value.trim();
}

function showLoginError(message) {
    const error = $("#login-error");
    error.textContent = message;
    error.hidden = !message;
}

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

async function refreshClicks() {
    if (state.isLoading) return;
    state.isLoading = true;
    setButtonLoading($("#refresh-button"), true);
    $("#status-text").textContent = "Chargement...";

    try {
        const periodDays = Number.parseInt(value("period-select"), 10) || 7;
        const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
        const snapshot = await db.collection("campaign_clicks")
            .where("createdAt", ">=", firebase.firestore.Timestamp.fromDate(since))
            .orderBy("createdAt", "desc")
            .limit(800)
            .get();

        state.clicks = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        applyFilters();
    } catch (error) {
        console.error(error);
        showToast(friendlyFirebaseError(error), true);
        $("#status-text").textContent = friendlyFirebaseError(error);
    } finally {
        state.isLoading = false;
        setButtonLoading($("#refresh-button"), false);
    }
}

function applyFilters() {
    const segment = value("segment-select");
    const query = normalize(value("search-input"));
    state.filtered = state.clicks.filter((click) => {
        if (segment !== "ALL" && click.segment !== segment) return false;
        if (!query) return true;
        return normalize([
            click.contactId,
            click.segment,
            click.location,
            click.target,
            click.platform,
            click.code,
            click.path
        ].join(" ")).includes(query);
    });
    render();
}

function render() {
    renderMetrics();
    renderBreakdowns();
    renderTable();
    $("#status-text").textContent = `${state.filtered.length} clic${state.filtered.length > 1 ? "s" : ""} affiché${state.filtered.length > 1 ? "s" : ""}.`;
}

function renderMetrics() {
    const uniqueContacts = new Set(state.filtered.map((click) => click.contactId).filter(Boolean));
    const appOpenAttempts = state.filtered.filter((click) => String(click.target || "").includes("app") || String(click.target || "").includes("auto")).length;
    const storeClicks = state.filtered.filter((click) => ["ios", "android"].includes(click.target)).length;
    const codeClicks = state.filtered.filter((click) => click.code).length;

    $("#metrics-grid").innerHTML = [
        metricCard("Clics", state.filtered.length),
        metricCard("Contacts uniques", uniqueContacts.size),
        metricCard("Ouvertures app/store", appOpenAttempts + storeClicks),
        metricCard("Avec code", codeClicks)
    ].join("");
}

function renderBreakdowns() {
    $("#breakdown-list").innerHTML = [
        ...breakdownRows("Segments", countBy(state.filtered, "segment")),
        ...breakdownRows("Plateformes", countBy(state.filtered, "platform"))
    ].join("") || `<div class="empty-state">Aucun clic</div>`;

    $("#target-list").innerHTML = breakdownRows("Cibles", countBy(state.filtered, "target")).join("")
        || `<div class="empty-state">Aucune cible</div>`;
}

function renderTable() {
    const rows = state.filtered.slice(0, 160).map((click) => `
        <tr>
            <td>${escapeHtml(formatDate(click.createdAt))}</td>
            <td>${escapeHtml(click.contactId || "unknown")}</td>
            <td><span class="segment-pill">${escapeHtml(click.segment || "UNKNOWN")}</span></td>
            <td>${escapeHtml(click.location || "-")}</td>
            <td><span class="platform-pill">${escapeHtml(click.platform || "web")}</span></td>
            <td>${escapeHtml(click.target || "-")}</td>
            <td>${escapeHtml(click.code || "-")}</td>
        </tr>
    `);
    $("#clicks-body").innerHTML = rows.join("") || `
        <tr><td colspan="7">Aucun clic pour ces filtres.</td></tr>
    `;
}

function metricCard(title, value) {
    return `
        <article class="metric-card">
            <span>${escapeHtml(title)}</span>
            <strong>${escapeHtml(String(value))}</strong>
        </article>
    `;
}

function breakdownRows(label, counts) {
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => `
            <div class="breakdown-row">
                <span>
                    ${escapeHtml(name || "UNKNOWN")}
                    <small>${escapeHtml(label)}</small>
                </span>
                <strong>${count}</strong>
            </div>
        `);
}

function countBy(rows, key) {
    return rows.reduce((acc, row) => {
        const value = row[key] || "UNKNOWN";
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {});
}

function formatDate(value) {
    const date = value && typeof value.toDate === "function" ? value.toDate() : null;
    if (!date) return "-";
    return new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

function friendlyFirebaseError(error) {
    if (error.code === "permission-denied") return "Accès refusé par Firestore.";
    if (error.code === "failed-precondition") return "Index Firestore manquant pour cette lecture.";
    return error.message || "Erreur Firebase.";
}

function normalize(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}
