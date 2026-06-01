import React from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
export default function Home() {
  const playVoice = () => {
    const audio = new Audio("/mello-uvitani.mp3");
    audio.play();
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-12 px-6 text-center">
        <div className="flex flex-col md:flex-row items-center gap-8 mb-12">
          <img
            src="/teta-mello.png"
            alt="Mello"
            className="w-48 h-auto rounded-full shadow-md border border-gray-300"
          />
          <div className="text-left">
            <h2 className="text-3xl font-bold text-blue-900 mb-2">Mello</h2>
            <p className="text-lg text-gray-700 mb-4 max-w-md">
              Dobrý den, jsem Mello. Jsem tu pro vás, když potřebujete poradit,
              popovídat si nebo se jen necítíte dobře.
            </p>
            <button
              onClick={playVoice}
              className="bg-blue-600 text-white font-medium min-h-[48px] px-6 py-3 rounded-lg shadow hover:bg-blue-700 transition text-lg"
            >
              Poslechnout Mellu
            </button>
            <div className="mt-2">
              {/* <Link
                to="/phone"
                className="text-blue-700 underline hover:text-blue-900"
              >
                Přihlášení telefonem
              </Link> */}
            </div>
          </div>
        </div>

        <Link
          to="/chat"
          className="inline-block bg-emerald-600 text-white text-lg font-medium px-6 py-3 rounded-xl shadow hover:bg-emerald-700 transition"
        >
          Povídat si s Mellou
        </Link>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6 text-left">
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-xl font-semibold mb-2 text-emerald-700">
              Potřebuji si popovídat
            </h3>
            <p className="text-gray-600">
              Mello je připravena naslouchat vašim radostem i starostem.
            </p>
          </div>
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-xl font-semibold mb-2 text-indigo-700">
              Zajímá mě, co umím
            </h3>
            <p className="text-gray-600">
              Můžete se zapsat, co nabízíte nebo hledáte – třeba výměnu
              dovedností.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
