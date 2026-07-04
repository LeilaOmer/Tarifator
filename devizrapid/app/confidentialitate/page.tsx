export default function ConfidentialitatePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-8">

        <div>
          <a href="/login" className="text-sm text-blue-600 hover:underline">← Inapoi</a>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">Politica de Confidentialitate</h1>
          <p className="text-xs text-gray-500 mt-1">GDPR — Regulamentul (UE) 2016/679 · Ultima actualizare: Iunie 2026</p>
        </div>

        <Section title="1. Operatorul de date">
          <p>Operatorul datelor cu caracter personal este <strong>Tarifator</strong> (serviciu in faza beta, operat de o persoana fizica, in curs de inregistrare ca entitate juridica), denumit in continuare "Operator".</p>
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Aceasta versiune a aplicatiei este in faza de testare (beta). Nu se percep plati. Datele tale sunt prelucrate exclusiv pentru furnizarea serviciului gratuit de test.</p>
          <p className="mt-2">Contact privind datele personale: <strong>contact.tarifator@gmail.com</strong></p>
          <p className="mt-2">Nu am desemnat un Responsabil cu Protectia Datelor (DPO), intrucat nu indeplinim criteriile de la Art. 37 GDPR. Solicitarile privind datele personale se adreseaza direct la emailul de mai sus.</p>
        </Section>

        <Section title="2. Ce date colectam">
          <table className="w-full text-sm border-collapse mt-1">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-1.5 pr-4 font-semibold">Date</th>
                <th className="py-1.5 pr-4 font-semibold">Sursa</th>
                <th className="py-1.5 font-semibold">Scop</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr className="border-b border-gray-50">
                <td className="py-1.5 pr-4">Adresa de email</td>
                <td className="py-1.5 pr-4">Inregistrare cont</td>
                <td className="py-1.5">Autentificare, comunicare</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-1.5 pr-4">Nume firma, CUI, adresa</td>
                <td className="py-1.5 pr-4">Setari cont</td>
                <td className="py-1.5">Generare documente</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-1.5 pr-4">Date clienti (nume, tel, adresa)</td>
                <td className="py-1.5 pr-4">Introduse de dvs.</td>
                <td className="py-1.5">Gestionare clienti</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-1.5 pr-4">Date fise servicii</td>
                <td className="py-1.5 pr-4">Introduse de dvs.</td>
                <td className="py-1.5">Furnizarea Serviciului</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-1.5 pr-4">Inregistrari vocale</td>
                <td className="py-1.5 pr-4">Functia de dictare</td>
                <td className="py-1.5">Transcriere AI (transmise Groq; politica Zero Data Retention — sterse imediat dupa transcriere, nestocate de noi sau de Groq)</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-1.5 pr-4">Date de utilizare (numar fise/calcule)</td>
                <td className="py-1.5 pr-4">Automat</td>
                <td className="py-1.5">Managementul planului</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-4">Hash criptografic al emailului</td>
                <td className="py-1.5 pr-4">La stergerea contului</td>
                <td className="py-1.5">Prevenirea abuzului de re-inregistrare (interes legitim)</td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Section title="3. Temeiul juridic al prelucrarii">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Executarea contractului</strong> (Art. 6(1)(b) GDPR) — pentru furnizarea Serviciului</li>
            <li><strong>Interesul legitim</strong> (Art. 6(1)(f) GDPR) — pentru securitate, prevenirea fraudelor si prevenirea abuzului de re-inregistrare</li>
            <li><strong>Consimtamantul</strong> (Art. 6(1)(a) GDPR) — pentru comunicari comerciale optionale. Consimtamantul poate fi retras oricand la fel de usor ca acordarea lui, prin email la contact.tarifator@gmail.com, fara consecinte asupra accesului la Serviciu.</li>
            <li><strong>Obligatia legala</strong> (Art. 6(1)(c) GDPR) — pentru documente contabile si fiscale</li>
          </ul>
        </Section>

        <Section title="4. Durata pastrarii datelor">
          <ul className="list-disc pl-5 space-y-1">
            <li>Datele contului activ: pe durata existentei contului</li>
            <li>Datele contului dupa stergere: sterse in termen de 30 de zile, cu exceptia celor cu obligatie legala</li>
            <li>Inregistrarile vocale: transmise Groq exclusiv pentru transcriere, acoperite de politica Zero Data Retention (ZDR) a Groq — datele sunt sterse imediat dupa generarea raspunsului, nu sunt stocate de Groq si nu sunt folosite pentru antrenarea modelelor AI (interzis contractual conform Groq Services Agreement). DPA disponibil la <a href="https://console.groq.com/docs/legal/customer-data-processing-addendum" target="_blank" className="text-blue-600 underline">console.groq.com/docs/legal</a></li>
            <li>Documentele de facturare: 10 ani (obligatie legala — Legea 82/1991 republicata)</li>
            <li>Jurnalele de utilizare: 12 luni</li>
            <li>Hash email post-stergere: 24 de luni (interes legitim — prevenire abuz)</li>
          </ul>
        </Section>

        <Section title="5. Destinatari si transferuri internationale">
          <p>Datele dvs. pot fi partajate cu urmatorii subprocesori:</p>
          <div className="mt-2 space-y-2">
            <Processor name="Supabase Inc." role="Baza de date si autentificare" location="UE (date stocate in Frankfurt) / SUA — DPA disponibil la supabase.com/privacy" />
            <Processor name="Vercel Inc." role="Hosting aplicatie" location="SUA — transfer acoperit de Clauze Contractuale Standard UE (Art. 46 GDPR)" />
            <Processor name="Groq Inc." role="Transcriere vocala AI" location="SUA — Zero Data Retention: date sterse imediat post-transcriere, interzis contractual folosirea pentru antrenare AI. Transfer acoperit de Clauze Contractuale Standard UE (Art. 46 GDPR). DPA disponibil." />
          </div>
          <p className="mt-3">Nu vindem si nu inchiriem datele dvs. catre terti. Puteti solicita lista completa a subprocesorilor activi la contact.tarifator@gmail.com.</p>
        </Section>

        <Section title="6. Decizii automate (Art. 22 GDPR)">
          <p>Serviciul aplica <strong>limitari automate</strong> ale utilizarii bazate pe contorizarea actiunilor dvs. (numar de fise create, numar de calcule exportate pe luna). La depasirea limitelor planului gratuit, accesul la crearea de noi documente este blocat automat pana la inceputul lunii urmatoare sau pana la activarea unui abonament.</p>
          <p className="mt-2">Aceasta procesare automata se bazeaza pe executarea contractului (Art. 6(1)(b) GDPR). Aveti dreptul de a contesta decizia si de a solicita interventie umana prin contact la contact.tarifator@gmail.com.</p>
        </Section>

        <Section title="7. Drepturile dvs.">
          <p>In temeiul GDPR, beneficiati de urmatoarele drepturi, pe care le puteti exercita la <strong>contact.tarifator@gmail.com</strong>. Raspundem in termen de <strong>30 de zile</strong> (Art. 12(3) GDPR), termen care poate fi extins cu inca 60 de zile in cazuri complexe, cu notificare prealabila.</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Acces</strong> (Art. 15) — sa obtineti o copie a datelor prelucrate</li>
            <li><strong>Rectificare</strong> (Art. 16) — sa corectati datele inexacte</li>
            <li><strong>Stergere</strong> (Art. 17, "dreptul de a fi uitat") — cu exceptiile prevazute de lege</li>
            <li><strong>Restrictionarea prelucrarii</strong> (Art. 18)</li>
            <li><strong>Portabilitatea datelor</strong> (Art. 20) — in format structurat, lizibil automat (JSON/CSV), in termen de 30 de zile</li>
            <li><strong>Opozitia</strong> (Art. 21) — fata de prelucrarea bazata pe interesul legitim</li>
            <li><strong>Retragerea consimtamantului</strong> (Art. 7(3)) — oricand, fara a afecta legalitatea prelucrarii anterioare</li>
          </ul>
          <p className="mt-3">Aveti dreptul de a depune plangere la <strong>ANSPDCP</strong> (Autoritatea Nationala de Supraveghere a Prelucrarii Datelor cu Caracter Personal): <a href="https://www.dataprotection.ro" target="_blank" className="text-blue-600 underline">dataprotection.ro</a> · Bd. Gheorghe Magheru 28-30, Sector 1, Bucuresti · anspdcp@dataprotection.ro</p>
        </Section>

        <Section title="8. Notificarea incalcarii securitatii datelor">
          <p>In cazul unei incalcari a securitatii datelor cu caracter personal, Operatorul va notifica ANSPDCP in termen de <strong>72 de ore</strong> de la constatare (Art. 33 GDPR). Daca incalcarea prezinta un risc ridicat pentru drepturile dvs., veti fi notificat direct si fara intarzieri nejustificate (Art. 34 GDPR).</p>
        </Section>

        <Section title="9. Cookie-uri si stocare locala">
          <p>Aplicatia foloseste <strong>localStorage</strong> exclusiv pentru preferinte de interfata (modul activ, firma selectata). Nu folosim cookie-uri de tracking, analiza sau publicitate.</p>
          <p className="mt-2">Sesiunea de autentificare este gestionata prin cookie-uri tehnice strict necesare (Supabase auth), fara de care Serviciul nu poate functiona. Aceste cookie-uri nu necesita consimtamant conform Art. 5(3) din Directiva 2002/58/CE.</p>
        </Section>

        <Section title="10. Securitate">
          <p>Datele sunt stocate in baze de date securizate (Supabase, Frankfurt). Accesul la datele dvs. este protejat prin politici de securitate la nivel de rand (Row Level Security — RLS). Comunicatiile sunt criptate TLS 1.2+/HTTPS.</p>
        </Section>

        <div className="text-xs text-gray-500 pt-4 border-t border-gray-100 space-x-4">
          <a href="/termeni" className="hover:text-gray-600">Termeni si conditii</a>
          <a href="/retragere" className="hover:text-gray-600">Drept de retragere</a>
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

function Processor({ name, role, location }: { name: string; role: string; location: string }) {
  return (
    <div className="flex gap-3 text-sm py-1 border-b border-gray-50 last:border-0">
      <span className="font-semibold text-gray-700 w-32 shrink-0">{name}</span>
      <span className="text-gray-600">{role} · <span className="text-gray-500 text-xs">{location}</span></span>
    </div>
  )
}
