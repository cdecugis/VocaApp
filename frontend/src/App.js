import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

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
  const [maitrises, setMaitrises] = useState(0);

  const API = process.env.REACT_APP_API || "http://localhost:3001";
  const navigate = useNavigate();

  const playSound = (type) => {
    const audio = new Audio(type === "OK" ? "success.mp3" : "failure.mp3");
    audio.volume = type === "OK" ? 0.3 : 0.5;
    audio.play();
  };

  /////////////////// Fonction pour lancer l'apprentissage de 10 nouveaux mots ////////////////
  async function lancerNouveauxMots() {
    const sheetId = localStorage.getItem("sheetId");
    const res = await fetch(`/api/learnNewWords?sheetId=${sheetId}&onglet=${onglet}`);
    const data = await res.json();
    console.log("Nouveaux mots tirés :", data);
    setNouveauxMots(data);
    setIndexNouveau(0);
    setModeNouveaux(true);
    prononce(data[0].motRo); // prononcer le 1er mot
  }


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
      setMaitrises(data.maitrises);
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
        Français → Roumain ({maitrises} mots appris)
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
