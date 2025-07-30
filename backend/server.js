import express from "express";
import cors from "cors";
import { google } from "googleapis";

import textToSpeech from "@google-cloud/text-to-speech";

const client = new textToSpeech.TextToSpeechClient();

const app = express();

const PORT = process.env.PORT || 3000;

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

        const [response] = await client.synthesizeSpeech(request);

        // Envoie le buffer audio en réponse
        res.set("Content-Type", "audio/mpeg");
        res.send(response.audioContent);
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur synthèse vocale");
    }
});


const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// Ton ID Google Sheet
const SHEET_ID = "1Yto3-0IxVwYqL4dgNl4E7yCnG8ZWxPxn2HrYBeARc30";

async function getSheets() {
    const client = await auth.getClient();
    return google.sheets({ version: "v4", auth: client });
}

// Récupérer lexique complet (tous mots français + roumain)
async function getLexique(sheets) {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: "lexique!A2:B",
    });
    return res.data.values || [];
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
function calculerPoids(mot, histo) {
    let totalOK = 0,
        totalKO = 0;
    for (const ligne of histo) {
        if (ligne[0] === mot) {
            if (ligne[3] === "OK") totalOK++;
            else if (ligne[3] === "KO") totalKO++;
        }
    }
    return (totalKO + 1) / (totalOK + 1); // +1 pour éviter division par 0
}


app.get("/api/getWord", async (req, res) => {
    console.log("Tirage d'un mot...");
    try {
        const sheets = await getSheets();
        const lexique = await getLexique(sheets);
        const histo = await getHisto(sheets);

        // Construire un tableau avec poids
        const data = lexique.map(([fr, ro], i) => ({
            index: i,
            motFr: fr,
            motRo: ro,
            poids: calculerPoids(fr, histo),
        }));

        // Tirage aléatoire pondéré
        const totalPoids = data.reduce((acc, el) => acc + el.poids, 0);
        let r = Math.random() * totalPoids;
        const selected = data.find((el) => (r -= el.poids) < 0) || data[0];

        res.json({ index: selected.index, motFr: selected.motFr });
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
});

app.post("/api/sendAnswer", async (req, res) => {
    try {
        const { index, reponse } = req.body;
        const sheets = await getSheets();
        const lexique = await getLexique(sheets);

        if (!lexique[index]) return res.status(400).send("Index invalide");

        const motFr = lexique[index][0];
        const bonneReponse = lexique[index][1];
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
            range: `lexique!C${ligne}:D${ligne}`,
        });

        let tentatives = parseInt(countRes.data.values?.[0]?.[0] || "0");
        console.log(`Tentatives pour le mot ${motFr} : ${tentatives}`);
        let reussites = parseInt(countRes.data.values?.[0]?.[1] || "0");
        console.log(`Réussites pour le mot ${motFr} : ${reussites}`);

        tentatives += 1;
        console.log(`Tentatives pour le mot ${motFr} : ${tentatives}`);
        if (isCorrect) reussites += 1;
        console.log(`Réussites pour le mot ${motFr} : ${reussites}`);

        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `lexique!C${ligne}:D${ligne}`,
            valueInputOption: "RAW",
            requestBody: {
                values: [[tentatives, reussites]],
            },
        });

        const pourcentage = tentatives > 0 ? Math.round((reussites / tentatives) * 100) : 0;

        res.json({
            resultat,
            bonneReponse,
            stats: {
                tentatives,
                reussites,
                pourcentage,
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
});

// ✅ Déplacés ici :
app.post("/api/addWord", async (req, res) => {
    try {
        const { motFr, motRo } = req.body;
        if (!motFr || !motRo) return res.status(400).send("Mot(s) manquant(s)");

        const sheets = await getSheets();

        // 1. Récupérer lexique entier
        const lexRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: "lexique!A2:B",
        });
        const lexique = lexRes.data.values || [];

        // 2. Filtrer pour enlever l'entrée avec motFr == motFr envoyé
        const nouveauLexique = lexique.filter(([fr]) => fr !== motFr);

        // 3. Ecraser la feuille avec le lexique filtré
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: "lexique!A2:B",
            valueInputOption: "RAW",
            requestBody: {
                values: nouveauLexique,
            },
        });

        // 4. Ajouter la nouvelle paire corrigée en fin de lexique
        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: "lexique!A:B",
            valueInputOption: "RAW",
            requestBody: {
                values: [[motFr, motRo]],
            },
        });

        res.sendStatus(201);
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
});

app.get("/api/getStats", async (req, res) => {
    try {
        const sheets = await getSheets();
        const histo = await getHisto(sheets);
        const last100 = histo.slice(-100);
        const bonnes = last100.filter(row => (row[3] || "").trim().toUpperCase() === "OK").length;

        res.json({
            bonnes,
            total: last100.length,
        });

    } catch (err) {
        console.error("Erreur /api/getStats:", err);
        res.status(500).json({ error: "Erreur serveur lors de la récupération des stats." });
    }
});

// ✅ Enfin, on démarre le serveur
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
