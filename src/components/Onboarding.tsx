import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";

export default function Onboarding() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [voice, setVoice] = useState("vera");
  const [language, setLanguage] = useState("cs");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const loadUserAndProfile = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setChecking(false);
        return;
      }

      setUser(session.user);

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("name, voice, language")
        .eq("id", session.user.id)
        .single();

      if (profileError && profileError.code !== "PGRST116") {
        setMessage("Chyba při načítání profilu. Zkuste obnovit stránku.");
        setChecking(false);
        return;
      }

      if (profile?.name?.trim()) {
        navigate("/chat", { replace: true });
        return;
      }

      if (profile) {
        setName(profile.name || "");
        setVoice(profile.voice || "vera");
        setLanguage(profile.language || "cs");
      }

      setChecking(false);
    };

    loadUserAndProfile();
  }, [navigate]);

  const handleSave = async () => {
    if (!user?.id) {
      setMessage("Nejste přihlášeni. Přejděte na přihlášení.");
      return;
    }

    if (!name.trim()) {
      setMessage("Prosím zadejte vaše jméno.");
      return;
    }

    setLoading(true);
    setMessage(null);

    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      name: name.trim(),
      voice: voice || "vera",
      language: language || "cs",
    });

    setLoading(false);

    if (error) {
      setMessage("Chyba při ukládání: " + error.message);
    } else {
      navigate("/chat", { replace: true });
    }
  };

  if (checking) {
    return (
      <p className="text-center py-12 text-lg text-gray-600">
        Načítám váš profil…
      </p>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12 px-6 max-w-md mx-auto">
        <p className="text-lg text-gray-700 mb-6">
          Nejste přihlášeni. Pokud jste se právě zaregistrovali, potvrďte
          registraci v e-mailu.
        </p>
        <Link
          to="/signin"
          className="text-blue-700 text-lg font-semibold underline min-h-[44px] inline-block"
        >
          Přihlásit se
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-6">Nastavení profilu</h2>

      {message && (
        <p className="mb-4 text-red-700 text-lg text-center" role="alert">
          {message}
        </p>
      )}

      <label className="block text-lg text-gray-800 mb-2" htmlFor="name">
        Vaše jméno
      </label>
      <input
        id="name"
        className="mb-6 w-full border-2 p-4 text-lg rounded-xl"
        placeholder="Jméno"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <label htmlFor="voice" className="block text-lg text-gray-800 mb-2">
        Hlas Melloty
      </label>
      <select
        id="voice"
        className="mb-6 w-full border-2 p-4 text-lg rounded-xl"
        value={voice}
        onChange={(e) => setVoice(e.target.value)}
      >
        <option value="vera">Věra</option>
        <option value="eliska">Eliška</option>
      </select>

      <label htmlFor="language" className="block text-lg text-gray-800 mb-2">
        Jazyk
      </label>
      <select
        id="language"
        className="mb-8 w-full border-2 p-4 text-lg rounded-xl"
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
      >
        <option value="cs">Čeština</option>
        <option value="en">English</option>
      </select>

      <button
        type="button"
        className="bg-green-600 text-white min-h-[52px] w-full px-4 py-3 text-lg font-semibold rounded-xl disabled:opacity-50"
        onClick={handleSave}
        disabled={loading}
      >
        {loading ? "Ukládám…" : "Uložit a začít povídat"}
      </button>
    </div>
  );
}
