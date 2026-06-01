// 📁 /pages/PhoneAuth.tsx
import { useState } from "react";
import PhoneLogin from "../components/PhoneLogin";
import OtpVerify from "../components/OtpVerify";

export default function PhoneAuth() {
  const [step, setStep] = useState<"phone" | "verify">("phone");
  const [phone, setPhone] = useState("");

  return (
    <div className="min-h-screen flex flex-col justify-center">
      {step === "phone" ? (
        <PhoneLogin
          phone={phone}
          setPhone={setPhone}
          onSent={() => setStep("verify")}
        />
      ) : (
        <OtpVerify phone={phone} />
      )}
    </div>
  );
}
