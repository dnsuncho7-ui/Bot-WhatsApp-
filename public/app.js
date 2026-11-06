
const authScreen = document.getElementById("authScreen");
const dashboard = document.getElementById("appDashboard");
const modal = document.getElementById("serverModal");
const serverForm = document.getElementById("serverForm");
const serverContainer = document.getElementById("serverContainer");

let currentUser = null;

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
        avatar.textContent =
            user.name?.charAt(0).toUpperCase() || "U";
        avatar.title = user.name || "User";
    }

    renderServers();
}

function getStorageKey() {
    if (!currentUser) {
        return null;
    }

    return `elitehostx_servers_${currentUser.id}`;
}


/*
|--------------------------------------------------------------------------
| AUTHENTICATION
|--------------------------------------------------------------------------
*/

document.getElementById("googleLogin").addEventListener("click", () => {
    window.location.assign("/auth/google");
});

document.getElementById("discordLogin").addEventListener("click", () => {
    window.location.assign("/auth/discord");
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

    } catch (error) {
        console.error("Logout error:", error);
        alert("No se pudo cerrar la sesión. Inténtalo de nuevo.");
    }
});


async function checkSession() {
    try {
        const response = await fetch("/api/me", {
            method: "GET",
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

        if (!data.authenticated || !data.user) {
            showLogin();
            return;
        }

        showDashboard(data.user);

    } catch (error) {
        console.error("Session check error:", error);
        showLogin();
    }
}


/*
|--------------------------------------------------------------------------
| AUTHENTICATION MESSAGES
|--------------------------------------------------------------------------
*/

function checkAuthMessages() {
    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get("auth");

    if (authStatus === "failed") {
        alert("No se pudo iniciar sesión. Inténtalo nuevamente.");
    }

    if (authStatus === "unavailable") {
        alert(
            "El inicio de sesión todavía no está configurado. " +
            "Estamos preparando EliteHostX."
        );
    }

    if (authStatus) {
        window.history.replaceState(
            {},
            document.title,
            window.location.pathname
        );
    }
}


/*
|--------------------------------------------------------------------------
| SERVER MODAL
|--------------------------------------------------------------------------
*/

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

const createButtons = [
    document.getElementById("createButton"),
    document.getElementById("emptyCreate"),
    document.getElementById("heroCreate"),
    document.getElementById("sidebarCreate")
];

createButtons.forEach(button => {
    if (button) {
        button.addEventListener("click", openModal);
    }
});

document.getElementById("closeModal")
    .addEventListener("click", closeModal);

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


/*
|--------------------------------------------------------------------------
| LOCAL DEMO SERVER CONFIGURATIONS
|--------------------------------------------------------------------------
|
| Estas configuraciones todavía no crean servidores Minecraft reales.
| Se guardan localmente y se separan por ID de usuario.
|
*/

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

    if (!key) {
        return;
    }

    localStorage.setItem(key, JSON.stringify(servers));
}


/*
|--------------------------------------------------------------------------
| CREATE SERVER CONFIGURATION
|--------------------------------------------------------------------------
*/

serverForm.addEventListener("submit", event => {
    event.preventDefault();

    if (!currentUser) {
        showLogin();
        return;
    }

    const name = document.getElementById("serverName").value.trim();
    const software = document.getElementById("serverSoftware").value;
    const version = document.getElementById("serverVersion").value;
    const ram = Number(document.getElementById("serverRam").value);

    if (!name) {
        alert("Please enter a server name.");
        return;
    }

    if (!Number.isFinite(ram) || ram <= 0) {
        alert("Invalid RAM allocation.");
        return;
    }

    const server = {
        id: crypto.randomUUID(),
        name,
        software,
        version,
        ram,
        createdAt: new Date().toISOString()
    };

    const servers = getServers();

    servers.push(server);
    saveServers(servers);

    renderServers();
    closeModal();
    serverForm.reset();
});


/*
|--------------------------------------------------------------------------
| RENDER SERVERS
|--------------------------------------------------------------------------
*/

function renderServers() {
    if (!currentUser) {
        return;
    }

    const servers = getServers();

    serverContainer.innerHTML = "";

    document.getElementById("totalServers").textContent =
        servers.length;

    // Todavía no hay instancias reales conectadas.
    document.getElementById("activeServers").textContent = "0";

    const totalRam = servers.reduce(
        (total, server) => total + Number(server.ram || 0),
        0
    );

    document.getElementById("totalRam").textContent =
        `${totalRam} GB`;

    if (servers.length === 0) {
        serverContainer.innerHTML = `
            <div class="empty-icon">▣</div>
            <h2>No servers yet</h2>
            <p>
                You haven't created any Minecraft servers.
                Start by creating your first one.
            </p>
            <button class="primary-button" id="emptyCreate">
                CREATE MY FIRST SERVER
            </button>
        `;

        document.getElementById("emptyCreate")
            .addEventListener("click", openModal);

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


/*
|--------------------------------------------------------------------------
| API STATUS
|--------------------------------------------------------------------------
*/

async function loadStatus() {
    try {
        const response = await fetch("/api/status", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("API returned " + response.status);
        }

        const data = await response.json();

        console.log("Connected to " + data.name);
        console.log("Status: " + data.status);

    } catch (error) {
        console.error("Connection error:", error);
    }
}


/*
|--------------------------------------------------------------------------
| INITIALIZATION
|--------------------------------------------------------------------------
*/

checkAuthMessages();
showLogin();
loadStatus();
checkSession();
