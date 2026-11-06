
require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const passport = require("passport");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");
const PgSession = require("connect-pg-simple")(session);

const GoogleStrategy = require("passport-google-oauth20").Strategy;
const DiscordStrategy = require("passport-discord").Strategy;

const app = express();

const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const APP_ORIGIN = (
    process.env.APP_ORIGIN || "http://localhost:3000"
).replace(/\/+$/, "");

const SESSION_SECRET = process.env.SESSION_SECRET;

const GOOGLE_CONFIGURED = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET
);

const DISCORD_CONFIGURED = Boolean(
    process.env.DISCORD_CLIENT_ID &&
    process.env.DISCORD_CLIENT_SECRET
);

const DATABASE_CONFIGURED = Boolean(process.env.DATABASE_URL);
const SESSION_CONFIGURED = Boolean(
    DATABASE_CONFIGURED && SESSION_SECRET
);

let databaseReady = false;

const pool = DATABASE_CONFIGURED
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === "true"
            ? { rejectUnauthorized: false }
            : undefined,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
    })
    : null;


/*
|--------------------------------------------------------------------------
| TRUST PROXY
|--------------------------------------------------------------------------
*/

if (IS_PRODUCTION) {
    app.set("trust proxy", 1);
}


/*
|--------------------------------------------------------------------------
| SECURITY HEADERS
|--------------------------------------------------------------------------
*/

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: [
                    "'self'",
                    "https://fonts.googleapis.com"
                ],
                fontSrc: [
                    "'self'",
                    "https://fonts.gstatic.com",
                    "data:"
                ],
                imgSrc: [
                    "'self'",
                    "data:",
                    "https:"
                ],
                connectSrc: ["'self'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                frameAncestors: ["'none'"],
                formAction: ["'self'"]
            }
        },
        crossOriginEmbedderPolicy: false,
        referrerPolicy: {
            policy: "strict-origin-when-cross-origin"
        }
    })
);


/*
|--------------------------------------------------------------------------
| REQUEST PARSING
|--------------------------------------------------------------------------
*/

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({
    extended: false,
    limit: "20kb"
}));


/*
|--------------------------------------------------------------------------
| RATE LIMITING
|--------------------------------------------------------------------------
*/

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Demasiados intentos. Inténtalo más tarde."
    }
});


/*
|--------------------------------------------------------------------------
| DATABASE
|--------------------------------------------------------------------------
*/

async function initializeDatabase() {
    if (!pool) {
        console.warn(
            "[DATABASE] DATABASE_URL no está configurada. " +
            "La autenticación permanecerá desactivada."
        );
        return;
    }

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            provider VARCHAR(30) NOT NULL,
            provider_id VARCHAR(255) NOT NULL,
            email VARCHAR(320),
            display_name VARCHAR(120) NOT NULL,
            avatar_url TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(provider, provider_id)
        );
    `);

    databaseReady = true;

    console.log("[DATABASE] PostgreSQL conectado.");
}

async function saveOAuthUser(provider, profile) {
    if (!databaseReady || !pool) {
        throw new Error("La base de datos no está disponible.");
    }

    let email = null;
    let displayName = "EliteHostX User";
    let avatarUrl = null;

    if (provider === "google") {
        email = profile.emails?.[0]?.value || null;
        displayName = profile.displayName || displayName;
        avatarUrl = profile.photos?.[0]?.value || null;
    }

    if (provider === "discord") {
        email = profile.email || null;
        displayName =
            profile.global_name ||
            profile.username ||
            profile.displayName ||
            displayName;

        if (profile.avatar) {
            avatarUrl =
                `https://cdn.discordapp.com/avatars/` +
                `${profile.id}/${profile.avatar}.png`;
        }
    }

    const result = await pool.query(
        `
        INSERT INTO users (
            provider,
            provider_id,
            email,
            display_name,
            avatar_url,
            last_login_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())

        ON CONFLICT (provider, provider_id)
        DO UPDATE SET
            email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            avatar_url = EXCLUDED.avatar_url,
            updated_at = NOW(),
            last_login_at = NOW()

        RETURNING
            id,
            display_name AS name,
            email,
            avatar_url AS avatar,
            provider
        `,
        [
            provider,
            profile.id,
            email,
            displayName,
            avatarUrl
        ]
    );

    return result.rows[0];
}


/*
|--------------------------------------------------------------------------
| SESSION CONFIGURATION
|--------------------------------------------------------------------------
*/

if (SESSION_CONFIGURED) {
    app.use(
        session({
            name: IS_PRODUCTION
                ? "__Host-elitehostx.sid"
                : "elitehostx.sid",

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
        })
    );
}

app.use(passport.initialize());

if (SESSION_CONFIGURED) {
    app.use(passport.session());
}


/*
|--------------------------------------------------------------------------
| PASSPORT SERIALIZATION
|--------------------------------------------------------------------------
*/

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        if (!databaseReady || !pool) {
            return done(null, false);
        }

        const result = await pool.query(
            `
            SELECT
                id,
                display_name AS name,
                email,
                avatar_url AS avatar,
                provider
            FROM users
            WHERE id = $1
            `,
            [id]
        );

        if (result.rows.length === 0) {
            return done(null, false);
        }

        done(null, result.rows[0]);

    } catch (error) {
        done(error);
    }
});


/*
|--------------------------------------------------------------------------
| OAUTH STRATEGIES
|--------------------------------------------------------------------------
*/

if (SESSION_CONFIGURED && GOOGLE_CONFIGURED) {
    passport.use(
        new GoogleStrategy(
            {
                clientID: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                callbackURL: `${APP_ORIGIN}/auth/google/callback`
            },

            async (accessToken, refreshToken, profile, done) => {
                try {
                    const user = await saveOAuthUser(
                        "google",
                        profile
                    );

                    done(null, user);

                } catch (error) {
                    done(error);
                }
            }
        )
    );
}

if (SESSION_CONFIGURED && DISCORD_CONFIGURED) {
    passport.use(
        new DiscordStrategy(
            {
                clientID: process.env.DISCORD_CLIENT_ID,
                clientSecret: process.env.DISCORD_CLIENT_SECRET,
                callbackURL: `${APP_ORIGIN}/auth/discord/callback`,
                scope: ["identify", "email"]
            },

            async (accessToken, refreshToken, profile, done) => {
                try {
                    const user = await saveOAuthUser(
                        "discord",
                        profile
                    );

                    done(null, user);

                } catch (error) {
                    done(error);
                }
            }
        )
    );
}


/*
|--------------------------------------------------------------------------
| CSRF / SAME-ORIGIN PROTECTION
|--------------------------------------------------------------------------
*/

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
    const fetchSite = req.get("sec-fetch-site");

    if (fetchSite === "cross-site") {
        return res.status(403).json({
            error: "Solicitud externa bloqueada."
        });
    }

    const origin = req.get("origin");
    const referer = req.get("referer");

    let requestOrigin = null;

    try {
        if (origin) {
            requestOrigin = new URL(origin).origin;
        } else if (referer) {
            requestOrigin = new URL(referer).origin;
        }
    } catch {
        requestOrigin = null;
    }

    if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
        return res.status(403).json({
            error: "Origen no autorizado."
        });
    }

    next();
}

app.use("/api", (req, res, next) => {
    const safeMethods = ["GET", "HEAD", "OPTIONS"];

    if (safeMethods.includes(req.method)) {
        return next();
    }

    verifySameOrigin(req, res, next);
});


/*
|--------------------------------------------------------------------------
| AUTHENTICATION HELPERS
|--------------------------------------------------------------------------
*/

function requireDatabase(req, res, next) {
    if (!databaseReady || !SESSION_CONFIGURED) {
        return res.status(503).json({
            error: "La autenticación todavía no está configurada."
        });
    }

    next();
}

function requireLogin(req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({
            error: "Debes iniciar sesión."
        });
    }

    next();
}


/*
|--------------------------------------------------------------------------
| STATUS API
|--------------------------------------------------------------------------
*/

app.get("/api/status", (req, res) => {
    res.json({
        name: "EliteHostX",
        status: "online",
        version: "1.1.0",
        minecraft: "Preparado para integrar"
    });
});


/*
|--------------------------------------------------------------------------
| CURRENT USER
|--------------------------------------------------------------------------
*/

app.get(
    "/api/me",
    requireDatabase,
    requireLogin,
    (req, res) => {
        res.set("Cache-Control", "no-store");

        res.json({
            authenticated: true,
            user: {
                id: req.user.id,
                name: req.user.name,
                email: req.user.email,
                avatar: req.user.avatar,
                provider: req.user.provider
            }
        });
    }
);


/*
|--------------------------------------------------------------------------
| GOOGLE LOGIN
|--------------------------------------------------------------------------
*/

app.get("/auth/google", authLimiter, (req, res, next) => {
    if (!SESSION_CONFIGURED || !GOOGLE_CONFIGURED) {
        return res.redirect("/?auth=unavailable");
    }

    passport.authenticate("google", {
        scope: ["profile", "email"],
        session: true
    })(req, res, next);
});

app.get(
    "/auth/google/callback",
    authLimiter,
    (req, res, next) => {
        if (!SESSION_CONFIGURED || !GOOGLE_CONFIGURED) {
            return res.redirect("/?auth=unavailable");
        }

        passport.authenticate("google", {
            failureRedirect: "/?auth=failed",
            session: true
        })(req, res, next);
    },
    (req, res) => {
        res.redirect("/");
    }
);


/*
|--------------------------------------------------------------------------
| DISCORD LOGIN
|--------------------------------------------------------------------------
*/

app.get("/auth/discord", authLimiter, (req, res, next) => {
    if (!SESSION_CONFIGURED || !DISCORD_CONFIGURED) {
        return res.redirect("/?auth=unavailable");
    }

    passport.authenticate("discord", {
        session: true
    })(req, res, next);
});

app.get(
    "/auth/discord/callback",
    authLimiter,
    (req, res, next) => {
        if (!SESSION_CONFIGURED || !DISCORD_CONFIGURED) {
            return res.redirect("/?auth=unavailable");
        }

        passport.authenticate("discord", {
            failureRedirect: "/?auth=failed",
            session: true
        })(req, res, next);
    },
    (req, res) => {
        res.redirect("/");
    }
);


/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

app.post(
    "/api/logout",
    requireDatabase,
    requireLogin,
    (req, res, next) => {
        req.logout(error => {
            if (error) {
                return next(error);
            }

            req.session.destroy(error => {
                if (error) {
                    return next(error);
                }

                res.clearCookie(
                    IS_PRODUCTION
                        ? "__Host-elitehostx.sid"
                        : "elitehostx.sid",
                    {
                        httpOnly: true,
                        secure: IS_PRODUCTION,
                        sameSite: "lax",
                        path: "/"
                    }
                );

                res.json({
                    success: true
                });
            });
        });
    }
);


/*
|--------------------------------------------------------------------------
| STATIC WEBSITE
|--------------------------------------------------------------------------
*/

app.use(
    express.static(
        path.join(__dirname, "public"),
        {
            index: "index.html",
            dotfiles: "deny",
            maxAge: IS_PRODUCTION ? "1h" : 0
        }
    )
);


/*
|--------------------------------------------------------------------------
| NOT FOUND
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
    res.status(404).json({
        error: "Recurso no encontrado."
    });
});


/*
|--------------------------------------------------------------------------
| ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use((error, req, res, next) => {
    console.error("[ERROR]", error.message);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        error: "Ha ocurrido un error interno."
    });
});


/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

async function startServer() {
    try {
        if (pool) {
            await initializeDatabase();
        }

        app.listen(PORT, "0.0.0.0", () => {
            console.log("--------------------------------");
            console.log("          EliteHostX");
            console.log("--------------------------------");
            console.log(`Panel iniciado en puerto ${PORT}`);
            console.log(`PostgreSQL: ${databaseReady ? "READY" : "NOT CONFIGURED"}`);
            console.log(`Google OAuth: ${GOOGLE_CONFIGURED ? "CONFIGURED" : "NOT CONFIGURED"}`);
            console.log(`Discord OAuth: ${DISCORD_CONFIGURED ? "CONFIGURED" : "NOT CONFIGURED"}`);
            console.log(`Sessions: ${SESSION_CONFIGURED ? "CONFIGURED" : "NOT CONFIGURED"}`);
            console.log("--------------------------------");
        });

    } catch (error) {
        console.error(
            "[STARTUP ERROR] No se pudo iniciar EliteHostX:",
            error.message
        );

        process.exit(1);
    }
}

startServer();
