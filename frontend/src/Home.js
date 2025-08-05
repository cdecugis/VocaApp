import { useState } from "react";
import { useNavigate } from "react-router-dom";


export default function Home() {
    const [identifiant, setIdentifiant] = useState("");
    const [erreur, setErreur] = useState("");
    const navigate = useNavigate();

    async function handleConnexion() {
        if (!identifiant.trim()) return;

        const res = await fetch(`/api/login?identifiant=${identifiant}`);
        if (res.ok) {
            const { sheetId } = await res.json();
            localStorage.setItem("sheetId", sheetId); // stocker temporairement l'ID
            localStorage.setItem("identifiant", identifiant);
            navigate("/app");
        } else {
            setErreur("Identifiant inconnu");
        }
    }

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Connexion</h1>
            <input
                className="border px-4 py-2 mb-2 w-full"
                placeholder="Entrez votre identifiant"
                value={identifiant}
                onChange={(e) => setIdentifiant(e.target.value)}
            />
            <button onClick={handleConnexion} className="bg-blue-600 text-white px-4 py-2 rounded">
                Se connecter
            </button>
            {erreur && <p className="text-red-600 mt-2">{erreur}</p>}
        </div>
    );
}
