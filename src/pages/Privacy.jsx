import Layout from "../components/Layout";

export default function Privacy() {
  return (
    <Layout>
      <article className="max-w-2xl mx-auto bg-white rounded-2xl shadow-md p-6 sm:p-8 space-y-6 text-lg leading-relaxed text-gray-800">
        <h1 className="text-3xl font-bold text-emerald-800">
          Soukromí a vaše data
        </h1>

        <p>
          Mello je váš digitální společník. Chceme, abyste věděli, co si
          ukládáme a proč.
        </p>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">
            Co si Mello může ukládat
          </h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Vaše jméno a nastavení profilu</strong> — abychom vás
              oslovovali přirozeně a podle vašich preferencí.
            </li>
            <li>
              <strong>Historii rozhovoru</strong> — abychom si pamatovali, o
              čem jste spolu mluvili, a nemuseli vše opakovat.
            </li>
            <li>
              <strong>Vzpomínky v rodinném deníku</strong> — pouze pokud s
              uložením sami souhlasíte.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">
            K čemu data slouží
          </h2>
          <p>
            Data používáme jen k tomu, aby vám Mello lépe rozumělo a mohlo s
            vámi navázat tam, kde jste skončili. Nepoužíváme je k reklamě ani
            k prodeji třetím stranám.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">
            Smazání vašich dat
          </h2>
          <p>
            Máte právo požádat o smazání svého účtu a všech uložených dat.
          </p>
          {/* TODO: implementovat endpoint / admin flow pro smazání účtu a dat */}
          <p className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
            Možnost smazání dat připravujeme. Do té doby nás můžete kontaktovat
            e-mailem uvedeným u vašeho účtu.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">
            Bezpečnost
          </h2>
          <p>
            Vaše data ukládáme v zabezpečené databázi. Přístup k vašim
            rozhovorům máte pouze vy po přihlášení.
          </p>
        </section>
      </article>
    </Layout>
  );
}
