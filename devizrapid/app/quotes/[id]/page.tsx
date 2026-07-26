"use client";
import { toast } from '@/lib/toast'
import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { anafLookup } from "@/lib/anaf";
import jsPDF from "jspdf";
import { drawPageChrome } from "@/lib/pricing/brand";
import { computeQuoteTotals, type DiscountType } from "@/lib/quotes/totals";

interface Profile {
  id: string;
  company_name: string | null;
  account_type: "artizan" | "pro" | null;
  cui: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  bank: string | null;
  iban: string | null;
  vat_rate: number;
}

interface Company {
  id: string;
  name: string;
  cui: string | null;
  reg_com: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  bank: string | null;
  iban: string | null;
  vat_rate: number;
}

interface Client {
  id: string;
  name: string;
  cui: string | null;
  address: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
}

interface QuoteItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface Quote {
  id: string;
  quote_number: string;
  created_at: string;
  status: string;
  vat_rate: number;
  vat_amount: number;
  total_with_vat: number;
  discount: number;
  discount_type: "pct" | "val";
  clients: Client | null;
  quote_items: QuoteItem[];
}

interface Service {
  id: string;
  name: string;
  unit: string;
  price_per_unit: number;
}

interface NewRow {
  service_id: string;
  description: string;
  quantity: string;
  unit_price: string;
}

interface Emitent {
  name: string;
  cui: string | null;
  reg_com?: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  bank: string | null;
  iban: string | null;
  vat_rate: number;
}

const fmt = (val: number) =>
  new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2 }).format(val) + " RON";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" });

const emptyRow = (): NewRow => ({ service_id: "", description: "", quantity: "1", unit_price: "" });

// ─── PDF ───────────────────────────────────────────────────────────────────────

function buildPDF(quote: Quote, emitent: Emitent, isPro: boolean, discount: number, discountType: "pct" | "val"): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210; const margin = 15; let y = 20;
  drawPageChrome(doc, 210, 297); // A4 portrait (W=210, H=297)

  const addLine = (text: string, size = 10, bold = false, color: [number, number, number] = [30, 30, 30]) => {
    doc.setFontSize(size); doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...color); doc.text(text, margin, y); y += size * 0.45;
  };

  const { subtotalBrut, discountVal, subtotalNet, vatAmount, total, discount: discPct } =
    computeQuoteTotals(quote.quote_items, discount, discountType, isPro ? quote.vat_rate : 0);

  doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(20, 20, 20);
  doc.text(emitent.name, margin, y);
  doc.setFontSize(11); doc.setTextColor(0, 43, 91); // Navy #002B5B
  doc.text(`FISA SERVICII ${quote.quote_number}`, W - margin, y, { align: "right" }); y += 6;

  if (isPro && emitent.cui) addLine(`CUI: ${emitent.cui}`, 9, false, [80, 80, 80]);
  if (isPro && emitent.reg_com) addLine(`Reg. Com.: ${emitent.reg_com}`, 9, false, [80, 80, 80]);
  if (emitent.address) addLine(emitent.address, 9, false, [80, 80, 80]);
  if (emitent.phone) addLine(`Tel: ${emitent.phone}`, 9, false, [80, 80, 80]);
  if (emitent.email) addLine(`Email: ${emitent.email}`, 9, false, [80, 80, 80]);
  if (isPro && emitent.iban) addLine(`IBAN: ${emitent.iban}`, 9, false, [80, 80, 80]);
  y += 2;

  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
  doc.text(`Data: ${fmtDate(quote.created_at)}`, W - margin, y, { align: "right" }); y += 5;

  doc.setDrawColor(200, 200, 200); doc.line(margin, y, W - margin, y); y += 6;

  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(80, 80, 80);
  doc.text("BENEFICIAR", margin, y); y += 5;

  const c = quote.clients;
  if (c) {
    addLine(c.name, 10, true, [20, 20, 20]);
    if (c.cui) addLine(`CUI: ${c.cui}`, 9, false, [80, 80, 80]);
    if (c.address) addLine(c.address, 9, false, [80, 80, 80]);
    if (c.contact_person) addLine(`Contact: ${c.contact_person}`, 9, false, [80, 80, 80]);
    if (c.phone) addLine(`Tel: ${c.phone}`, 9, false, [80, 80, 80]);
  } else {
    addLine("Fara beneficiar", 10, false, [130, 130, 130]);
  }
  y += 4;

  doc.line(margin, y, W - margin, y); y += 7;

  const colX = [margin, margin + 8, 95, 120, 150];
  doc.setFillColor(245, 247, 250); doc.rect(margin, y - 4, W - 2 * margin, 7, "F");
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(60, 60, 60);
  ["Nr.", "Descriere", "Cant.", "Pret unit.", "Total"].forEach((h, i) => doc.text(h, colX[i], y));
  y += 5; doc.setDrawColor(220, 220, 220); doc.line(margin, y, W - margin, y); y += 4;

  doc.setFont("helvetica", "normal");
  quote.quote_items.forEach((item, idx) => {
    if (idx % 2 === 0) { doc.setFillColor(252, 252, 252); doc.rect(margin, y - 3.5, W - 2 * margin, 6, "F"); }
    doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(item.description, 68);
    doc.text(String(idx + 1), colX[0], y);
    doc.text(lines, colX[1], y);
    doc.text(String(item.quantity), colX[2], y);
    doc.text(fmt(item.unit_price), colX[3], y);
    doc.text(fmt(item.total), colX[4], y);
    y += Math.max(5.5, lines.length * 4.5);
    if (y > 260) { doc.addPage(); drawPageChrome(doc, 210, 297); y = 20; }
  });

  y += 3; doc.setDrawColor(180, 180, 180); doc.line(margin, y, W - margin, y); y += 6;

  const rows: [string, number][] = [];
  if (discountVal > 0) rows.push([`Discount${discountType === "pct" ? ` ${discPct}%` : ""}`, -discountVal]);
  if (isPro) { rows.push(["Subtotal (fara TVA)", subtotalNet]); rows.push([`TVA ${quote.vat_rate}%`, vatAmount]); }

  rows.forEach(([label, val]) => {
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80);
    doc.text(label, W - margin - 55, y);
    doc.text(fmt(val), W - margin, y, { align: "right" }); y += 5.5;
  });

  doc.setFillColor(0, 43, 91); doc.rect(W - margin - 62, y - 4, 62, 8, "F"); // Navy #002B5B
  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
  doc.text("TOTAL", W - margin - 52, y + 0.5);
  doc.text(fmt(total), W - margin, y + 0.5, { align: "right" }); y += 12;

  return doc;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

function playSuccessSound() {
  const audio = new Audio('/success.wav')
  audio.volume = 0.5
  audio.play().catch(() => {})
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<NewRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [savingDiscount, setSavingDiscount] = useState(false);
  const [discount, setDiscount] = useState<string>("0");
  const [discountType, setDiscountType] = useState<DiscountType>("pct");
  const [savedDiscount, setSavedDiscount] = useState<string>("0");
  const [savedDiscountType, setSavedDiscountType] = useState<"pct" | "val">("pct");
  const [showClientModal, setShowClientModal] = useState(false);
  const [clientForm, setClientForm] = useState({ name: "", cui: "", address: "", contact_person: "", phone: "", email: "" });
  const [savingClient, setSavingClient] = useState(false);
  const [lookingUpAnaf, setLookingUpAnaf] = useState(false);
  const [anafError, setAnafError] = useState("");

  const loadQuote = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const [{ data: prof }, { data: q, error: qErr }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("quotes").select(`
        id, quote_number, created_at, status, company_id,
        vat_rate, vat_amount, total_with_vat, discount, discount_type,
        clients ( id, name, cui, address, contact_person, phone, email ),
        quote_items ( id, description, quantity, unit_price, total )
      `).eq("id", id).single(),
    ]);

    if (qErr || !q) { setError("Fisa nu a putut fi incarcata."); setLoading(false); return; }

    const companyId = (q as any)?.company_id;

    const [{ data: comp }, { data: svcs }] = await Promise.all([
      companyId
        ? supabase.from("companies").select("*").eq("id", companyId).single()
        : Promise.resolve({ data: null }),
      companyId
        ? supabase.from("services").select("*").eq("company_id", companyId).order("name")
        : supabase.from("services").select("*").is("company_id", null).order("name"),
    ]);

    setQuote(q as unknown as Quote);
    setProfile(prof as Profile);
    setCompany(comp as Company | null);
    setServices(svcs || []);
    const dbDiscount = String((q as any).discount ?? 0);
    const dbDiscountType = ((q as any).discount_type ?? "pct") as "pct" | "val";
    setDiscount(dbDiscount);
    setDiscountType(dbDiscountType);
    setSavedDiscount(dbDiscount);
    setSavedDiscountType(dbDiscountType);
    setLoading(false);
  }, [id]);

  useEffect(() => { loadQuote(); }, [loadQuote]);

  async function lookupAnaf(cui: string) {
    const cuiNum = cui.replace(/[^0-9]/g, "");
    if (!cuiNum) return;
    setLookingUpAnaf(true);
    setAnafError("");
    try {
      const { ok, data } = await anafLookup(cuiNum);
      if (!ok) { setAnafError(data.error || "Eroare ANAF"); return; }
      setClientForm(f => ({ ...f, name: data.name || f.name, address: data.address || f.address }));
    } catch {
      setAnafError("Eroare conexiune");
    } finally {
      setLookingUpAnaf(false);
    }
  }

  async function handleAddClient() {
    if (!clientForm.name || !quote) return;
    setSavingClient(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingClient(false); return; }
    const { data: newClient, error: clientErr } = await supabase.from("clients").insert({ ...clientForm, user_id: user.id }).select().single();
    if (clientErr || !newClient) { setSavingClient(false); toast("Nu s-a adaugat beneficiarul: " + (clientErr?.message || "eroare necunoscuta")); return; }
    const { error: linkErr } = await supabase.from("quotes").update({ client_id: newClient.id }).eq("id", id);
    setSavingClient(false);
    if (linkErr) { toast("Beneficiarul s-a creat, dar nu s-a putut atasa la fisa: " + linkErr.message); return; }
    setClientForm({ name: "", cui: "", address: "", contact_person: "", phone: "", email: "" });
    setAnafError("");
    setShowClientModal(false);
    await loadQuote();
  }

  // Emitent: daca fisa are company_id → firma aceea, indiferent de account_type
  function getEmitent(): Emitent {
    if (company) {
      return {
        name: company.name,
        cui: company.cui,
        reg_com: company.reg_com,
        address: company.address,
        phone: company.phone,
        email: company.email,
        bank: company.bank,
        iban: company.iban,
        vat_rate: company.vat_rate,
      };
    }
    return {
      name: profile?.company_name || "—",
      cui: profile?.cui || null,
      address: profile?.address || null,
      phone: profile?.phone || null,
      email: profile?.email || null,
      bank: profile?.bank || null,
      iban: profile?.iban || null,
      vat_rate: profile?.vat_rate || 0,
    };
  }

  function handleServiceSelect(idx: number, serviceId: string) {
    const svc = services.find(s => s.id === serviceId);
    const updated = [...rows];
    updated[idx] = svc
      ? { service_id: svc.id, description: svc.name, quantity: "1", unit_price: String(svc.price_per_unit) }
      : { ...updated[idx], service_id: "" };
    setRows(updated);
  }

  function updateRow(idx: number, field: keyof NewRow, value: string) {
    const updated = [...rows];
    updated[idx] = { ...updated[idx], [field]: value };
    setRows(updated);
  }

  function addRow() { setRows(r => [...r, emptyRow()]); }
  function removeRow(idx: number) { setRows(r => r.filter((_, i) => i !== idx)); }

  // Recalculeaza si salveaza totalurile fisei. UNICUL loc care scrie `total`/
  // `vat_*`/`discount` — inainte, aceleasi 8 linii erau copiate in handleSave,
  // handleDeleteItem si handleSaveDiscount, si deja divergeau de randare.
  // Citeste liniile din DB (nu din state) ca sa nu depinda de ordinea update-urilor.
  async function persistTotals(quoteId: string): Promise<{ error: string | null }> {
    const { data: items, error: readErr } = await supabase
      .from("quote_items").select("quantity, unit_price").eq("quote_id", quoteId);
    if (readErr) return { error: readErr.message };
    const vatRate = company ? getEmitent().vat_rate : 0;
    const t = computeQuoteTotals(items || [], discount, discountType, vatRate);
    const { error } = await supabase.from("quotes").update({
      total: t.subtotalNet,
      vat_rate: vatRate,
      vat_amount: t.vatAmount,
      total_with_vat: t.total,
      discount: t.discount,          // valoarea PLAFONATA, nu cea introdusa
      discount_type: discountType,
    }).eq("id", quoteId);
    return { error: error?.message ?? null };
  }

  async function handleSave() {
    if (!quote || !profile) return;
    const validRows = rows.filter(r => r.description.trim() && parseFloat(r.quantity) > 0 && parseFloat(r.unit_price) > 0);
    if (!validRows.length) return;
    setSaving(true);

    for (const row of validRows) {
      const qty = parseFloat(row.quantity);
      const price = parseFloat(row.unit_price);
      const { error: itemErr } = await supabase.from("quote_items").insert({
        quote_id: quote.id,
        service_id: row.service_id || null,
        description: row.description.trim(),
        quantity: qty,
        unit_price: price,
      });
      if (itemErr) { setSaving(false); toast("Nu s-a salvat o linie: " + itemErr.message); return; }
    }

    const { error: totalErr } = await persistTotals(quote.id);
    if (totalErr) { setSaving(false); toast("Nu s-a actualizat totalul: " + totalErr); return; }

    setRows([emptyRow()]);
    setSaving(false);
    playSuccessSound();
    await loadQuote();
  }

  async function handleDeleteItem(itemId: string) {
    const { error: delErr } = await supabase.from("quote_items").delete().eq("id", itemId);
    if (delErr) { toast("Nu s-a sters linia: " + delErr.message); return; }
    const { error } = await persistTotals(quote!.id);
    if (error) { toast("Linia s-a sters, dar totalul nu s-a actualizat: " + error); return; }
    await loadQuote();
  }

  async function handleSaveDiscount() {
    if (!quote || !profile) return;
    setSavingDiscount(true);
    const { error: discErr } = await persistTotals(quote.id);
    setSavingDiscount(false);
    if (discErr) { toast("Nu s-a salvat discountul: " + discErr); return; }
    setSavedDiscount(discount);
    setSavedDiscountType(discountType);
    playSuccessSound();
    await loadQuote();
  }

  async function handleFinalize() {
    if (!quote) return;
    const { error } = await supabase.from("quotes").update({ status: "final" }).eq("id", quote.id);
    if (error) { toast("Nu s-a finalizat fisa: " + error.message); return; }
    await loadQuote();
  }

  async function handleUnfinalize() {
    if (!quote) return;
    const { error } = await supabase.from("quotes").update({ status: "draft" }).eq("id", quote.id);
    if (error) { toast("Nu s-a putut readuce fisa la ciorna: " + error.message); return; }
    await loadQuote();
  }

  // PDF-ul se genereaza din datele PERSISTATE (savedDiscount), niciodata din
  // state-ul de formular: altfel utilizatorul tasta un discount, apasa direct
  // "PDF"/"WhatsApp" si trimitea clientului un document cu o valoare pe care
  // baza de date n-o continea — evidenta interna si documentul nu se potriveau.
  const buildSavedPDF = () =>
    buildPDF(quote!, emitent, !!company, parseFloat(savedDiscount || "0"), savedDiscountType);

  const shareWhatsApp = async () => {
    if (!quote || !profile) return;
    if (hasUnsavedDiscount) { toast("Salveaza intai discountul, apoi trimite documentul."); return; }
    const doc = buildSavedPDF();
    const fileName = `Fisa_${quote.quote_number}.pdf`;

    if (typeof navigator !== "undefined" && navigator.canShare) {
      const file = new File([doc.output("blob")], fileName, { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: `Fisa Servicii ${quote.quote_number}` }); playSuccessSound(); return; }
        catch { /* utilizatorul a anulat */ }
      }
    }
    // fallback desktop: deschide PDF in tab nou
    window.open(doc.output("bloburl"), "_blank");
    playSuccessSound();
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Se incarca...</p></div>;
  if (error || !quote || !profile) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      <p className="text-red-500">{error || "Fisa Servicii negasit."}</p>
      <button onClick={() => router.push("/quotes")} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold">Inapoi</button>
    </div>
  );

  // Aceeasi definitie ca in TOATE caile de scriere (handleSave/handleDeleteItem/
  // handleSaveDiscount/PDF): documentul are TVA doar daca fisa are o firma
  // asociata. Daca render-ul ar folosi si account_type==='pro', o fisa fara
  // firma (ex. dupa stergerea firmei) ar afisa un TVA de 21% pe care scrierea
  // nu l-a salvat niciodata => TOTAL umflat, diferit de ce se salveaza.
  const isPro = !!company;
  const emitent = getEmitent();
  const isFinalized = quote.status === "final";
  const st = ({ draft: { label: "Ciorna", color: "bg-gray-100 text-gray-600" }, final: { label: "Document Final", color: "bg-green-100 text-green-700" }, sent: { label: "Trimis", color: "bg-blue-100 text-blue-700" }, accepted: { label: "Acceptat", color: "bg-green-100 text-green-700" }, rejected: { label: "Respins", color: "bg-red-100 text-red-700" } } as Record<string, { label: string; color: string }>)[quote.status] ?? { label: quote.status, color: "bg-gray-100 text-gray-600" };
  const c = quote.clients;
  // Previzualizarea din pagina foloseste discountul in curs de editare (ca sa se
  // vada efectul inainte de salvare); PDF-ul foloseste EXCLUSIV ce e salvat.
  const { subtotalBrut, discountVal, subtotalNet, vatAmount, total } =
    computeQuoteTotals(quote.quote_items, discount, discountType, isPro ? quote.vat_rate : 0);
  const hasUnsavedDiscount = discount !== savedDiscount || discountType !== savedDiscountType;

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <button onClick={() => router.push(company ? `/companies/${company.id}/quotes` : "/quotes")} className="flex items-center gap-2 text-blue-600 font-medium text-base py-1 px-2 -ml-2 rounded-lg">
          <span className="text-xl">‹</span> Fise Servicii
        </button>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${st.color}`}>{st.label}</span>
      </div>

      <div className="max-w-2xl mx-auto px-3 pt-3 space-y-3">

        {/* Header compact */}
        <div className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center justify-between">
          <p className="text-sm font-bold text-blue-600">{quote.quote_number}</p>
          <p className="text-xs text-gray-500">{fmtDate(quote.created_at)}</p>
        </div>

        {/* Client */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Beneficiar</p>
  {c ? (
    <>
      <p className="text-base font-bold text-gray-900">{c.name}</p>
      {c.cui && <p className="text-sm text-gray-500">CUI: {c.cui}</p>}
      {c.address && <p className="text-sm text-gray-500">{c.address}</p>}
      {c.contact_person && <p className="text-sm text-gray-500">Contact: {c.contact_person}</p>}
      {c.phone && <p className="text-sm text-gray-500">Tel: {c.phone}</p>}
    </>
  ) : (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-gray-500">Fara beneficiar</p>
      {!isFinalized && (
        <button onClick={() => setShowClientModal(true)}
          className="px-3 py-2 bg-purple-100 text-purple-700 rounded-xl text-xs font-semibold shrink-0 whitespace-nowrap">
          + Adauga beneficiar
        </button>
      )}
    </div>
  )}
</div>

        {/* Lucrari */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lucrari / Servicii</p>
          </div>

          {quote.quote_items.map(item => (
            <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-3 border-b border-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{item.description}</p>
                <p className="text-xs text-gray-500">{item.quantity} buc × {fmt(item.unit_price)}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <p className="text-sm font-semibold text-gray-900">{fmt(item.total)}</p>
                {!isFinalized && <button aria-label="Inchide" onClick={() => handleDeleteItem(item.id)} className="text-red-400 text-xl leading-none">×</button>}
              </div>
            </div>
          ))}

          {!isFinalized && <div className="px-4 py-3 space-y-3 bg-gray-50">
            {rows.map((row, idx) => {
              const qty = parseFloat(row.quantity) || 0;
              const price = parseFloat(row.unit_price) || 0;
              const rowTotal = qty * price;
              return (
                <div key={idx} className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                  {services.length > 0 && (
                    <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                      value={row.service_id} onChange={e => handleServiceSelect(idx, e.target.value)}>
                      <option value="">— Selecteaza sau scrie liber —</option>
                      {services.map(s => <option key={s.id} value={s.id}>{s.name} ({fmt(s.price_per_unit)}/{s.unit})</option>)}
                    </select>
                  )}
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="Descriere serviciu *" value={row.description}
                    onChange={e => updateRow(idx, "description", e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">Cantitate</label>
                      <input type="number" min="0.01" step="0.01" inputMode="decimal"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                        placeholder="1" value={row.quantity}
                        onChange={e => updateRow(idx, "quantity", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">Pret unitar (RON)</label>
                      <input type="number" min="0" step="0.01" inputMode="decimal"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                        placeholder="0.00" value={row.unit_price}
                        onChange={e => updateRow(idx, "unit_price", e.target.value)} />
                    </div>
                  </div>
                  {rowTotal > 0 && (
                    <div className="text-right text-sm font-bold text-blue-600">Total: {fmt(rowTotal)}</div>
                  )}
                  <div className="flex justify-between items-center">
                    <button onClick={() => removeRow(idx)} className="text-xs text-red-400">Sterge rand</button>
                    {idx === rows.length - 1 && <button onClick={addRow} className="text-xs text-blue-600 font-semibold">+ Rand nou</button>}
                  </div>
                </div>
              );
            })}
            <button onClick={handleSave} disabled={saving}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm disabled:bg-gray-300">
              {saving ? "Se salveaza..." : "Salveaza serviciile"}
            </button>
          </div>}
        </div>

        {/* Discount */}
        {(!isFinalized || parseFloat(discount || "0") > 0) && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Discount</p>
          {!isFinalized && (
            <div className="flex gap-2">
              <div className="flex rounded-xl overflow-hidden border border-gray-200">
                <button onClick={() => setDiscountType("pct")} className={`px-4 py-2 text-sm font-semibold ${discountType === "pct" ? "bg-blue-600 text-white" : "bg-white text-gray-600"}`}>%</button>
                <button onClick={() => setDiscountType("val")} className={`px-4 py-2 text-sm font-semibold ${discountType === "val" ? "bg-blue-600 text-white" : "bg-white text-gray-600"}`}>RON</button>
              </div>
              <input type="number" min="0" step="0.01" className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm"
                placeholder={discountType === "pct" ? "Ex: 10" : "Ex: 150"}
                value={discount} onChange={e => setDiscount(e.target.value)} />
            </div>
          )}
          {parseFloat(discount || "0") > 0 && (
            <p className="text-sm text-red-500 font-medium mt-2">-{fmt(discountVal)} discount aplicat</p>
          )}
          {!isFinalized && hasUnsavedDiscount && (
            <button onClick={handleSaveDiscount} disabled={savingDiscount}
              className="mt-3 w-full py-2.5 bg-orange-500 text-white rounded-xl font-semibold text-sm disabled:bg-gray-300">
              {savingDiscount ? "Se salveaza..." : "Salveaza discount"}
            </button>
          )}
        </div>
        )}

        {/* Totaluri */}
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal brut</span><span className="font-medium">{fmt(subtotalBrut)}</span>
          </div>
          {parseFloat(discount || "0") > 0 && (
            <div className="flex justify-between text-sm text-red-500">
              <span>Discount</span><span className="font-medium">-{fmt(discountVal)}</span>
            </div>
          )}
          {isPro && (
            <>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal net (fara TVA)</span><span className="font-medium">{fmt(subtotalNet)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>TVA {quote.vat_rate}%</span><span className="font-medium">{fmt(vatAmount)}</span>
              </div>
            </>
          )}
          <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
            <span className="text-base font-bold text-gray-900">TOTAL</span>
            <span className="text-xl font-bold text-blue-600">{fmt(total)}</span>
          </div>
        </div>

      </div>

      {/* Butoane fixe */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 space-y-2">
        <div className="max-w-2xl mx-auto flex gap-3">
          <button onClick={shareWhatsApp}
            className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white font-semibold rounded-xl py-3 text-sm active:bg-green-700">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
            WhatsApp
          </button>
          <button
            onClick={() => {
              if (hasUnsavedDiscount) { toast("Salveaza intai discountul, apoi genereaza PDF-ul."); return; }
              window.open(buildSavedPDF().output("bloburl"), "_blank");
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold rounded-xl py-3 text-sm active:bg-blue-800">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            PDF
          </button>
        </div>
        <div className="max-w-2xl mx-auto">
          {!isFinalized ? (
            <button onClick={handleFinalize}
              className="w-full py-3.5 bg-green-600 text-white font-bold rounded-xl text-base active:bg-green-800">
              Finalizeaza documentul
            </button>
          ) : (
            <button onClick={handleUnfinalize}
              className="w-full py-3 border-2 border-gray-300 text-gray-500 font-semibold rounded-xl text-sm">
              Reda ca ciorna
            </button>
          )}
        </div>
      </div>

      {showClientModal && (
        <div className="fixed inset-0 bg-black/40 z-30 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-800">Beneficiar nou</p>
              <button onClick={() => { setShowClientModal(false); setAnafError(""); }} className="text-gray-500 text-xl leading-none">×</button>
            </div>
            <div className="flex gap-2">
              <input className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                placeholder="CUI (optional)" value={clientForm.cui} onChange={e => { setClientForm({ ...clientForm, cui: e.target.value }); setAnafError(""); }} />
              <button onClick={() => lookupAnaf(clientForm.cui)}
                disabled={lookingUpAnaf || !clientForm.cui}
                className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:bg-gray-300 shrink-0 whitespace-nowrap">
                {lookingUpAnaf ? "..." : "Cauta ANAF"}
              </button>
            </div>
            {anafError && <p className="text-xs text-red-500 -mt-1">{anafError}</p>}
            <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
              placeholder="Nume / Denumire firma *" value={clientForm.name} onChange={e => setClientForm({ ...clientForm, name: e.target.value })} />
            <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
              placeholder="Adresa" value={clientForm.address} onChange={e => setClientForm({ ...clientForm, address: e.target.value })} />
            <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
              placeholder="Persoana de contact" value={clientForm.contact_person} onChange={e => setClientForm({ ...clientForm, contact_person: e.target.value })} />
            <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
              placeholder="Telefon" value={clientForm.phone} onChange={e => setClientForm({ ...clientForm, phone: e.target.value })} />
            <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
              placeholder="Email" value={clientForm.email} onChange={e => setClientForm({ ...clientForm, email: e.target.value })} />
            <button onClick={handleAddClient} disabled={savingClient || !clientForm.name}
              className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold text-sm disabled:bg-gray-300">
              {savingClient ? "Se adauga..." : "+ Adauga beneficiar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}