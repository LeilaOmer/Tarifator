import { SITE_HOST } from '@/lib/site'

export default function TermeniPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        <div>
          <a href="/login" className="text-sm text-blue-600 hover:underline">← Inapoi</a>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">Termeni si Conditii</h1>
          <p className="text-xs text-gray-500 mt-1">Ultima actualizare: Iulie 2026</p>
        </div>

        {/* Rezumat pe scurt */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
          <p className="text-xs font-bold text-blue-600 uppercase tracking-wide">Pe scurt — ce trebuie sa stii</p>
          <ul className="space-y-2 text-sm text-blue-900">
            <li>✓ <strong>Ce e Tarifator:</strong> aplicatie pentru artizani si prestatori de servicii — genereaza fise de servicii, calculeaza preturi, exporta PDF.</li>
            <li>✓ <strong>Plan gratuit permanent:</strong> 3 fise + 3 calcule pe luna, fara card. Primele 30 de zile de la inregistrare: 30 fise + 30 calcule.</li>
            <li>✓ <strong>Abonamente optionale:</strong> Artizan 59, Mercator 129, Pro 149 lei/luna (primii 50 utilizatori: preturi reduse). TVA si firmele multiple sunt gratuite pe orice plan.</li>
            <li>✓ <strong>Datele tale iti apartin:</strong> fisele, clientii si preturile introduse de tine sunt ale tale si le poti sterge oricand.</li>
            <li>✓ <strong>Retragere:</strong> ai 14 zile sa te razgandesti dupa plata. Daca ai folosit deja serviciul, rambursarea e proportionala.</li>
            <li>✓ <strong>Anulare:</strong> oricand, fara penalitati. Accesul continua pana la expirarea perioadei platite.</li>
            <li>✓ <strong>Contact:</strong> contact.tarifator@gmail.com — raspundem in 24 de ore lucratoare.</li>
          </ul>
        </div>

        <Section title="1. Partile contractante">
          <p>Prezentii Termeni si Conditii ("Termeni") reglementeaza utilizarea aplicatiei <strong>Tarifator</strong> ("Serviciul"), disponibila la adresa <em>{SITE_HOST}</em>.</p>
          <p className="mt-2">Serviciul este furnizat de <strong>Tarifator</strong> (serviciu in faza beta, operat de o persoana fizica, in curs de inregistrare ca entitate juridica), denumit in continuare "Furnizor".</p>
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Aplicatia este in faza de pre-lansare (beta). In aceasta etapa accesul este complet si gratuit; abonamentele platite se activeaza la lansare.</p>
          <p className="mt-2">Serviciul este destinat exclusiv persoanelor cu varsta de minimum <strong>18 ani</strong>. Prin crearea unui cont confirmati ca aveti cel putin 18 ani, ati citit, inteles si acceptat acesti Termeni.</p>
        </Section>

        <Section title="2. Descrierea Serviciului">
          <p>Tarifator este o platforma digitala destinata artizanilor, prestatorilor de servicii si firmelor mici pentru:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Generarea de fise de servicii prin dictare vocala sau manual</li>
            <li>Calculul pretului de vanzare cu adaos si TVA</li>
            <li>Gestionarea clientilor si a firmelor proprii</li>
            <li>Exportul documentelor in format PDF</li>
          </ul>
          <p className="mt-2">Furnizorul depune eforturi rezonabile pentru disponibilitate continua, insa nu poate garanta functionarea neintrerupta. Furnizorul nu raspunde pentru decizii comerciale luate exclusiv pe baza calculelor generate de Serviciu — verificati intotdeauna rezultatele inainte de utilizare.</p>
        </Section>

        <Section title="3. Contul de utilizator">
          <ul className="list-disc pl-5 space-y-1">
            <li>Sunteti responsabil pentru securitatea credentialelor contului dvs.</li>
            <li>Un cont este destinat unui singur utilizator sau unei singure entitati.</li>
            <li>Nu transferati accesul catre terti neautorizati.</li>
            <li>Notificati imediat Furnizorul daca suspectati utilizarea neautorizata a contului.</li>
          </ul>
        </Section>

        <Section title="4. Planuri si tarife">
          <div className="space-y-2">
            <Row label="Plan Free" value="Gratuit permanent — 3 fise/luna + 3 calcule de pret/luna, fara card. Primele 30 de zile de la inregistrare: 30 fise + 30 calcule." />
            <Row label="Plan Artizan" value="59 lei (RON)/luna — fise nelimitate, 3 calcule de pret/luna" />
            <Row label="Plan Mercator" value="129 lei (RON)/luna — calcule de pret nelimitate, 3 fise/luna" />
            <Row label="Plan Pro" value="149 lei (RON)/luna — fise si calcule nelimitate" />
          </div>
          <p className="mt-3 text-xs text-gray-500">TVA si firmele multiple sunt incluse gratuit pe orice plan. Primii 50 de utilizatori inregistrati beneficiaza de preturi reduse: 39 / 89 / 99 lei/luna.</p>
          <p className="mt-3">Tarifele pot fi modificate cu notificare prealabila de minimum <strong>30 de zile</strong> transmisa pe adresa de email inregistrata. Continuarea utilizarii Serviciului dupa data intrarii in vigoare a noilor tarife constituie acceptarea acestora.</p>
          <p className="mt-2">Modificarile substantiale ale prezentilor Termeni vor fi notificate cu minimum 15 zile inainte. Daca nu sunteti de acord, puteti rezilia contractul inainte de data modificarii.</p>
        </Section>

        <Section title="5. Plati si facturare">
          <p>Abonamentele se activeaza manual prin contact la <strong>contact.tarifator@gmail.com</strong>. Plata se efectueaza in avans, la inceputul fiecarei perioade de abonament, in lei (RON).</p>
          <p className="mt-2">Dupa confirmarea platii, Furnizorul activeaza abonamentul si emite documentul fiscal aferent in termen de 24 de ore lucratoare.</p>
        </Section>

        <Section title="6. Rezilierea si anularea">
          <p>Puteti solicita anularea abonamentului oricand, prin email la contact.tarifator@gmail.com, fara penalitati. Accesul la functiile platite continua pana la expirarea perioadei pentru care s-a achitat. Abonamentele nu se reinnesc automat.</p>
          <p className="mt-2">Furnizorul isi rezerva dreptul de a suspenda conturile care incalca prezentii Termeni, cu notificare prealabila de 5 zile, cu exceptia cazurilor de frauda sau utilizare abuziva unde suspendarea poate fi imediata.</p>
        </Section>

        <Section title="7. Proprietate intelectuala">
          <p>Codul sursa, interfata, brandingul si continutul Serviciului sunt proprietatea Furnizorului. <strong>Datele introduse de dvs.</strong> (fise, clienti, preturi, firme) va apartin in totalitate si puteti solicita exportul sau stergerea lor oricand.</p>
        </Section>

        <Section title="8. Limitarea raspunderii">
          <p>In masura permisa de lege, Furnizorul nu raspunde pentru pierderi indirecte, pierderi de profit sau pierderi de date rezultate din utilizarea Serviciului.</p>
          <p className="mt-2">Raspunderea totala a Furnizorului este limitata la suma platita de utilizator in ultimele 3 luni anterioare evenimentului cauzator de prejudiciu.</p>
          <p className="mt-2 font-medium text-gray-700">Aceasta limitare nu se aplica in cazul prejudiciilor cauzate prin dol, culpa grava sau vatamare corporala, si nu afecteaza drepturile legale ale consumatorilor conform legislatiei romane si europene.</p>
        </Section>

        <Section title="9. Legea aplicabila si solutionarea litigiilor">
          <p>Prezentii Termeni sunt guvernati de legislatia romana. Orice litigiu se solutioneaza pe cale amiabila in primul rand, prin contact la contact.tarifator@gmail.com.</p>
          <p className="mt-2">In calitate de consumator, aveti dreptul de a apela la:</p>
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li><strong>ANPC</strong> (Autoritatea Nationala pentru Protectia Consumatorilor) — anpc.ro</li>
            <li><strong>SAL</strong> (Solutionarea Alternativa a Litigiilor) — entitati acreditate conform Legii 158/2015</li>
            <li><strong>Platforma ODR a UE</strong> (Online Dispute Resolution) — <a href="https://ec.europa.eu/consumers/odr" target="_blank" className="text-blue-600 underline">ec.europa.eu/consumers/odr</a></li>
            <li>Instantele judecatoresti competente din Romania</li>
          </ul>
        </Section>

        <Section title="10. Diverse">
          <p><strong>Separabilitate:</strong> Daca o clauza a prezentilor Termeni este declarata invalida sau inaplicabila, celelalte clauze raman in vigoare.</p>
          <p className="mt-2"><strong>Renuntare:</strong> Nerevendicarea unui drept prevazut de acesti Termeni nu constituie renuntare definitiva la acel drept.</p>
          <p className="mt-2"><strong>Forta majora:</strong> Furnizorul nu raspunde pentru neexecutarea obligatiilor cauzata de evenimente in afara controlului sau rezonabil (dezastre naturale, atacuri cibernetice la scara larga, probleme ale furnizorilor de infrastructura).</p>
        </Section>

        <div className="text-xs text-gray-500 pt-4 border-t border-gray-100 space-x-4">
          <a href="/confidentialitate" className="hover:text-gray-600">Politica de confidentialitate</a>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="font-semibold text-gray-700 w-36 shrink-0">{label}</span>
      <span className="text-gray-600">{value}</span>
    </div>
  )
}
