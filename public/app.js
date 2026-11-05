const modal = document.getElementById("serverModal");

const createButtons = [
    document.getElementById("createButton"),
    document.getElementById("emptyCreate")
];

function openModal() {
    modal.classList.remove("hidden");
}

function closeModal() {
    modal.classList.add("hidden");
}

createButtons.forEach(button => {
    button.addEventListener("click", openModal);
});

document.getElementById("closeModal")
    .addEventListener("click", closeModal);

document.getElementById("confirmCreate")
    .addEventListener("click", () => {

        const name = document.getElementById("serverName").value.trim();
        const software = document.getElementById("serverSoftware").value;
        const version = document.getElementById("serverVersion").value;
        const ram = document.getElementById("serverRam").value;

        if (!name) {
            alert("Please enter a server name.");
            return;
        }

        const server = {
            name,
            software,
            version,
            ram
        };

        const servers = JSON.parse(
            localStorage.getItem("elitehostx_servers") || "[]"
        );

        servers.push(server);

        localStorage.setItem(
            "elitehostx_servers",
            JSON.stringify(servers)
        );

        renderServers();
        closeModal();

        document.getElementById("serverName").value = "";
    });

function renderServers() {

    const servers = JSON.parse(
        localStorage.getItem("elitehostx_servers") || "[]"
    );

    const container = document.querySelector(".empty");

    container.innerHTML = "";

    if (servers.length === 0) {
        container.innerHTML = `
            <div class="empty-icon">▣</div>
            <h2>No servers yet</h2>
            <p>Create your first Minecraft server configuration.</p>
            <button id="emptyCreate">CREATE MY FIRST SERVER</button>
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
        const details = document.createElement("p");
        const status = document.createElement("span");

        title.textContent = server.name;
        details.textContent =
            `${server.software} · Minecraft ${server.version} · ${server.ram} GB RAM`;

        status.className = "server-status";
        status.textContent = "● CONFIGURED";

        info.append(title, details);
        card.append(info, status);
        container.appendChild(card);
    });
}

async function loadStatus() {
    try {
        const response = await fetch("/api/status");
        const data = await response.json();
        console.log("Connected to " + data.name);
    } catch (error) {
        console.error("Connection error:", error);
    }
}

renderServers();
loadStatus();