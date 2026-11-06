
const authScreen = document.getElementById("authScreen");
const dashboard = document.getElementById("appDashboard");

const modal = document.getElementById("serverModal");
const serverForm = document.getElementById("serverForm");
const serverContainer = document.getElementById("serverContainer");

const createButtons = [
    document.getElementById("createButton"),
    document.getElementById("emptyCreate"),
    document.getElementById("heroCreate"),
    document.getElementById("sidebarCreate")
];

/*
 * AUTHENTICATION
 *
 * Esta versión solo prepara la interfaz.
 * Google y Discord se conectarán mediante OAuth
 * desde el backend en el siguiente paso.
 */

function showDashboard(user = null) {
    authScreen.classList.add("hidden");
    dashboard.classList.remove("hidden");

    if (user) {
        const avatar = document.getElementById("profileAvatar");

        if (avatar && user.name) {
            avatar.textContent = user.name.charAt(0).toUpperCase();
        }
    }
}

function showLogin() {
    dashboard.classList.add("hidden");
    authScreen.classList.remove("hidden");
}

document.getElementById("googleLogin").addEventListener("click", () => {
    alert("Google OAuth todavía no está configurado.");
});

document.getElementById("discordLogin").addEventListener("click", () => {
    alert("Discord OAuth todavía no está configurado.");
});

document.getElementById("logoutButton").addEventListener("click", () => {
    showLogin();
});


/*
 * SERVER MODAL
 */

function openModal(event) {
    if (event) {
        event.preventDefault();
    }

    modal.classList.remove("hidden");
}

function closeModal() {
    modal.classList.add("hidden");
}

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


/*
 * SERVER CONFIGURATIONS
 */

function getServers() {
    try {
        return JSON.parse(
            localStorage.getItem("elitehostx_servers") || "[]"
        );
    } catch (error) {
        console.error("Error reading servers:", error);
        return [];
    }
}

function saveServers(servers) {
    localStorage.setItem(
        "elitehostx_servers",
        JSON.stringify(servers)
    );
}

serverForm.addEventListener("submit", event => {
    event.preventDefault();

    const name = document.getElementById("serverName").value.trim();
    const software = document.getElementById("serverSoftware").value;
    const version = document.getElementById("serverVersion").value;
    const ram = Number(document.getElementById("serverRam").value);

    if (!name) {
        alert("Please enter a server name.");
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
 * RENDER SERVERS AND STATISTICS
 */

function renderServers() {
    const servers = getServers();

    serverContainer.innerHTML = "";

    document.getElementById("totalServers").textContent =
        servers.length;

    document.getElementById("activeServers").textContent = "0";

    const totalRam = servers.reduce(
        (total, server) => total + Number(server.ram || 0),
        0
    );

    document.getElementById("totalRam").textContent =
        totalRam + " GB";

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
 * API CONNECTION
 */

async function loadStatus() {
    try {
        const response = await fetch("/api/status");

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
 * INITIALIZATION
 */

showLogin();
renderServers();
loadStatus();
