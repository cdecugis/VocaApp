import express from "express";
import cors from "cors";
import { google } from "googleapis";

import textToSpeech from "@google-cloud/text-to-speech";
import fs from "fs";
import util from "util";
import path from "path";

const client = new textToSpeech.TextToSpeechClient({
    keyFilename: "credentials.json", // Chemin vers le JSON téléchargé
});

const app = express();
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


const PORT = 3001;

const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
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
        const resultat = reponse.trim().toLowerCase() === bonneReponse.trim().toLowerCase() ? "OK" : "KO";

        // Ajouter une ligne dans "histo"
        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: "histo!A:D",
            valueInputOption: "RAW",
            requestBody: {
                values: [[motFr, reponse, bonneReponse, resultat]],
            },
        });

        res.json({ resultat, bonneReponse });
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
});

// Ajouter un mot (fr, ro)
app.post("/api/addWord", async (req, res) => {
    try {
        const { motFr, motRo } = req.body;
        if (!motFr || !motRo) return res.status(400).send("Mot(s) manquant(s)");

        const sheets = await getSheets();

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

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
