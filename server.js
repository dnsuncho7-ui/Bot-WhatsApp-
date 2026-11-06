require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const passport = require("passport");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const PgSession = require("connect-pg-simple")(session);

const GoogleStrategy = require("passport-google-oauth20").Strategy;
const DiscordStrategy = require("passport-discord").Strategy;

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const APP_ORIGIN = (process.env.APP_ORIGIN || "http://localhost:3000").replace(/\/+$/, "");
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const SESSION_CONFIGURED = Boolean(DATABASE_URL && SESSION_SECRET);
const GOOGLE_CONFIGURED = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const DISCORD_CONFIGURED = Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);

let databaseReady = false;

const pool = DATABASE_URL
    ? new Pool({
        connectionString: DATABASE_URL,
        ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
    })
    : null;

if (IS_PRODUCTION) app.set("trust proxy", 1);

app.disable("x-powered-by");

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"],
            formAction: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo." }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Se alcanzó el límite de registros desde esta conexión. Inténtalo más tarde." }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiados intentos de inicio de sesión. Inténtalo más tarde." }
});

const allowedOrigins = new Set([
    APP_ORIGIN,
    "https://elitehostx.bond",
    "https://www.elitehostx.bond"
]);

if (!IS_PRODUCTION) {
    allowedOrigins.add("http://localhost:3000");
    allowedOrigins.add("http://127.0.0.1:3000");
}

function verifySameOrigin(req, res, next) {
    if (req.get("sec-fetch-site") === "cross-site") {
        return res.status(403).json({ error: "Solicitud externa bloqueada." });
    }

    const origin = req.get("origin");
    const referer = req.get("referer");
    let requestOrigin = null;

    try {
        if (origin) requestOrigin = new URL(origin).origin;
        else if (referer) requestOrigin = new URL(referer).origin;
    } catch {
        requestOrigin = null;
    }

    if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
        return res.status(403).json({ error: "Origen no autorizado." });
    }

    next();
}

app.use("/api", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    return verifySameOrigin(req, res, next);
});

async function initializeDatabase() {
    if (!pool) throw new Error("Falta DATABASE_URL en las variables de entorno.");

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            provider VARCHAR(30),
            provider_id VARCHAR(255),
            email VARCHAR(320),
            display_name VARCHAR(120) NOT NULL,
            avatar_url TEXT,
            password_hash TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(provider, provider_id)
        )
    `);

    // Compatible con la tabla OAuth que ya existía en la instalación anterior.
    await pool.query(`
        ALTER TABLE users
            ALTER COLUMN provider DROP NOT NULL,
            ALTER COLUMN provider_id DROP NOT NULL
    `);

    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT");

    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
        ON users (LOWER(email))
        WHERE email IS NOT NULL AND provider = 'local'
    `);

    databaseReady = true;
    console.log("[DATABASE] PostgreSQL conectado y esquema preparado.");
}

function requireDatabase(req, res, next) {
    if (!databaseReady || !SESSION_CONFIGURED) {
        return res.status(503).json({
            error: "El servicio de cuentas no está disponible temporalmente."
        });
    }

    next();
}

function publicUser(row) {
    return {
        id: String(row.id),
        name: row.display_name,
        email: row.email,
        avatar: row.avatar_url || null,
        provider: row.provider || "local"
    };
}

function validEmail(email) {
    return typeof email === "string" &&
        email.length <= 320 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

let sessionMiddleware = (req, res, next) => next();

if (SESSION_CONFIGURED) {
    sessionMiddleware = session({
        name: IS_PRODUCTION ? "__Host-elitehostx.sid" : "elitehostx.sid",
        store: new PgSession({
            pool,
            tableName: "user_sessions",
            createTableIfMissing: true
        }),
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: "lax",
            path: "/",
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
    });
}

app.use((req, res, next) => {
    if (!SESSION_CONFIGURED) return next();
    sessionMiddleware(req, res, next);
});

app.use(passport.initialize());

if (SESSION_CONFIGURED) {
    app.use(passport.session());
}

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
    try {
        if (!databaseReady || !pool) return done(null, false);

        const result = await pool.query(
            `SELECT id, display_name, email, avatar_url, provider
             FROM users
             WHERE id = $1`,
            [id]
        );

        if (!result.rows.length) return done(null, false);

        done(null, publicUser(result.rows[0]));
    } catch (error) {
        done(error);
    }
});

async function saveOAuthUser(provider, profile) {
    const email = provider === "google"
        ? (profile.emails?.[0]?.value || null)
        : (profile.email || null);

    const displayName = provider === "google"
        ? (profile.displayName || "EliteHostX User")
        : (profile.global_name || profile.username || "EliteHostX User");

    let avatarUrl = profile.photos?.[0]?.value || null;

    if (provider === "discord" && profile.avatar) {
        avatarUrl = `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`;
    }

    const result = await pool.query(
        `INSERT INTO users
            (provider, provider_id, email, display_name, avatar_url, last_login_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (provider, provider_id)
         DO UPDATE SET
            email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            avatar_url = EXCLUDED.avatar_url,
            updated_at = NOW(),
            last_login_at = NOW()
         RETURNING id, display_name, email, avatar_url, provider`,
        [provider, profile.id, email, displayName, avatarUrl]
    );

    return publicUser(result.rows[0]);
}

if (SESSION_CONFIGURED && GOOGLE_CONFIGURED) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${APP_ORIGIN}/auth/google/callback`
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            done(null, await saveOAuthUser("google", profile));
        } catch (error) {
            done(error);
        }
    }));
}

if (SESSION_CONFIGURED && DISCORD_CONFIGURED) {
    passport.use(new DiscordStrategy({
        clientID: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        callbackURL: `${APP_ORIGIN}/auth/discord/callback`,
        scope: ["identify", "email"]
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            done(null, await saveOAuthUser("discord", profile));
        } catch (error) {
            done(error);
        }
    }));
}

app.get("/api/status", (req, res) => {
    res.set("Cache-Control", "no-store");

    res.json({
        name: "EliteHostX",
        status: "online",
        version: "1.2.0",
        database: databaseReady ? "ready" : "unavailable",
        registration: databaseReady && SESSION_CONFIGURED ? "enabled" : "unavailable",
        minecraft: "Preparado para integrar"
    });
});

app.post("/api/register", requireDatabase, registerLimiter, async (req, res, next) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");
        const name = String(req.body.name || "").trim();

        if (!validEmail(email)) {
            return res.status(400).json({
                error: "Escribe un correo electrónico válido."
            });
        }

        if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
            return res.status(400).json({
                error: "La contraseña debe tener entre 12 y 72 caracteres."
            });
        }

        if (name.length < 2 || name.length > 60) {
            return res.status(400).json({
                error: "El nombre debe tener entre 2 y 60 caracteres."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO users
                (provider, provider_id, email, display_name, password_hash, last_login_at)
             VALUES ('local', $1, $1, $2, $3, NOW())
             ON CONFLICT DO NOTHING
             RETURNING id, display_name, email, avatar_url, provider`,
            [email, name, passwordHash]
        );

        if (!result.rows.length) {
            return res.status(409).json({
                error: "Ese correo ya está registrado. Inicia sesión o utiliza otro correo."
            });
        }

        req.login(publicUser(result.rows[0]), error => {
            if (error) return next(error);

            res.status(201).json({
                success: true,
                user: publicUser(result.rows[0])
            });
        });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({
                error: "Ese correo ya está registrado."
            });
        }

        next(error);
    }
});

app.post("/api/login", requireDatabase, loginLimiter, async (req, res, next) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");

        if (!validEmail(email) || !password || password.length > 72) {
            return res.status(400).json({
                error: "Correo o contraseña incorrectos."
            });
        }

        const result = await pool.query(
            `SELECT id, display_name, email, avatar_url, provider, password_hash
             FROM users
             WHERE LOWER(email) = $1 AND provider = 'local'
             LIMIT 1`,
            [email]
        );

        const account = result.rows[0];

        const passwordMatches = account?.password_hash
            ? await bcrypt.compare(password, account.password_hash)
            : false;

        if (!passwordMatches) {
            return res.status(401).json({
                error: "Correo o contraseña incorrectos."
            });
        }

        await pool.query(
            "UPDATE users SET last_login_at = NOW() WHERE id = $1",
            [account.id]
        );

        req.login(publicUser(account), error => {
            if (error) return next(error);

            res.json({
                success: true,
                user: publicUser(account)
            });
        });
    } catch (error) {
        next(error);
    }
});

app.get("/api/me", requireDatabase, (req, res) => {
    res.set("Cache-Control", "no-store");

    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.json({ authenticated: false });
    }

    res.json({
        authenticated: true,
        user: req.user
    });
});

app.post("/api/logout", requireDatabase, (req, res, next) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.json({ success: true });
    }

    req.logout(error => {
        if (error) return next(error);

        if (!req.session) {
            return res.json({ success: true });
        }

        req.session.destroy(error => {
            if (error) return next(error);

            res.clearCookie(
                IS_PRODUCTION ? "__Host-elitehostx.sid" : "elitehostx.sid",
                {
                    httpOnly: true,
                    secure: IS_PRODUCTION,
                    sameSite: "lax",
                    path: "/"
                }
            );

            res.json({ success: true });
        });
    });
});

// OAuth queda disponible si algún día se configuran las credenciales.
app.get("/auth/google", authLimiter, (req, res, next) => {
    if (!SESSION_CONFIGURED || !GOOGLE_CONFIGURED) {
        return res.redirect("/?auth=unavailable");
    }

    passport.authenticate("google", {
        scope: ["profile", "email"]
    })(req, res, next);
});

app.get("/auth/google/callback", authLimiter, (req, res, next) => {
    if (!SESSION_CONFIGURED || !GOOGLE_CONFIGURED) {
        return res.redirect("/?auth=unavailable");
    }

    passport.authenticate("google", {
        failureRedirect: "/?auth=failed"
    })(req, res, next);
}, (req, res) => res.redirect("/"));

app.get("/auth/discord", authLimiter, (req, res, next) => {
    if (!SESSION_CONFIGURED || !DISCORD_CONFIGURED) {
        return res.redirect("/?auth=unavailable");
    }

    passport.authenticate("discord")(req, res, next);
});

app.get("/auth/discord/callback", authLimiter, (req, res, next) => {
    if (!SESSION_CONFIGURED || !DISCORD_CONFIGURED) {
        return res.redirect("/?auth=unavailable");
    }

    passport.authenticate("discord", {
        failureRedirect: "/?auth=failed"
    })(req, res, next);
}, (req, res) => res.redirect("/"));

app.use(express.static(path.join(__dirname, "public"), {
    index: "index.html",
    dotfiles: "deny",
    maxAge: IS_PRODUCTION ? "1h" : 0
}));

app.use((req, res) => {
    res.status(404).json({
        error: "Recurso no encontrado."
    });
});

app.use((error, req, res, next) => {
    console.error("[ERROR]", error.message);

    if (res.headersSent) return next(error);

    res.status(500).json({
        error: "Ha ocurrido un error interno."
    });
});

async function startServer() {
    try {
        if (!pool) {
            throw new Error("DATABASE_URL no está configurada.");
        }

        if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
            throw new Error("SESSION_SECRET falta o es demasiado corta (mínimo 32 caracteres).");
        }

        await initializeDatabase();

        app.listen(PORT, "0.0.0.0", () => {
            console.log("--------------------------------");
            console.log("EliteHostX");
            console.log("--------------------------------");
            console.log(`Panel iniciado en puerto ${PORT}`);
            console.log(`PostgreSQL: ${databaseReady ? "READY" : "NOT READY"}`);
            console.log("Registro por correo: ENABLED");
            console.log(`Google OAuth: ${GOOGLE_CONFIGURED ? "CONFIGURED" : "PENDING"}`);
            console.log(`Discord OAuth: ${DISCORD_CONFIGURED ? "CONFIGURED" : "PENDING"}`);
            console.log("--------------------------------");
        });
    } catch (error) {
        console.error("[STARTUP ERROR]", error.message);
        process.exit(1);
    }
}

startServer();