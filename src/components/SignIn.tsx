import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { getPostAuthPath } from "../utils/authRedirect";

const AUTH_ERRORS: Record<string, string> = {
  "Invalid login credentials": "Nesprávný e-mail nebo heslo.",
  "User already registered": "Účet s tímto e-mailem už existuje.",
  "Email not confirmed": "Nejdříve potvrďte e-mail z registrace.",
};

function translateAuthError(message: string) {
  return AUTH_ERRORS[message] || message;
}

export default function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    setMessage("");
    setLoading(true);

    if (isRegistering) {
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) {
        setMessage(translateAuthError(error.message));
      } else {
        setMessage(
          "Účet vytvořen. Zkontrolujte e-mail, potvrďte registraci a pak se přihlaste."
        );
      }
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (error) {
      setMessage(translateAuthError(error.message));
      return;
    }

    const path = await getPostAuthPath();
    navigate(path);
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-6">
        {isRegistering ? "Registrace" : "Přihlášení"} do Mello
      </h2>

      <input
        className="mb-4 w-full border-2 p-4 text-lg rounded-xl"
        placeholder="E-mail"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="mb-6 w-full border-2 p-4 text-lg rounded-xl"
        type="password"
        placeholder="Heslo"
        autoComplete={isRegistering ? "new-password" : "current-password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        type="button"
        className="bg-blue-600 text-white min-h-[52px] px-4 py-3 w-full text-lg font-semibold rounded-xl disabled:opacity-50"
        onClick={handleAuth}
        disabled={loading}
      >
        {loading
          ? "Počkejte…"
          : isRegistering
            ? "Registrovat"
            : "Přihlásit se"}
      </button>

      <button
        type="button"
        className="mt-4 text-lg text-blue-700 underline min-h-[44px]"
        onClick={() => {
          setIsRegistering(!isRegistering);
          setMessage("");
        }}
      >
        {isRegistering
          ? "Máte účet? Přihlaste se"
          : "Nemáte účet? Zaregistrujte se"}
      </button>

      {message && (
        <p className="mt-6 text-center text-lg text-gray-800" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
