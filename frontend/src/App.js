import { useEffect, useState } from "react";
import { useRef } from "react";

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
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const [statMot, setStatMot] = useState(null);

  const API = process.env.REACT_APP_API || "http://localhost:3001";

  const playSound = (type) => {
    const audio = new Audio(
      type === "OK"
        ? "success.mp3"
        : "failure.mp3"
    );
    if (type === "OK") {
      audio.volume = 0.2;
    } else {
      audio.volume = 0.5;
    }
    audio.play();
  };

  // Tirer un mot depuis le backend
  async function getWord() {
    setLoading(true);
    console.log("API = ", API); // ex: http://localhost:3001
    const res = await fetch(`${API}/api/getWord`);
    const data = await res.json();
    setMot(data.motFr);
    setIndex(data.index);
    setReponse("");
    setEtat("");
    setCorrigerMode(false);
    inputRef.current?.focus();
    // Ne PAS effacer statMot ici
    setLoading(false);
  }

  // Valider la réponse
  async function valider() {
    if (index === null || loading) return;
    setLoading(true);
    const res = await fetch(`${API}/api/sendAnswer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index, reponse }),
    });

    const data = await res.json();

    playSound(data.resultat); // Son OK ou KO

    if (data.resultat === "OK") {
      setEtat(`✅ Correct ! : ${data.bonneReponse}`);
      setStatMot(data.stats);  // Affiche les stats du mot
      jouerPrononciation(data.bonneReponse);
    } else {
      setEtat(`❌ Faux ! La bonne réponse était : ${data.bonneReponse}`);
      setStatMot(data.stats);  // Affiche aussi stats même en KO
      jouerPrononciation(data.bonneReponse);
      setCorrigerMode(true);
    }
    setLoading(false);
    setBonneReponse(data.bonneReponse);
  }

  // Ajouter un nouveau mot
  async function ajouterMot() {
    if (!newFr.trim() || !newRo.trim()) return alert("Remplis les deux champs");
    setLoading(true);
    await fetch(`${API}/api/addWord`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motFr: newFr.trim(), motRo: newRo.trim() }),
    });
    setLoading(false);
    setNewFr("");
    setNewRo("");
    setShowAddForm(false);
    alert("Mot ajouté !");
  }

  // Jouer la prononciation du mot
  async function jouerPrononciation(texte) {
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

  useEffect(() => {
    getWord();
  }, []);



  return (
    <div className="min-h-screen bg-blue-50 p-4 flex flex-col items-center justify-start overflow-auto">
      <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-center">
        Traduction Français → Roumain
      </h1>

      <div className="text-xl sm:text-2xl mb-2">{mot}</div>

      <input
        ref={inputRef}
        tabIndex={0}
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
        disabled={corrigerMode || loading}
        className={`mt-3 font-semibold px-6 py-2 rounded transition 
      ${loading ? "bg-gray-400" : "bg-green-500 hover:bg-green-600 w-full max-w-md"} 
      text-white`}
      >
        {loading ? "..." : "Valider"}
      </button>

      {etat && <p className="mt-2 text-xl">{etat}</p>}

      {statMot && (
        <div className="mt-4 text-sm text-gray-600">
          <p>{statMot.tentatives} / {statMot.reussites} ( {statMot.pourcentage}% )</p>
        </div>
      )}

      {corrigerMode && (
        <div className="mt-2 flex space-x-3">
          <button
            onClick={() => {
              setCorrigerMode(false);
              setEtat("");
              setStatMot(null); // ← tu veux réinitialiser les stats
              // ⚠️ NE PAS vider setReponse ici
            }}
            className="text-sm bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 py-1 rounded"
          >
            Réessayer ce mot
          </button>

          <button
            onClick={() => {
              setShowAddForm(true);
              setNewFr(mot);  // préremplit avec le mot en cours
              setNewRo(bonneReponse); // ← préremplit avec la bonne réponse
            }}
            className="text-sm bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-1 rounded"
          >
            Corriger Dictionnaire
          </button>
        </div>

      )}

      <hr className="my-4 w-full max-w-md border-gray-300" />

      <button
        onClick={() => getWord()}
        className="mb-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold px-6 py-2 rounded w-full max-w-md"
      >
        Mot suivant
      </button>

      <button
        onClick={() => setShowAddForm(!showAddForm)}
        className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-2 rounded w-full max-w-md"
      >
        {showAddForm ? "Annuler correction" : "Ajouter un mot"}
      </button>

      {showAddForm && (
        <div className="mt-4 w-full max-w-md flex flex-col space-y-3">
          <input
            type="text"
            placeholder="Mot en français"
            value={newFr}
            onChange={(e) => setNewFr(e.target.value)}
            className="border rounded p-2"
          />
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
