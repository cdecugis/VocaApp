process.on('uncaughtException', (err) => {
    console.error('🔥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 Unhandled Rejection:', reason);
});

import express from "express";
import cors from "cors";
import { google } from "googleapis";
import textToSpeech from "@google-cloud/text-to-speech";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { on } from "events";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let credentialsPath;

if (fs.existsSync("/secrets/credentials.json")) {
    credentialsPath = "/secrets/credentials.json"; // secret monté en fichier
    console.log("Using credentials from mounted secret: /secrets/credentials.json");
}
else if (process.env.credentials) {
    // Si tu as la variable d'env avec le JSON complet (string), écris-le dans un fichier temporaire
    const tmpPath = path.join(__dirname, "credentials_temp.json");
    fs.writeFileSync(tmpPath, process.env.credentials);
    credentialsPath = tmpPath;
} else {
    credentialsPath = path.join(__dirname, "credentials.json"); // local dev
}

// Ensuite tu utilises credentialsPath comme avant
console.log("Using credentials from:", credentialsPath);

// Authentification Google Sheets
const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// Client TTS
const ttsclient = new textToSpeech.TextToSpeechClient({
    keyFilename: credentialsPath,   // Chemin vers le fichier de clés
});

const app = express();

// démarrage du serveur par défaut sur 8080 de gcloud ou port 3001 en local
const PORT = process.env.PORT || 3001;

function nettoyerRoumain(texte) {
    return texte
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "") // enlève les accents visuels
        .replace(/[șş]/gi, "s")
        .replace(/[țţ]/gi, "t")
        .replace(/ă/gi, "a")
        .replace(/[âî]/gi, "i")
        .toLowerCase()
        .trim();
}

app.get("/", (req, res) => {
    res.send("Hello from backend!");
});

app.use(cors());
app.use(express.json());

// Endpoint pour générer le son TTS du texte reçu
app.post("/api/tts", async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).send("Texte manquant");

        const request = {
            input: { text },
            // Langue roumaine, voix féminine par défaut (tu peux personnaliser)
            voice: { languageCode: "ro-RO", ssmlGender: "FEMALE" },
            audioConfig: { audioEncoding: "MP3" },
        };

        const [response] = await ttsclient.synthesizeSpeech(request);

        // Envoie le buffer audio en réponse
        res.set("Content-Type", "audio/mpeg");
        res.send(response.audioContent);
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur synthèse vocale");
    }
});

// Ton ID Google Sheet
const SHEET_ID = "1Yto3-0IxVwYqL4dgNl4E7yCnG8ZWxPxn2HrYBeARc30";

async function getSheets() {
    const client = await auth.getClient();
    return google.sheets({ version: "v4", auth: client });
}

// Récupérer historique (toutes réponses enregistrées)
async function getHisto(sheets) {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: "histo!A2:D",
    });
    return res.data.values || [];
}


// Calcul pondération simple : plus un mot a d’erreurs KO, plus il a de poids
function calculerPoids(index, tentatives, reussites) {
    if (!tentatives) return 15; // Jamais demandé
    const taux = reussites / tentatives;
    return 1 + Math.round((1 - taux) * 9); // Entre 1 (100% réussite) et 10 (0%)
}

app.get("/api/getWord", async (req, res) => {
    console.log("Tirage d'un mot...", credentialsPath);
    try {
        const sheets = await getSheets();
        const onglet = req.query.onglet;

        const resData = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${onglet}!A2:D`,
        });

        const source = resData.data.values || [];
        if (source.length === 0) {
            return res.status(400).json({ error: `Aucun mot trouvé dans l'onglet ${onglet}` });
        }

        // Construire tableau avec poids
        const data = source.map(([fr, ro], i) => {
            const statLine = source[i] || [];
            const tentatives = parseInt(statLine[2]) || 0;
            const reussites = parseInt(statLine[3]) || 0;
            return {
                index: i,
                motFr: fr,
                motRo: ro,
                poids: calculerPoids(i, tentatives, reussites),
            };
        });

        const totalPoids = data.reduce((acc, el) => acc + el.poids, 0);
        let r = Math.random() * totalPoids;
        const selected = data.find((el) => (r -= el.poids) < 0) || data[0];

        res.json({ index: selected.index, motFr: selected.motFr });
        console.log(`Mot tiré: ${selected.motFr} (index: ${selected.index})`);

    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
});


app.post("/api/sendAnswer", async (req, res) => {
    try {
        const { index, reponse, correction } = req.body;
        const onglet = req.query.onglet;
        console.log(`Demande de réponse pour l'onglet ${onglet}, index ${index}`);

        const sheets = await getSheets();
        const source = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${onglet}!A2:D`,
        });

        const liste = source.data.values || [];
        const motFr = liste[index][0];
        const bonneReponse = liste[index][1];
        const isCorrect = nettoyerRoumain(reponse.trim().toLowerCase()) === nettoyerRoumain(bonneReponse.trim().toLowerCase());
        const resultat = isCorrect ? "OK" : "KO";

        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: "histo!A:D",
            valueInputOption: "RAW",
            requestBody: {
                values: [[motFr, reponse, bonneReponse, resultat]],
            },
        });

        const ligne = parseInt(index) + 2;

        const countRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${onglet}!C${ligne}:D${ligne}`,
        });

        let tentatives = parseInt(countRes.data.values?.[0]?.[0] || "0");
        let reussites = parseInt(countRes.data.values?.[0]?.[1] || "0");

        console.log(`Première tentative: ${correction}`);
        if (correction) {
            console.log("C'est une première tentative");
            tentatives += 1;
            if (isCorrect) reussites += 1;

            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${onglet}!C${ligne}:D${ligne}`,
                valueInputOption: "RAW",
                requestBody: {
                    values: [[tentatives, reussites]],
                },
            });
        }

        const pourcentage = tentatives > 0 ? Math.round((reussites / tentatives) * 100) : 0;

        res.json({
            resultat,
            bonneReponse,
            stats: {
                tentatives,
                reussites,
                pourcentage,
            },
            isCorrect,
        });

    } catch (error) {
        console.error("Erreur dans /api/sendAnswer:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

/////////////// Traduction proposée avant ajout //////////////////////
app.post("/api/translate", async (req, res) => {
    const { texte } = req.body;

    if (!texte) return res.status(400).json({ error: "Texte manquant" });

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=ro&dt=t&q=${encodeURIComponent(texte)}`;
        const response = await fetch(url);
        const data = await response.json();

        const traduction = data[0]?.[0]?.[0] || "";
        res.json({ traduction });
    } catch (err) {
        console.error("Erreur traduction :", err);
        res.status(500).json({ error: "Erreur de traduction" });
    }
});

/////////////// Ajouter ou mettre à jour un mot dans le dictionnaire ////////////////
app.post("/api/addWord", async (req, res) => {
    const { motFr, motRo } = req.body;
    const onglet = req.query.onglet;
    if (!motFr || !motRo) return res.status(400).send("Champs manquants");

    try {
        const sheets = await getSheets();
        const source_xls = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${onglet}!A2:B`,
        });

        // transformer les données en tableau
        const source = source_xls.data.values || [];

        // Chercher l'index du mot français existant (col A)
        const index = source.findIndex((row) => row[0]?.trim().toLowerCase() === motFr.trim().toLowerCase());

        if (index !== -1) {
            // Mise à jour de la traduction
            console.log(`Mot trouvé à l'index ${index}, mise à jour de la traduction...`);
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${onglet}!B${index + 2}`,
                valueInputOption: "RAW",
                requestBody: {
                    values: [[motRo]],
                },
            });
            res.json({ message: "Mot mis à jour", index });
        } else {
            // Ajout d'un nouveau mot
            console.log(`Mot non trouvé, ajout à la fin...`);
            await sheets.spreadsheets.values.append({
                spreadsheetId: SHEET_ID,
                range: `${onglet}!A:D`, // on prépare aussi les colonnes C et D
                valueInputOption: "RAW",
                requestBody: {
                    values: [[motFr, motRo, "", ""]], // C et D vides au départ
                },
            });
            res.json({ message: "Mot ajouté" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
});


// ✅ Enfin, on démarre le serveur
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
