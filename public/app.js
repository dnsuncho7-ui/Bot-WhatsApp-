
const authScreen = document.getElementById("authScreen");
const dashboard = document.getElementById("appDashboard");
const modal = document.getElementById("serverModal");
const serverForm = document.getElementById("serverForm");
const serverContainer = document.getElementById("serverContainer");

let currentUser = null;

const HOSTING_PLANS = [
    { id: "corona", name: "CORONA", ram: 8, cpu: 4, disk: 80, color: "#e7bd45", glow: "#e7bd45", gem: "crown" },
    { id: "esmeralda", name: "ESMERALDA", ram: 12, cpu: 6, disk: 120, color: "#35d39a", glow: "#20b879", gem: "emerald" },
    { id: "diamante", name: "DIAMANTE", ram: 16, cpu: 8, disk: 160, color: "#65d5ff", glow: "#55c9f2", gem: "diamond" },
    { id: "netherite", name: "NETHERITE", ram: 24, cpu: 10, disk: 240, color: "#c4c8d2", glow: "#8b929f", gem: "netherite" },
    { id: "rubi", name: "RUBÍ", ram: 32, cpu: 12, disk: 320, color: "#ff718b", glow: "#e85d75", gem: "ruby" },
    { id: "amatista", name: "AMATISTA", ram: 48, cpu: 16, disk: 480, color: "#c49aff", glow: "#a879ed", gem: "amethyst" }
];

function planImage(plan) {
    const palettes = {
        crown: ["#fff2a8", "#d49a19", "#8a5a08"],
        emerald: ["#a8ffd9", "#18b879", "#07583f"],
        diamond: ["#e4fbff", "#55c9f2", "#2473b5"],
        netherite: ["#e2e5eb", "#777f8e", "#343b49"],
        ruby: ["#ffc0ca", "#e33d61", "#82152f"],
        amethyst: ["#f0d9ff", "#a879ed", "#56318f"]
    };

    const [light, mid, dark] = palettes[plan.gem];

    const art = plan.gem === "crown"
        ? `<path d="M18 35 8 13l20 13 12-20 12 20 20-13-10 22-44 0Z" fill="url(#g)" stroke="${light}" stroke-width="2"/><path d="M20 42h40l-4 12H24Z" fill="${dark}"/><circle cx="40" cy="12" r="4" fill="${light}"/>`
        : plan.gem === "netherite"
        ? `<path d="M40 5 67 20 62 53 40 70 18 53 13 20Z" fill="url(#g)" stroke="${light}" stroke-width="2"/><path d="m40 5 0 65M13 20l49 33M67 20 18 53" stroke="${light}" stroke-opacity=".55" stroke-width="2"/>`
        : `<path d="M40 5 65 25 55 58 40 70 25 58 15 25Z" fill="url(#g)" stroke="${light}" stroke-width="2"/><path d="M40 5 40 70M15 25h50M25 58l15-33 15 33" fill="none" stroke="${light}" stroke-opacity=".65" stroke-width="2"/>`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${light}"/><stop offset=".48" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><ellipse cx="40" cy="72" rx="24" ry="5" fill="#000" opacity=".25"/>${art}</svg>`;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function renderPlans() {
    const grid = document.getElementById("plansGrid");
    const choices = document.getElementById("planChoice");

    if (grid) {
        grid.innerHTML = HOSTING_PLANS.map(plan => `
            <article class="plan-card" style="--plan-color:${plan.color};--plan-glow:${plan.glow}">
                <div class="plan-art">
                    <img src="${planImage(plan)}" alt="Imagen del material ${plan.name}" loading="lazy">
                </div>
                <span class="plan-label">ELITEHOSTX PLAN</span>
                <h3>${plan.name}</h3>
                <p class="plan-ram">${plan.ram} GB RAM</p>
                <div class="plan-specs">
                    <span>⚡ ${plan.cpu} CPU</span>
                    <span>▣ ${plan.disk} GB SSD</span>
                </div>
            </article>
        `).join("");
    }

    if (choices) {
        choices.innerHTML = HOSTING_PLANS.map((plan, index) => `
            <label class="plan-option">
                <input type="radio" name="hostingPlan" value="${plan.id}" ${index === 0 ? "checked" : ""} required>
                <img src="${planImage(plan)}" alt="${plan.name}">
                <strong>${plan.name}</strong>
                <small>${plan.ram} GB RAM · ${plan.cpu} CPU</small>
            </label>
        `).join("");
    }
}

function showMessage(message, type = "error") {
    const box = document.getElementById("authMessage");
    if (!box) {
        alert(message);
        return;
    }

    box.textContent = message;
    box.className = `auth-message ${type}`;
    box.classList.remove("hidden");
}

function clearMessage() {
    const box = document.getElementById("authMessage");

    if (box) {
        box.textContent = "";
        box.className = "auth-message hidden";
    }
}

function showLogin() {
    currentUser = null;
    dashboard.classList.add("hidden");
    authScreen.classList.remove("hidden");
}

function showDashboard(user) {
    currentUser = user;
    authScreen.classList.add("hidden");
    dashboard.classList.remove("hidden");

    const avatar = document.getElementById("profileAvatar");

    if (avatar) {
        avatar.textContent = user.name?.charAt(0).toUpperCase() || "U";
        avatar.title = user.name || "User";
    }

    const accountName = document.getElementById("accountName");

    if (accountName) {
        accountName.textContent = user.name || user.email || "Usuario";
    }

    renderPlans();
    renderServers();
}

function getStorageKey() {
    return currentUser ? `elitehostx_servers_${currentUser.id}` : null;
}

function setAuthMode(mode) {
    clearMessage();

    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const loginTab = document.getElementById("loginTab");
    const registerTab = document.getElementById("registerTab");

    const isRegister = mode === "register";

    loginForm.classList.toggle("hidden", isRegister);
    registerForm.classList.toggle("hidden", !isRegister);
    loginTab.classList.toggle("active", !isRegister);
    registerTab.classList.toggle("active", isRegister);
}

document.getElementById("loginTab").addEventListener("click", () => setAuthMode("login"));
document.getElementById("registerTab").addEventListener("click", () => setAuthMode("register"));

document.getElementById("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    clearMessage();

    const button = document.getElementById("loginSubmit");
    button.disabled = true;
    button.textContent = "INICIANDO SESIÓN...";

    try {
        const response = await fetch("/api/login", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                email: document.getElementById("loginEmail").value,
                password: document.getElementById("loginPassword").value
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "No se pudo iniciar sesión.");
        }

        showDashboard(data.user);
    } catch (error) {
        showMessage(error.message);
    } finally {
        button.disabled = false;
        button.textContent = "SIGN IN";
    }
});

document.getElementById("registerForm").addEventListener("submit", async event => {
    event.preventDefault();
    clearMessage();

    const password = document.getElementById("registerPassword").value;
    const confirmation = document.getElementById("registerPasswordConfirm").value;

    if (password !== confirmation) {
        showMessage("Las contraseñas no coinciden.");
        return;
    }

    const button = document.getElementById("registerSubmit");
    button.disabled = true;
    button.textContent = "CREANDO CUENTA...";

    try {
        const response = await fetch("/api/register", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                name: document.getElementById("registerName").value,
                email: document.getElementById("registerEmail").value,
                password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "No se pudo crear la cuenta.");
        }

        showDashboard(data.user);
    } catch (error) {
        showMessage(error.message);
    } finally {
        button.disabled = false;
        button.textContent = "CREATE ACCOUNT";
    }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
    try {
        const response = await fetch("/api/logout", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({})
        });

        if (!response.ok) {
            throw new Error("No se pudo cerrar la sesión.");
        }

        closeModal();
        showLogin();
        setAuthMode("login");
    } catch (error) {
        console.error("Logout error:", error);
        alert(error.message || "No se pudo cerrar la sesión.");
    }
});

async function checkSession() {
    try {
        const response = await fetch("/api/me", {
            credentials: "same-origin",
            headers: {
                "Accept": "application/json"
            },
            cache: "no-store"
        });

        if (!response.ok) {
            showLogin();
            return;
        }

        const data = await response.json();

        if (data.authenticated && data.user) {
            showDashboard(data.user);
        } else {
            showLogin();
        }
    } catch (error) {
        console.error("Session check error:", error);
        showLogin();
    }
}

function checkAuthMessages() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("auth");

    if (status === "failed") {
        showMessage("No se pudo iniciar sesión con el proveedor.");
    }

    if (status === "unavailable") {
        showMessage("Ese método de acceso todavía no está configurado.");
    }

    if (status) {
        history.replaceState({}, document.title, location.pathname);
    }
}

function openModal(event) {
    if (event) {
        event.preventDefault();
    }

    if (!currentUser) {
        showLogin();
        return;
    }

    modal.classList.remove("hidden");
}

function closeModal() {
    modal.classList.add("hidden");
}

[
    document.getElementById("createButton"),
    document.getElementById("emptyCreate"),
    document.getElementById("heroCreate"),
    document.getElementById("sidebarCreate")
].forEach(button => {
    if (button) {
        button.addEventListener("click", openModal);
    }
});

document.getElementById("closeModal").addEventListener("click", closeModal);

modal.addEventListener("click", event => {
    if (event.target === modal) {
        closeModal();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeModal();
    }
});

function getServers() {
    const key = getStorageKey();

    if (!key) {
        return [];
    }

    try {
        return JSON.parse(localStorage.getItem(key) || "[]");
    } catch (error) {
        console.error("Error reading servers:", error);
        return [];
    }
}

function saveServers(servers) {
    const key = getStorageKey();

    if (key) {
        localStorage.setItem(key, JSON.stringify(servers));
    }
}

serverForm.addEventListener("submit", event => {
    event.preventDefault();

    if (!currentUser) {
        return showLogin();
    }

    const name = document.getElementById("serverName").value.trim();
    const software = document.getElementById("serverSoftware").value;
    const version = document.getElementById("serverVersion").value;

    const selectedPlanId = document.querySelector(
        'input[name="hostingPlan"]:checked'
    )?.value;

    const selectedPlan = HOSTING_PLANS.find(
        plan => plan.id === selectedPlanId
    );

    if (!name || !selectedPlan) {
        alert("Selecciona un plan y escribe el nombre del servidor.");
        return;
    }

    const servers = getServers();

    servers.push({
        id: crypto.randomUUID(),
        name,
        software,
        version,
        planId: selectedPlan.id,
        planName: selectedPlan.name,
        ram: selectedPlan.ram,
        cpu: selectedPlan.cpu,
        disk: selectedPlan.disk,
        createdAt: new Date().toISOString()
    });

    saveServers(servers);
    renderServers();
    closeModal();
    serverForm.reset();
});

function renderServers() {
    if (!currentUser) {
        return;
    }

    const servers = getServers();
    serverContainer.innerHTML = "";

    document.getElementById("totalServers").textContent = servers.length;
    document.getElementById("activeServers").textContent = "0";

    const totalRam = servers.reduce(
        (total, server) => total + Number(server.ram || 0),
        0
    );

    document.getElementById("totalRam").textContent = `${totalRam} GB`;

    if (servers.length === 0) {
        serverContainer.innerHTML = `
            <div class="empty-icon">▣</div>
            <h2>No servers yet</h2>
            <p>You haven't created any Minecraft servers. Start by creating your first one.</p>
            <button class="primary-button" id="emptyCreate">CREATE MY FIRST SERVER</button>
        `;

        document.getElementById("emptyCreate").addEventListener(
            "click",
            openModal
        );

        return;
    }

    servers.forEach(server => {
        const card = document.createElement("div");
        card.className = "server-card";

        const info = document.createElement("div");

        const title = document.createElement("strong");
        title.textContent = server.name;

        const details = document.createElement("p");
        details.textContent =
            `${server.software} · Minecraft ${server.version} · ` +
            `${server.planName || "PLAN"} · ${server.ram} GB RAM · ` +
            `${server.cpu || "—"} CPU · ${server.disk || "—"} GB SSD`;

        const status = document.createElement("span");
        status.className = "server-status";
        status.textContent = "● CONFIGURED";

        info.append(title, details);
        card.append(info, status);

        serverContainer.appendChild(card);
    });
}

async function loadStatus() {
    try {
        const response = await fetch("/api/status", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`API ${response.status}`);
        }

        const data = await response.json();

        console.log("EliteHostX:", data);

        if (data.registration !== "enabled") {
            showMessage(
                "El servicio de cuentas todavía no está disponible. Inténtalo más tarde."
            );
        }
    } catch (error) {
        console.error("Connection error:", error);
    }
}

renderPlans();
checkAuthMessages();
showLogin();
loadStatus();
checkSession();
