import { useEffect, useState } from "react";

export default function App() {
  const [mot, setMot] = useState("");
  const [index, setIndex] = useState(null);
  const [reponse, setReponse] = useState("");
  const [etat, setEtat] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFr, setNewFr] = useState("");
  const [newRo, setNewRo] = useState("");
  const [corrigerMode, setCorrigerMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [historiqueReponses, setHistoriqueReponses] = useState([]);

  const API = process.env.REACT_APP_API;

  // Tirer un mot depuis le backend
  async function getWord() {
    setLoading(true);
    const res = await fetch(`${API}/api/getWord`);
    const data = await res.json();
    setMot(data.motFr);
    setIndex(data.index);
    setReponse("");
    setEtat("");
    setCorrigerMode(false);
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
    setEtat(data.resultat === "OK" ? "✅ Correct !" : "❌ Faux !");
    const estCorrect = data.resultat === "OK";

    // Ajoute la nouvelle réponse, et garde les 100 dernières
    setHistoriqueReponses(prev => {
      const updated = [...prev, estCorrect];
      return updated.length > 100 ? updated.slice(updated.length - 100) : updated;
    });

    setLoading(false);

    if (data.resultat === "OK") {
      setEtat("✅ Correct !");
      jouerPrononciation(data.bonneReponse);
      setTimeout(getWord, 1500);
    } else {
      setEtat(`❌ Faux ! La bonne réponse était : ${data.bonneReponse}`);
      jouerPrononciation(data.bonneReponse);
      setCorrigerMode(true);
    }

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

  function prononcer(texte) {
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(texte);
    // Choisir une voix roumaine si dispo
    const voixRoumaine = synth.getVoices().find(v => v.lang.startsWith("ro"));
    if (voixRoumaine) utterance.voice = voixRoumaine;
    utterance.lang = "ro-RO"; // Langue roumaine
    synth.speak(utterance);
  }

  const score = historiqueReponses.filter(r => r).length;

  return (
    <div className="min-h-screen bg-yellow-50 p-4 flex flex-col items-center justify-start overflow-auto">
      <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-center">
        Traduction Français → Roumain
      </h1>

      {historiqueReponses.length > 0 && (
        <div className="text-lg mt-2">
          Score : {score}/{historiqueReponses.length} bonnes réponses
        </div>
      )}

      <div className="text-xl sm:text-2xl mb-2">{mot}</div>

      <input
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
    ${loading ? "bg-gray-400" : "bg-green-500 hover:bg-green-600"} 
    text-white`}
      >
        {loading ? "..." : "Valider"}
      </button>

      {etat && <p className="mt-2 text-xl">{etat}</p>}

      {corrigerMode && (
        <button
          onClick={() => {
            setCorrigerMode(false);
            setReponse("");
            setEtat("");
          }}
          className="mt-2 text-sm underline text-blue-700"
        >
          Réessayer ce mot
        </button>
      )}

      {/* Ligne de séparation */}
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
        {showAddForm ? "Annuler ajout" : "Ajouter un mot"}
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
            {loading ? "Ajout..." : "Ajouter"}
          </button>
        </div>
      )}
    </div>
  );
}
