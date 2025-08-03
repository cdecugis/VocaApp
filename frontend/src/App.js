import { useEffect, useState, useRef } from "react";

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
  const [onglet, setOnglet] = useState(null); // null au départ

  const API = process.env.REACT_APP_API || "http://localhost:3001";

  const playSound = (type) => {
    const audio = new Audio(type === "OK" ? "success.mp3" : "failure.mp3");
    audio.volume = type === "OK" ? 0.2 : 0.5;
    audio.play();
  };

  async function getWord() {
    if (!onglet) return;

    setLoading(true);
    const res = await fetch(`${API}/api/getWord?onglet=${onglet}`);
    if (!res.ok) {
      const errorText = await res.text();
      console.error("Backend error:", errorText);
      throw new Error(errorText);
    }
    const data = await res.json();
    setMot(data.motFr);
    setIndex(data.index);
    setReponse("");
    setEtat("");
    setCorrigerMode(false);
    inputRef.current?.focus();
    setLoading(false);
  }

  async function valider() {
    if (index === null || loading) return;
    setLoading(true);

    const res = await fetch(`${API}/api/sendAnswer?onglet=${onglet}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index, reponse }),
    });

    const data = await res.json();
    playSound(data.resultat);

    setBonneReponse(data.bonneReponse);
    setStatMot(data.stats); // même si faux
    jouerPrononciation(data.bonneReponse);

    if (data.resultat === "OK") {
      setEtat(`✅ Correct ! : ${data.bonneReponse}`);
      setTimeout(() => {
        getWord();                  // charger mot suivant
        setReponse("");             // vider champ
        setEtat("");
        setCorrigerMode(false);
        setStatMot(null);
      }, 2000);
    } else {
      setEtat(`❌ Faux ! La bonne réponse était : ${data.bonneReponse}`);
      setCorrigerMode(true);
    }

    setLoading(false);
  }

  async function ajouterMot() {
    if (!newFr.trim() || !newRo.trim()) return alert("Remplis les deux champs");
    setLoading(true);
    await fetch(`${API}/api/addWord?onglet=${onglet}`, {
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
    if (onglet) getWord();
  }, [onglet]);

  return (
    <div className="min-h-screen bg-blue-50 p-4 flex flex-col items-center justify-start overflow-auto">
      <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-center">
        Traduction Français → Roumain
      </h1>

      <div className="flex space-x-2 my-4">
        <button
          onClick={() => setOnglet("lexique")}
          className={`px-4 py-2 rounded font-semibold ${onglet === "lexique" ? "bg-blue-600 text-white" : "bg-white text-blue-600 border border-blue-600"
            }`}
        >
          Lexique
        </button>
        <button
          onClick={() => setOnglet("verbes")}
          className={`px-4 py-2 rounded font-semibold ${onglet === "verbes" ? "bg-blue-600 text-white" : "bg-white text-blue-600 border border-blue-600"
            }`}
        >
          Verbes
        </button>
      </div>

      {!onglet ? (
        <p className="mt-4 text-gray-700 text-lg">Choisissez un onglet pour commencer.</p>
      ) : (
        <>
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
        </>
      )}

      {etat && <p className="mt-2 text-xl">{etat}</p>}

      {statMot && (
        <div className="mt-4 text-sm text-gray-600">
          <p>{statMot.reussites} / {statMot.tentatives} ({statMot.pourcentage}%)</p>
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
