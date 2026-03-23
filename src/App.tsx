import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard, Package, Users, TrendingDown,
  LogIn, LogOut, Loader2, Plus, Trash2, X, RefreshCw,
  ShoppingBag, Star, Upload
} from "lucide-react";
import { onAuthStateChanged, signOut, User as FBUser } from "firebase/auth";
import { auth, signInWithGoogle } from "./firebase";
import {
  subscribeToAllOrders, subscribeToCustomers,
  subscribeToProducts, subscribeToMarketOffers,
  addProduct, deleteProduct, saveMarketOffer
} from "./services/firestoreService";
import { saltAgent } from "./services/geminiService";

type Tab = "dashboard" | "customers" | "products" | "offers";

export default function App() {
  const [user, setUser] = useState<FBUser | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");

  const [orders, setOrders]     = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts]  = useState<any[]>([]);
  const [offers, setOffers]      = useState<any[]>([]);

  const [addProd, setAddProd]   = useState(false);
  const [newP, setNewP]         = useState({ name: "", sellingPrice: 0, stock: 0, unit: "كغ", category: "عام" });
  const [addOffer, setAddOffer] = useState(false);
  const [newO, setNewO]         = useState({ productName: "", marketName: "", offerPrice: 0, originalPrice: 0 });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setReady(true); });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    const u1 = subscribeToAllOrders(setOrders);
    const u2 = subscribeToCustomers(setCustomers);
    const u3 = subscribeToProducts(setProducts);
    const u4 = subscribeToMarketOffers(setOffers);
    return () => { u1(); u2(); u3(); u4(); };
  }, [user]);

  if (!ready) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="animate-spin text-emerald-600" size={48} />
    </div>
  );

  if (!user) return (
    <div className="flex flex-col items-center justify-center h-screen p-8 text-center">
      <div className="w-24 h-24 bg-emerald-600 rounded-full flex items-center justify-center text-white text-4xl font-bold mb-8">س</div>
      <h1 className="text-3xl font-bold mb-3">سلتي | لوحة التحكم</h1>
      <p className="text-gray-500 mb-10 max-w-xs">متابعة العملاء والطلبات والأسعار في مكان واحد</p>
      <button onClick={signInWithGoogle} className="flex items-center gap-3 bg-white border px-8 py-3 rounded-full shadow-md font-medium text-gray-700 hover:shadow-lg transition-shadow">
        <LogIn size={20} /> تسجيل الدخول
      </button>
    </div>
  );

  const totalRevenue = orders.reduce((s, o) => s + (o.total_amount || o.totalAmount || 0), 0);
  const totalSavings = orders.reduce((s, o) => s + (o.total_savings || o.totalSavings || 0), 0);

  const tabs: { key: Tab; label: string; Icon: any }[] = [
    { key: "dashboard", label: "الرئيسية", Icon: LayoutDashboard },
    { key: "customers", label: "العملاء",  Icon: Users },
    { key: "products",  label: "المنتجات", Icon: Package },
    { key: "offers",    label: "الأسعار",  Icon: TrendingDown },
  ];

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-gray-50 shadow-2xl overflow-hidden">
      {/* Header */}
      <header className="bg-[#075E54] text-white p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-400 rounded-full flex items-center justify-center font-bold text-lg">س</div>
          <div>
            <div className="font-bold">سلتي Dashboard</div>
            <div className="text-xs text-emerald-200">بريدة — القصيم</div>
          </div>
        </div>
        <button onClick={() => signOut(auth)} className="p-2 hover:bg-white/10 rounded-lg"><LogOut size={18} /></button>
      </header>

      {/* Tabs */}
      <nav className="bg-white border-b flex shrink-0">
        {tabs.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors
              ${tab === key ? "text-emerald-600 border-b-2 border-emerald-600" : "text-gray-400"}`}>
            <Icon size={18} />{label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── DASHBOARD ── */}
        {tab === "dashboard" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "الطلبات", value: orders.length, color: "text-blue-600", bg: "bg-blue-50" },
                { label: "العملاء", value: customers.length, color: "text-purple-600", bg: "bg-purple-50" },
                { label: "الإيرادات", value: `${totalRevenue.toFixed(0)} ر`, color: "text-emerald-600", bg: "bg-emerald-50" },
                { label: "وفّرنا للعملاء", value: `${totalSavings.toFixed(0)} ر`, color: "text-orange-500", bg: "bg-orange-50" },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-2xl p-4`}>
                  <div className="text-xs text-gray-500 mb-1">{s.label}</div>
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="font-bold mb-3 flex items-center gap-2"><ShoppingBag size={16} className="text-gray-400" />آخر الطلبات</h3>
              {orders.length === 0
                ? <p className="text-xs text-gray-400 text-center py-4">لا توجد طلبات بعد</p>
                : orders.slice(0, 8).map(o => (
                  <div key={o.id} className="flex justify-between items-center py-2 border-b last:border-0 text-sm">
                    <div>
                      <div className="font-medium">{o.customerName || o.customer_id?.slice(-6) || "عميل"}</div>
                      <div className="text-xs text-gray-400">{o.created_at?.toDate?.()?.toLocaleDateString("ar-SA") || "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-600">{o.total_amount || o.totalAmount} ر</div>
                      <div className="text-xs text-orange-500">وفّر {o.total_savings || o.totalSavings || 0} ر</div>
                    </div>
                  </div>
                ))
              }
            </div>
          </>
        )}

        {/* ── CUSTOMERS ── */}
        {tab === "customers" && (
          <div className="space-y-3">
            <h2 className="font-bold text-lg">العملاء ({customers.length})</h2>
            {customers.length === 0
              ? <p className="text-gray-400 text-sm text-center py-8">لا يوجد عملاء بعد</p>
              : customers.map(c => (
                <div key={c.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold">{c.name || "عميل"}</div>
                      <div className="text-xs text-gray-400">ID: {c.telegram_id}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-600">{c.total_orders} طلب</div>
                      <div className="text-xs text-gray-500">{c.total_spent?.toFixed(0) || 0} ريال</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Star size={13} className="text-yellow-400" />
                    <span className="text-xs text-gray-500">{c.loyalty_points || 0} نقطة</span>
                    {Object.keys(c.repeat_items || {}).length > 0 && (
                      <span className="text-xs text-blue-500 mr-auto">
                        {Object.entries(c.repeat_items).sort((a: any, b: any) => b[1]-a[1]).slice(0,2).map(([n]) => n).join("، ")}
                      </span>
                    )}
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* ── PRODUCTS ── */}
        {tab === "products" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-lg">المنتجات ({products.length})</h2>
              <button onClick={() => setAddProd(!addProd)} className="bg-emerald-600 text-white p-2 rounded-full">
                {addProd ? <X size={18} /> : <Plus size={18} />}
              </button>
            </div>

            {addProd && (
              <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
                {[
                  { ph: "اسم المنتج", key: "name" },
                  { ph: "الوحدة (كغ/لتر/حبة)", key: "unit" },
                  { ph: "التصنيف", key: "category" },
                ].map(f => (
                  <input key={f.key} placeholder={f.ph} className="w-full p-2 border rounded-lg text-sm"
                    value={(newP as any)[f.key]}
                    onChange={e => setNewP({ ...newP, [f.key]: e.target.value })} />
                ))}
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" placeholder="السعر" className="p-2 border rounded-lg text-sm"
                    value={newP.sellingPrice || ""}
                    onChange={e => setNewP({ ...newP, sellingPrice: +e.target.value })} />
                  <input type="number" placeholder="المخزون" className="p-2 border rounded-lg text-sm"
                    value={newP.stock || ""}
                    onChange={e => setNewP({ ...newP, stock: +e.target.value })} />
                </div>
                <button onClick={async () => { await addProduct(newP); setAddProd(false); setNewP({ name:"",sellingPrice:0,stock:0,unit:"كغ",category:"عام" }); }}
                  className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold text-sm">
                  إضافة
                </button>
              </div>
            )}

            {products.map(p => (
              <div key={p.id} className="bg-white rounded-2xl p-3 shadow-sm flex justify-between items-center">
                <div>
                  <div className="font-medium text-sm">{p.name}</div>
                  <div className="text-xs text-gray-400">{p.category} | {p.stock} {p.unit}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-emerald-600">{p.sellingPrice} ر</span>
                  <button onClick={() => deleteProduct(p.id)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── OFFERS ── */}
        {tab === "offers" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-lg">عروض السوق ({offers.length})</h2>
              <button onClick={() => setAddOffer(!addOffer)} className="bg-emerald-600 text-white p-2 rounded-full">
                {addOffer ? <X size={18} /> : <Plus size={18} />}
              </button>
            </div>

            {addOffer && (
              <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
                {[
                  { ph: "اسم المنتج", key: "productName" },
                  { ph: "اسم المتجر", key: "marketName" },
                ].map(f => (
                  <input key={f.key} placeholder={f.ph} className="w-full p-2 border rounded-lg text-sm"
                    value={(newO as any)[f.key]}
                    onChange={e => setNewO({ ...newO, [f.key]: e.target.value })} />
                ))}
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" placeholder="سعر العرض" className="p-2 border rounded-lg text-sm"
                    value={newO.offerPrice || ""}
                    onChange={e => setNewO({ ...newO, offerPrice: +e.target.value })} />
                  <input type="number" placeholder="السعر الأصلي" className="p-2 border rounded-lg text-sm"
                    value={newO.originalPrice || ""}
                    onChange={e => setNewO({ ...newO, originalPrice: +e.target.value })} />
                </div>
                <button onClick={async () => { await saveMarketOffer(newO); setAddOffer(false); setNewO({ productName:"",marketName:"",offerPrice:0,originalPrice:0 }); }}
                  className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold text-sm">
                  حفظ العرض
                </button>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
              💡 أضف العروض يدوياً من مجلات الهايبرماركت أسبوعياً، أو ارفع صور PDF وسيستخرجها الذكاء الاصطناعي تلقائياً.
            </div>

            {offers.map(o => (
              <div key={o.id} className="bg-white rounded-2xl p-3 shadow-sm flex justify-between items-center">
                <div>
                  <div className="font-medium text-sm">{o.productName}</div>
                  <div className="text-xs text-gray-400">{o.marketName}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-emerald-600">{o.offerPrice} ر</div>
                  {o.originalPrice > o.offerPrice && (
                    <div className="text-xs text-gray-400 line-through">{o.originalPrice} ر</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
