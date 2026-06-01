import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { supabase } from "../utils/supabaseClient";

const navLinkClass =
  "inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-lg font-medium text-blue-800 rounded-lg hover:bg-blue-50";

export default function Layout({ children, mainClassName = "" }) {
  const { user } = useUser();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
      <nav className="bg-white shadow-md px-4 py-3">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/"
            className="text-2xl font-bold text-emerald-800 min-h-[44px] flex items-center"
          >
            Mello
          </Link>

          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            <Link to="/" className={navLinkClass}>
              Domů
            </Link>
            <Link to="/chat" className={navLinkClass}>
              Povídat
            </Link>
            <Link to="/family" className={navLinkClass}>
              Deník
            </Link>

            <button
              type="button"
              className={`${navLinkClass} sm:hidden`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              Více
            </button>

            <div
              className={`${menuOpen ? "flex" : "hidden"} sm:flex w-full sm:w-auto flex-col sm:flex-row gap-1 sm:gap-2 basis-full sm:basis-auto`}
            >
              <Link
                to="/privacy"
                className={navLinkClass}
                onClick={() => setMenuOpen(false)}
              >
                Soukromí
              </Link>
            </div>

            {user ? (
              <button
                type="button"
                onClick={handleLogout}
                className="min-h-[44px] px-4 py-2 text-lg font-medium text-red-700 rounded-lg hover:bg-red-50"
              >
                Odhlásit
              </button>
            ) : (
              <Link
                to="/signin"
                className={`${navLinkClass} bg-blue-600 text-white hover:bg-blue-700 hover:text-white`}
              >
                Přihlásit
              </Link>
            )}
          </div>
        </div>
      </nav>

      <main className={`p-4 pb-8 flex-1 ${mainClassName}`.trim()}>
        {children}
      </main>

      <footer className="border-t bg-white px-4 py-4 text-center text-base text-gray-600">
        <Link to="/privacy" className="text-blue-700 underline min-h-[44px] inline-flex items-center">
          Co si Mello ukládá
        </Link>
      </footer>
    </div>
  );
}
