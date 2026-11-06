const authScreen = document.getElementById("authScreen");
const dashboard = document.getElementById("appDashboard");
const modal = document.getElementById("serverModal");
const serverForm = document.getElementById("serverForm");
const serverContainer = document.getElementById("serverContainer");

let currentUser = null;

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

document.getElementById("loginTab").addEventListener("click", () => {
    setAuthMode("login");
});

document.getElementById("registerTab").addEventListener("click", () => {
    setAuthMode("register");
});

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
    if (event) event.preventDefault();

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

    if (!key) return [];

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
    const ram = Number(document.getElementById("serverRam").value);

    if (!name || !Number.isFinite(ram) || ram <= 0) {
        alert("Revisa el nombre y la memoria seleccionada.");
        return;
    }

    const servers = getServers();

    servers.push({
        id: crypto.randomUUID(),
        name,
        software,
        version,
        ram,
        createdAt: new Date().toISOString()
    });

    saveServers(servers);
    renderServers();
    closeModal();
    serverForm.reset();
});

function renderServers() {
    if (!currentUser) return;

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
            <button class="primary-button" id="emptyCreate">
                CREATE MY FIRST SERVER
            </button>
        `;

        document.getElementById("emptyCreate").addEventListener("click", openModal);
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
            `${server.software} · Minecraft ${server.version} · ${server.ram} GB RAM`;

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

checkAuthMessages();
showLogin();
loadStatus();
checkSession();