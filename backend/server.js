import express from "express";
import cors from "cors";
import { google } from "googleapis";
import textToSpeech from "@google-cloud/text-to-speech";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UTILISATEURS_ID = "1gDx3H4gbynYgLSTRTpKklzxaeEu0h05dVJz7wLB3LeA"; // ID de la feuille des utilisateurs

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

app.use(cors());
app.use(express.json());

// démarrage du serveur par défaut sur 8080 de gcloud ou port 3001 en local
const PORT = process.env.PORT || 3001;

////////////////// Gestion de la connexion //////////////////
app.get("/api/login", async (req, res) => {
    const identifiant = req.query.identifiant?.trim();
    if (!identifiant) return res.status(400).send("Identifiant manquant");
    console.log(`Connexion demandée pour l'identifiant: ${identifiant}`);

    try {
        const sheets = await getSheets();
        const data = await sheets.spreadsheets.values.get({
            spreadsheetId: UTILISATEURS_ID,
            range: "utilisateurs!A2:B",
        });

        const ligne = data.data.values.find(row => row[0] === identifiant);
        if (!ligne) return res.status(404).send("Utilisateur non trouvé");

        const sheetId = ligne[1];
        res.json({ sheetId });
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
});

app.get("/", (req, res) => {
    res.send("Hello from backend!");
});


/////////////// Apprendre 10 nouveaux mots ////////////////
app.get("/api/learnNewWords", async (req, res) => {
    const { sheetId, onglet } = req.query;
    console.log(`Tirage de nouveaux mots pour l'onglet ${onglet}...`);

    const data = await readSheet(sheetId, onglet); // fonction existante
    const motsJamaisVus = data.filter(row => !row.appris); // appris une fois = colonne E

    // Prendre 10 au hasard
    // mélange le tableau
    for (let i = motsJamaisVus.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [motsJamaisVus[i], motsJamaisVus[j]] = [motsJamaisVus[j], motsJamaisVus[i]];
    }
    const motsChoisis = motsJamaisVus.slice(0, 10); // prend les 10 premiers après mélange
    console.log(`Tirage de ${motsChoisis.length} nouveaux mots...`);
    console.log("Mots choisis :", motsChoisis.map(m => m.motFr).join(", "));
    console.log("Mots choisis :", motsChoisis.map(m => m.motRo).join(", "));
    res.json(motsChoisis);
});


/////////////// Marquer le mot comme appris ////////////////
app.post("/api/markAsLearned", async (req, res) => {
    const { sheetId, onglet } = req.query;
    const { motFr } = req.body;
    console.log(`Marquage du mot ${motFr} comme appris`);
    if (!motFr) return res.status(400).send("Champs manquants");
    try {
        // recherche de l'index du mot dans la feuille
        const sheets = await getSheets();
        const source = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `${onglet}!A2:A`, // Colonne A pour les mots français
        });
        const index = source.data.values.findIndex(row => row[0]?.trim().toLowerCase() === motFr.trim().toLowerCase());
        if (index === -1) return res.status(404).send("Mot non trouvé");
        const ligne = index + 2; // +2 pour sauter l'en-tête
        console.log(`Mot trouvé à la ligne ${ligne}, marquage comme appris...`);

        // Mettre à jour la colonne E pour "appris"
        await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `${onglet}!E${ligne}`, // Colonne E pour "appris"
            valueInputOption: "RAW",
            requestBody: {
                values: [["oui"]], // Marquer comme appris
            },
        });
        console.log(`Mot ${motFr} marqué comme appris !`);
        res.json({ message: "Mot marqué comme appris" });
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
});


/////////////// Lire une feuille Google Sheets ////////////////
async function readSheet(sheetId, onglet) {
    const sheets = await getSheets();
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${onglet}!A2:D`, // A2:D pour récupérer les colonnes A à D
    });
    const source = res.data.values || [];
    return source.map(row => ({
        motFr: row[0] || "",
        motRo: row[1] || "",
        tentatives: parseInt(row[2]) || 0, // Colonne C
        reussites: parseInt(row[3]) || 0, // Colonne D
        appris: row[4] === "oui", // Colonne E pour savoir si appris
    }));
}


/////////////// Générer le son à partir du texte reçu ///////////////////
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


async function getSheets() {
    const client = await auth.getClient();
    return google.sheets({ version: "v4", auth: client });
}


app.get("/api/getWord", async (req, res) => {
    console.log("Tirage d'un mot parmi ceux déjà appris");
    try {
        const SHEET_ID = req.query.sheetId;
        const onglet = req.query.onglet;
        const sheets = await getSheets();
        const resData = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${onglet}!A2:F`,
        });

        const source = resData.data.values || [];
        if (source.length === 0) {
            return res.status(400).json({ error: `Aucun mot trouvé dans l'onglet ${onglet}` });
        }

        // Associer chaque ligne à son index d’origine
        const avecIndex = source.map((row, index) => ({ index, row }));

        // Garder uniquement les mots appris (colonne E === "oui")
        const appris = avecIndex.filter(({ row }) => row[4] === "oui");
        if (appris.length === 0) {
            return res.status(400).json({ error: `Aucun mot appris trouvé dans l'onglet ${onglet}` });
        }
        console.log(`Nombre de mots appris : ${appris.length}`);

        // Calculer le % : mots avec la dernière réussite / total appris
        const maitrises = appris.filter(({ row }) => row[5] === "OK").length;
        console.log(`Nombre de mots maîtrisés : ${maitrises}`);

        const tauxReussite = Math.round((maitrises / appris.length) * 100);
        console.log(`Taux de réussite : ${tauxReussite}%`);

        // Construire tableau avec poids
        const data = appris.map(({ index, row }) => {
            const [fr, ro, tentativeStr, reussiteStr, apprisStr, derniereStr] = row;
            const tentatives = parseInt(tentativeStr) || 0;
            const reussites = parseInt(reussiteStr) || 0;
            const déjàAppris = apprisStr === "oui"; // non utilisé dans le calcul
            const derniere = derniereStr || "KO";
            return {
                index,
                motFr: fr,
                motRo: ro,
                poids: calculerPoids(tentatives, reussites, derniere),
            };
        });

        const totalPoids = data.reduce((acc, el) => acc + el.poids, 0);
        let r = Math.random() * totalPoids;
        const selected = data.find((el) => (r -= el.poids) < 0) || data[0];
        // console.log(`liste de mots avec coefficients : ${data.map(el => `${el.motFr} (${el.poids})`).join(", ")}`);

        res.json({ index: selected.index, motFr: selected.motFr, tauxReussite, maitrises });
        console.log(`Mot tiré: ${selected.motFr} (index: ${selected.index})`);

    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
});


////////////// Calcul pondération : plus un mot a d’erreurs KO, plus il a de poids //////////////
function calculerPoids(tentatives, reussites, derniere) {
    if (!tentatives || tentatives === 0) return 20; // Jamais demandé
    if (derniere === "KO") return 20; // Dernière réponse KO
    const taux = reussites / tentatives;
    return 1 + Math.round((1 - taux) * 4); // Entre 1 (100% réussite) et 5 (0%)
}


////////////// Envoi de la réponse et du résultat ////////////////
app.post("/api/sendAnswer", async (req, res) => {
    try {
        const { index, reponse, premier } = req.body;
        const onglet = req.query.onglet;
        const SHEET_ID = req.query.sheetId;

        console.log(`Demande de réponse pour l'onglet ${onglet}, index ${index}`);

        const sheets = await getSheets();
        const source = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${onglet}!A2:F`,
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
        let derniere = "KO";
        let appris = "oui";

        console.log(`Première tentative: ${premier}`);
        if (premier) {
            console.log("C'est une première tentative");
            tentatives += 1;
            if (isCorrect) reussites += 1;
            if (isCorrect) derniere = "OK";

            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${onglet}!C${ligne}:F${ligne}`,
                valueInputOption: "RAW",
                requestBody: {
                    values: [[tentatives, reussites, appris, derniere]],
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
    const SHEET_ID = req.query.sheetId;
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
                range: `${onglet}!A:B`,
                valueInputOption: "RAW",
                requestBody: {
                    values: [[motFr, motRo]],
                },
            });
            res.json({ message: "Mot ajouté" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur");
    }
});


////////////////// Retirer les accents pour comparer les mots ////////////////
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


/////////////// Démarrer le serveur ////////////////
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
