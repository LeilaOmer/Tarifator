export default function RetragerePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-8">

        <div>
          <a href="/login" className="text-sm text-blue-600 hover:underline">← Inapoi</a>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">Drept de Retragere · Rambursare · Anulare</h1>
          <p className="text-xs text-gray-500 mt-1">OUG 34/2014 (modificata prin Legea 240/2020) · Ultima actualizare: Iulie 2026</p>
        </div>

        <Section title="1. Dreptul de retragere (14 zile)">
          <p>In conformitate cu OUG nr. 34/2014 privind drepturile consumatorilor in cadrul contractelor incheiate cu profesionistii, aveti dreptul de a va retrage din contractul de abonament <strong>in termen de 14 zile calendaristice</strong> de la data incheierii contractului (data confirmarii activarii abonamentului platit), fara a fi necesar sa indicati un motiv si fara penalitati.</p>

          <p className="mt-3 font-semibold text-gray-700">Exceptie aplicabila serviciilor digitale cu executie imediata</p>
          <p className="mt-1">Conform Art. 16 lit. a) din OUG 34/2014, dreptul de retragere <strong>inceteaza</strong> in cazul contractelor de servicii, dupa prestarea completa a serviciului, daca executarea a inceput cu acordul prealabil expres al consumatorului si cu recunoasterea de catre acesta a faptului ca va pierde dreptul de retragere dupa prestarea completa.</p>
          <p className="mt-2">Tarifator este un serviciu digital accesat imediat dupa activarea abonamentului. Prin bifarea acordului la inregistrare si activarea imediata a serviciului, ati consimtit in mod expres la inceperea prestarii si ati luat cunostinta de aceasta exceptie.</p>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-3 text-amber-800">
            <p className="font-semibold text-sm">Ce inseamna in practica:</p>
            <p className="text-sm mt-1">Daca solicitati retragerea <strong>inainte de a utiliza functiile platite</strong> (nu ati creat nicio fisa sau calcul in perioada platita) — <strong>rambursare integrala</strong>. Daca ati utilizat deja serviciul — se aplica politica de rambursare proportionala de mai jos.</p>
          </div>
        </Section>

        <Section title="2. Cum sa exercitati dreptul de retragere">
          <p>Transmiteti o declaratie clara si neechivoca prin email la <strong>contact.tarifator@gmail.com</strong>, cu urmatoarele informatii:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Numele si adresa de email ale contului</li>
            <li>Data activarii abonamentului</li>
            <li>Declaratia expresa de retragere din contract</li>
          </ul>
          <p className="mt-3">Model de declaratie (puteti folosi propriile cuvinte, esential este sa fie clara intentia):</p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mt-2 text-xs font-mono text-gray-700 leading-relaxed">
            Catre: contact.tarifator@gmail.com<br /><br />
            Prin prezenta, ma retrag din contractul de abonament Tarifator<br />
            incheiat pe data de [DATA ACTIVARII].<br /><br />
            Nume: [NUME COMPLET]<br />
            Email cont: [EMAIL]<br />
            Motiv (optional): [MOTIV]<br /><br />
            Data: [DATA]<br />
            Semnatura (pentru comunicare pe hartie): ___________
          </div>
          <p className="mt-3">Confirmam primirea declaratiei in termen de <strong>24 de ore lucratoare</strong> si procesam rambursarea in termen de 14 zile calendaristice.</p>
        </Section>

        <Section title="3. Politica de rambursare">
          <div className="space-y-3">
            <Case
              when="Retragere in 14 zile, serviciu neutilizat"
              then="Rambursare integrala a sumei platite, in termen de 14 zile de la primirea declaratiei."
            />
            <Case
              when="Retragere in 14 zile, serviciu partial utilizat"
              then="Rambursare proportionala: suma × (zile ramase din luna / zile totale ale lunii platite)."
            />
            <Case
              when="Anulare dupa 14 zile"
              then="Nu se efectueaza rambursari pentru perioadele deja platite. Accesul continua pana la expirarea abonamentului curent."
            />
            <Case
              when="Defectiune tehnica majora din vina Furnizorului (>24h indisponibilitate)"
              then="Rambursare proportionala cu perioada de indisponibilitate confirmata, la cerere motivata trimisa in 30 de zile de la incident."
            />
            <Case
              when="Plan gratuit (fara plata)"
              then="Nu se aplica rambursarea — planul gratuit nu presupune nicio plata."
            />
          </div>
          <p className="mt-4 text-sm text-gray-500">Rambursarile se efectueaza prin acelasi mijloc de plata utilizat initial, in termen de 14 zile calendaristice (Art. 13 OUG 34/2014). Nu percepem taxe pentru procesarea rambursarilor.</p>
        </Section>

        <Section title="4. Politica de anulare abonament">
          <p>Puteti anula abonamentul oricand, fara penalitati, trimitand un email la <strong>contact.tarifator@gmail.com</strong>.</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Anularea intra in vigoare la sfarsitul perioadei de abonament curente platite.</li>
            <li>Abonamentele nu se reinnesc automat — fiecare perioada necesita confirmare separata.</li>
            <li>Dupa anulare, contul trece automat pe planul gratuit (3 fise + 3 calcule/luna).</li>
            <li>Datele dvs. sunt pastrate conform politicii de confidentialitate.</li>
            <li>Puteti reactiva abonamentul oricand.</li>
          </ul>
        </Section>

        <Section title="5. Stergerea contului si a datelor">
          <p>Puteti solicita stergerea completa a contului si a tuturor datelor asociate prin:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Din aplicatie:</strong> Setari → Contul meu → Sterge contul (stergere imediata automata)</li>
            <li><strong>Prin email:</strong> contact.tarifator@gmail.com — procesam cererea in termen de 30 de zile (Art. 12(3) GDPR)</li>
          </ul>
          <p className="mt-2">Anumite date pot fi retinute daca exista obligatie legala (ex: documente contabile — 10 ani conform Legii 82/1991). Un hash criptografic al emailului dvs. este retinut 24 de luni in scopul prevenirii abuzului de re-inregistrare (interes legitim — Art. 6(1)(f) GDPR).</p>
          <p className="mt-2">Dupa stergerea contului, nu veti mai putea accesa datele introduse. Va recomandam sa exportati documentele importante inainte de stergere.</p>
        </Section>

        <div className="text-xs text-gray-500 pt-4 border-t border-gray-100 space-x-4">
          <a href="/termeni" className="hover:text-gray-600">Termeni si conditii</a>
          <a href="/confidentialitate" className="hover:text-gray-600">Politica de confidentialitate</a>
        </div>

      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm space-y-2">
      <h2 className="font-bold text-gray-900">{title}</h2>
      <div className="text-sm text-gray-600 leading-relaxed">{children}</div>
    </div>
  )
}

function Case({ when, then }: { when: string; then: string }) {
  return (
    <div className="flex gap-3 text-sm border-b border-gray-50 pb-2 last:border-0 last:pb-0">
      <div className="w-2/5">
        <span className="font-semibold text-gray-700">{when}</span>
      </div>
      <div className="w-3/5 text-gray-600">{then}</div>
    </div>
  )
}
