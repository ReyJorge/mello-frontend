import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";

import Home from "./pages/Home";
import Chat from "./pages/Chat";
import Skills from "./pages/Skills";
import Family from "./pages/Family";
import PhoneAuth from "./pages/PhoneAuth";
import Privacy from "./pages/Privacy";

import SignIn from "./components/SignIn";
import Onboarding from "./components/Onboarding";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/family" element={<Family />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/phone" element={<PhoneAuth />} />
        <Route path="/privacy" element={<Privacy />} />
      </Routes>
    </Router>
  );
}

export default App;
