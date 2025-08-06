process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:', err);
});

export default function App() {
  const [mot, setMot] = useState("");
  const [index, setIndex] = useState(null);
  const [reponse, setReponse] = useState("");
  const [etat, setEtat] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFr, setNewFr] = useState("");
  const [newRo, setNewRo] = useState("");
  const [bonneReponse, setBonneReponse] = useState("");
  const [corrigerMode, setCorrigerMode] = useState(false);
  const [premier, setPremier] = useState(true);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const [statMot, setStatMot] = useState(null);
  const [onglet, setOnglet] = useState(null); // null au départ
  const [nouveauxMots, setNouveauxMots] = useState([]);
  const [indexNouveau, setIndexNouveau] = useState(0);
  const [modeNouveaux, setModeNouveaux] = useState(false);
  const [taux, setTaux] = useState(0); // taux de réussite du lexique
  const [maitrise, setMaitrise] = useState(0);

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

  ///////////////// Fonction pour marquer un mot comme appris //////////////
  async function appris(motFr) {
    console.log("Marquer mot comme appris :", motFr);
    if (motFr === null || loading) return;
    setLoading(true);
    const sheetId = localStorage.getItem("sheetId");
    const res = await fetch(`${API}/api/markAsLearned?sheetId=${sheetId}&onglet=${onglet}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motFr }),
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error("Backend error:", errorText);
      throw new Error(errorText);
    }
    const data = await res.json();
    console.log("Mot marqué comme appris :", data);
    setLoading(false);
  }


  ///////////////// Récupération d'un mot aléatoire selon les mots déjà appris //////////////
  async function getWord() {
    if (!onglet) return;
    setLoading(true);
    const sheetId = localStorage.getItem("sheetId");
    try {
      const res = await fetch(`${API}/api/getWord?sheetId=${sheetId}&onglet=${onglet}`);
      const data = await res.json();
      setMot(data.motFr);
      setIndex(data.index);
      setReponse("");
      setEtat("");
      setCorrigerMode(false);
      setPremier(true);
      inputRef.current?.focus();
      setLoading(false);
      setMaitrise(data.maitrise);
      setTaux(data.tauxReussite || 0); // mettre à jour le taux de réussite
    } catch (err) {
      console.error("Erreur lors de la récupération du mot :", err);
      setMot("Lancez l'apprentissage de nouveaux mots !");
      setLoading(false);
      return;
    }
  }


  ////////////// Fonction pour vérifier la réponse ////////////////
  async function valider() {
    if (index === null || loading) return;
    setLoading(true);
    console.log(`Première tentative: ${premier}`);
    const sheetId = localStorage.getItem("sheetId");
    const res = await fetch(`${API}/api/sendAnswer?sheetId=${sheetId}&onglet=${onglet}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index, reponse, premier }),
    });

    const data = await res.json();
    playSound(data.resultat);

    setBonneReponse(data.bonneReponse);
    setStatMot(data.stats); // même si faux
    prononce(data.bonneReponse);

    if (data.resultat === "OK") {
      setEtat(`✅ Correct ! : ${data.bonneReponse}`);
      setTimeout(() => {
        getWord();                  // charger mot suivant
        setReponse("");             // vider champ
        setEtat("");
        setCorrigerMode(false);
        setPremier(false);
        setStatMot(null);
      }, 2000);
    } else {
      setEtat(`❌ Faux ! La bonne réponse était : ${data.bonneReponse}`);
      setCorrigerMode(true);
      setPremier(false);
    }
    console.log(`Premier mot: ${premier}`);

    setLoading(false);
  }


  /////////////// Fonction pour prononcer le mot ///////////////
  async function prononce(texte) {
    const res = await fetch(`${API}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: texte }),
    });

    if (!res.ok) return;

    const blob = await res.blob();
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.play();
  }


  /////////////// Fonction pour traduire le mot en français vers le roumain ////////////////
  async function traduireMot() {
    if (!newFr.trim()) return;

    try {
      const res = await fetch(`${API}/api/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte: newFr }),
      });
      const data = await res.json();
      setNewRo(data.traduction.toLowerCase() || "");

    } catch (err) {
      alert("Erreur de traduction automatique.");
      console.error(err);
    }
  }


  ////////////////// Fonction pour ajouter un mot au dictionnaire /////////////////
  async function ajouterMot() {
    if (!newFr.trim() || !newRo.trim()) return alert("Remplis les deux champs");
    setLoading(true);
    const sheetId = localStorage.getItem("sheetId");
    await fetch(`${API}/api/addWord?sheetId=${sheetId}&onglet=${onglet}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motFr: newFr.trim(), motRo: newRo.trim() }),
    });
    setLoading(false);
    setNewFr("");
    setNewRo("");
    setShowAddForm(false);
  }

  useEffect(() => {
    if (onglet) getWord();
  }, [onglet]);

  function handleDeconnexion() {
    localStorage.removeItem("sheetId");
    localStorage.removeItem("identifiant");
    navigate("/");
  }


  function BoutonNouveauxMots({ onClick }) {
    let bgColor = "bg-gray-400 hover:bg-gray-400"; // < 70%
    let texte = "Nouveaux Mots (Vous n'êtes pas encore prêt !)";
    let disabled = false;

    if (taux >= 100) {
      bgColor = "bg-pink-600 hover:bg-pink-700";
      texte = "Nouveaux Mots (Perfection atteinte !!!)";
      disabled = false;
    } else if (taux >= 90) {
      bgColor = "bg-green-500 hover:bg-green-600";
      texte = "Nouveaux Mots (Vous êtes prêts !)";
      disabled = false;
    } else if (taux >= 70) {
      bgColor = "bg-yellow-500 hover:bg-yellow-600";
      texte = "Nouveaux Mots (Vous êtes presque prêt...)";
      disabled = false;
    }

    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`mt-3 font-semibold px-6 py-2 rounded transition w-full max-w-md text-white ${bgColor} ${disabled ? "cursor-not-allowed opacity-60" : ""
          }`}
      >
        {texte}
      </button>
    );
  }


  ////////////////// Affichage de l'interface //////////////////
  return (
    <div className="min-h-screen bg-blue-50 p-4 flex flex-col items-center justify-start overflow-auto">
      <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-center">
        User <span className="text-blue-600">{localStorage.getItem("identifiant")}</span>
        <br />
        Français → Roumain {maitrises} mots appris
      </h1>
      <button
        onClick={handleDeconnexion}
        className="absolute top-4 right-4 bg-red-600 text-white px-4 py-2 rounded"
      >
        Déconnexion
      </button>

      <div className="flex flex-wrap gap-2 my-4 max-w-md">
        <button
          onClick={() => setOnglet("lexique")}
          className={`px-4 py-2 rounded font-semibold ${onglet === "lexique"
            ? "bg-blue-600 text-white"
            : "bg-white text-blue-600 border border-blue-600"
            }`}
        >
          {onglet === "lexique" ? `Lexique (${taux} %)` : "Lexique"}
        </button>
        <button
          onClick={() => setOnglet("verbes")}
          className={`px-4 py-2 rounded font-semibold ${onglet === "verbes"
            ? "bg-blue-600 text-white"
            : "bg-white text-blue-600 border border-blue-600"
            }`}
        >
          {onglet === "verbes" ? `Verbes (${taux} %)` : "Verbes"}
        </button>
        <button
          onClick={() => setOnglet("démonstratifs")}
          className={`px-4 py-2 rounded font-semibold ${onglet === "démonstratifs"
            ? "bg-blue-600 text-white"
            : "bg-white text-blue-600 border border-blue-600"
            }`}
        >
          {onglet === "démonstratifs" ? `Démonstratifs (${taux} %)` : "Démonstratifs"}
        </button>
        <button
          onClick={() => setOnglet("possessifs")}
          className={`px-4 py-2 rounded font-semibold ${onglet === "possessifs"
            ? "bg-blue-600 text-white"
            : "bg-white text-blue-600 border border-blue-600"
            }`}
        >
          {onglet === "possessifs" ? `Possessifs (${taux} %)` : "Possessifs"}

        </button>
      </div>

      {!onglet ? (
        <p className="mt-4 text-gray-700 text-lg">Choisissez un onglet pour commencer !</p>
      ) : (
        <>
          <div
            hidden={modeNouveaux || loading}
            className="text-xl sm:text-2xl mb-2">{mot}
          </div>
          <input
            ref={inputRef}
            tabIndex={0}
            hidden={modeNouveaux || loading}
            className="border rounded p-2 w-full max-w-md"
            type="text"
            value={reponse}
            onChange={(e) => setReponse(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && valider()}
            disabled={corrigerMode}
            placeholder="Écris la traduction en roumain"
          />

          <button
            onClick={valider}
            disabled={corrigerMode || loading || modeNouveaux}
            hidden={modeNouveaux || loading}
            className={`mt-3 font-semibold px-6 py-2 rounded transition 
        ${loading ? "bg-gray-400" : "bg-green-500 hover:bg-green-600 w-full max-w-md"} 
        text-white`}
          >
            {loading ? "..." : "Valider"}
          </button>

          <BoutonNouveauxMots
            onClick={lancerNouveauxMots}
            hidden={modeNouveaux || corrigerMode || loading}
          />
        </>
      )}

      {etat && <p className="mt-2 text-xl">{etat}</p>}

      {statMot && (
        <div className="mt-4 text-sm text-gray-600">
          <p>{statMot.reussites} / {statMot.tentatives} ({statMot.pourcentage}%)</p>
        </div>
      )}

      {modeNouveaux && (
        <div>
          <h2 className="text-xl font-bold mb-2">Mot {indexNouveau + 1} / {nouveauxMots.length}</h2>
          <p className="text-2xl mb-4">{nouveauxMots[indexNouveau].motFr} → {nouveauxMots[indexNouveau].motRo}</p>
          <button
            onClick={() => {
              const next = indexNouveau + 1;
              if (next < nouveauxMots.length) {
                setIndexNouveau(next);
                prononce(nouveauxMots[next].motRo);
                appris(nouveauxMots[next].motFr); // marquer le mot comme appris
              } else {
                // fin des 10 mots → retour au mode normal
                setModeNouveaux(false);
                getWord(); // ton tirage normal
              }
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded"
          >
            Suivant
          </button>
          <button
            onClick={() => {
              setModeNouveaux(false);
              getWord(); // revenir au mot normal
            }}
            className="ml-2 px-4 py-2 bg-gray-300 text-gray-800 rounded"
          >
            Annuler
          </button>
        </div>
      )}

      {corrigerMode && (
        <div className="mt-2 flex space-x-3">
          <button
            onClick={() => {
              setCorrigerMode(false);
              setEtat("");
              setStatMot(null);
            }}
            className="text-sm bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 py-1 rounded"
          >
            Réessayer ce mot
          </button>

          <button
            onClick={() => {
              setShowAddForm(true);
              setNewFr(mot);
              setNewRo(bonneReponse);
            }}
            className="text-sm bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-1 rounded"
          >
            Corriger Dictionnaire
          </button>
        </div>
      )}

      <hr className="my-4 w-full max-w-md border-gray-300" />

      <button
        onClick={() => setShowAddForm(!showAddForm)}
        hidden={onglet == null}
        className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-2 rounded w-full max-w-md"
      >
        {showAddForm ? "Annuler correction" : "Ajouter un mot"}
      </button>

      {showAddForm && (
        <div className="mt-4 w-full max-w-md flex flex-col space-y-3">
          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="Mot en français"
              value={newFr}
              onChange={(e) => setNewFr(e.target.value)}
              className="border rounded p-2 flex-grow"
            />
            <button
              onClick={traduireMot}
              className="bg-gray-300 hover:bg-gray-400 text-sm px-2 py-1 rounded"
            >
              Traduire
            </button>
          </div>
          <input
            type="text"
            placeholder="Traduction en roumain"
            value={newRo}
            onChange={(e) => setNewRo(e.target.value)}
            className="border rounded p-2"
          />
          <button
            onClick={ajouterMot}
            disabled={loading}
            className={`bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded transition 
            ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {loading ? "Corr..." : "Corriger"}
          </button>
        </div>
      )}
    </div>
  );
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