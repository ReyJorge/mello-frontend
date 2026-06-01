// 📁 /components/OtpVerify.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { getPostAuthPath } from "../utils/authRedirect";

interface Props {
  phone: string;
}

export default function OtpVerify({ phone }: Props) {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  const handleVerify = async () => {
    setMessage("");
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: "sms",
    });
    if (error) {
      setMessage("❌ " + error.message);
    } else {
      const path = await getPostAuthPath();
      navigate(path);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">Zadejte ověřovací kód</h2>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        autoComplete="one-time-code"
        className="mb-2 w-full border p-2 text-center tracking-widest"
        placeholder="••••••"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button
        onClick={handleVerify}
        className="bg-green-600 text-white px-4 py-2 rounded w-full"
      >
        Ověřit kód
      </button>
      {message && (
        <p className="mt-4 text-sm text-center text-gray-700">{message}</p>
      )}
    </div>
  );
}
