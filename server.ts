import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Telegraf, Context } from "telegraf";
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, addDoc, serverTimestamp,
  query, where, getDocs, limit, orderBy, doc, setDoc,
  updateDoc, getDoc, increment
} from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
const bot = process.env.TELEGRAM_BOT_TOKEN ? new Telegraf(process.env.TELEGRAM_BOT_TOKEN) : null;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// ═══════════════════════════════════════════
// دورة نفاد المنتجات (بالأيام)
// ═══════════════════════════════════════════
const REPLENISHMENT: Record<string, number> = {
  "خبز": 2, "حليب": 3, "لبن": 4, "بيض": 7,
  "دجاج": 7, "لحم": 7, "خضار": 5, "فاكهة": 6,
  "أرز": 14, "رز": 14, "زيت": 18, "سكر": 20,
  "شاي": 21, "طحين": 25, "معكرونة": 20, "عصير": 14,
};

// ═══════════════════════════════════════════
// جلب / إنشاء العميل
// ═══════════════════════════════════════════
async function getOrCreateCustomer(chatId: number, name: string) {
  const id = String(chatId);
  const ref = doc(db, "customers", id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { last_active_at: serverTimestamp() });
    return snap.data();
  }
  const data = {
    telegram_id: id, name,
    total_orders: 0, total_spent: 0, loyalty_points: 0,
    repeat_items: {}, pending_order: null,
    created_at: serverTimestamp(), last_active_at: serverTimestamp(),
  };
  await setDoc(ref, data);
  return data;
}

// ═══════════════════════════════════════════
// تاريخ المحادثة
// ═══════════════════════════════════════════
async function getHistory(chatId: string, lim = 12) {
  const q = query(
    collection(db, "messages"),
    where("customer_id", "==", chatId),
    orderBy("created_at", "desc"),
    limit(lim)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data()).reverse();
}

async function saveMsg(chatId: string, role: string, text: string) {
  await addDoc(collection(db, "messages"), {
    customer_id: chatId, role, content: text,
    created_at: serverTimestamp(),
  });
}

// ═══════════════════════════════════════════
// أسعار من قاعدة البيانات
// ═══════════════════════════════════════════
async function findPrice(name: string) {
  const snap = await getDocs(collection(db, "market_offers"));
  let best: any = null;
  snap.forEach(d => {
    const p = d.data();
    if ((p.productName || "").includes(name) || name.includes(p.productName || "")) {
      if (!best || p.offerPrice < best.offerPrice) best = p;
    }
  });
  return best;
}

// ═══════════════════════════════════════════
// تسعير الطلب
// ═══════════════════════════════════════════
async function priceOrder(items: { name: string; qty: number; unit: string }[]) {
  const priced = [];
  let total = 0, saving = 0;
  for (const item of items) {
    const found = await findPrice(item.name);
    let price = found?.offerPrice || 10;
    let orig  = found?.originalPrice || price * 1.15;
    let store = found?.marketName || "متوسط السوق";
    const itemSaving = Math.max(0, (orig - price) * item.qty);
    priced.push({ ...item, price, store, item_total: price * item.qty, saving: itemSaving });
    total   += price * item.qty;
    saving  += itemSaving;
  }
  return { items: priced, total: +total.toFixed(2), saving: +saving.toFixed(2) };
}

// ═══════════════════════════════════════════
// منتجات على وشك النفاد
// ═══════════════════════════════════════════
async function getUrgentItems(chatId: string): Promise<string[]> {
  const snap = await getDocs(
    query(collection(db, "orders"),
      where("customer_id", "==", chatId),
      orderBy("created_at", "desc"), limit(10))
  );
  const urgent: string[] = [];
  snap.forEach(d => {
    const o = d.data();
    const date: Date = o.created_at?.toDate?.() || new Date();
    for (const item of (o.items || [])) {
      for (const [key, days] of Object.entries(REPLENISHMENT)) {
        if ((item.name || "").includes(key)) {
          const left = days - Math.floor((Date.now() - date.getTime()) / 86400000);
          if (left >= 0 && left <= 2) urgent.push(item.name);
        }
      }
    }
  });
  return [...new Set(urgent)].slice(0, 3);
}

// ═══════════════════════════════════════════
// بناء System Prompt مخصص
// ═══════════════════════════════════════════
async function buildPrompt(chatId: string, cust: any): Promise<string> {
  const repeat = cust.repeat_items || {};
  const top = Object.entries(repeat).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5).map(([n]) => n);
  const avg = cust.total_orders > 0 ? (cust.total_spent / cust.total_orders).toFixed(0) : "0";
  const budget = +avg < 80 ? "اقتصادي" : +avg < 200 ? "متوسط" : "مرتفع";
  const urgent = await getUrgentItems(chatId);

  return `أنت "سلتي" 🛒، مدير مشتريات شخصي ذكي للعائلات في بريدة والقصيم.

== معلومات العميل ==
الاسم: ${cust.name || "عزيزي"}
عدد طلباته: ${cust.total_orders}
مستوى إنفاقه: ${budget} (متوسط ${avg} ريال/طلب)
نقاط المكافآت: ${cust.loyalty_points}
أكثر منتجاته طلباً: ${top.join("، ") || "لا توجد بيانات بعد"}
${urgent.length ? `⚠️ منتجات على وشك النفاد: ${urgent.join("، ")}` : ""}

== شخصيتك ==
ودود، مباشر، بلهجة سعودية خليجية بسيطة. تحرص على توفير المال للعميل.
استخدم عبارات مثل: "أبشر"، "من عيوني"، "يا هلا".

== عند استخراج طلب ==
أخرج JSON داخل code block هكذا فقط:
\`\`\`json
{"type":"order","items":[{"name":"اسم المنتج","qty":1,"unit":"كغ"}],"message":"رسالة ودية"}
\`\`\`

== قواعد ==
- ردود قصيرة 3-5 أسطر
- إيموجي معتدل
- اختم بـ "تبي تضيف شي ثاني؟ 🛒"
- إذا رد بـ "نعم" بعد اقتراح ← أضفه للطلب`;
}

// ═══════════════════════════════════════════
// استدعاء Gemini
// ═══════════════════════════════════════════
async function callAI(userMsg: string, history: any[], prompt: string) {
  const contents = [
    { role: "user", parts: [{ text: prompt }] },
    ...history.map((h: any) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] })),
    { role: "user", parts: [{ text: userMsg }] },
  ];
  const res = await ai.models.generateContent({ model: "gemini-2.0-flash", contents });
  const raw = res.text || "";
  const match = raw.match(/```json\s*([\s\S]*?)```/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.type === "order") return { raw, parsed };
    } catch {}
  }
  return { raw, parsed: null };
}

// ═══════════════════════════════════════════
// إرسال رسالة تيليجرام
// ═══════════════════════════════════════════
async function send(chatId: number, text: string, keyboard?: object) {
  if (!bot) return;
  const payload: any = { chat_id: chatId, text, parse_mode: "HTML" };
  if (keyboard) payload.reply_markup = keyboard;
  await (bot.telegram as any).sendMessage(chatId, text, { parse_mode: "HTML", reply_markup: keyboard });
}

function confirmKeyboard() {
  return { inline_keyboard: [[
    { text: "✅ تأكيد الطلب", callback_data: "confirm" },
    { text: "❌ إلغاء",       callback_data: "cancel"  },
  ]] };
}

function formatSummary(pricing: any, message: string): string {
  const lines = pricing.items.map((i: any) =>
    `• ${i.name} × ${i.qty} ${i.unit} — <b>${i.item_total} ريال</b> (${i.store})`
  ).join("\n");
  return `${message}\n\n📋 <b>ملخص طلبك:</b>\n${lines}\n\n` +
    `💰 المجموع: <b>${pricing.total} ريال</b>\n` +
    `🎁 وفّرت: <b>${pricing.saving} ريال</b>\n` +
    `🚀 توصيل خلال 45–60 دقيقة`;
}

// ═══════════════════════════════════════════
// Bot Logic
// ═══════════════════════════════════════════
if (bot) {
  // رسائل عادية
  bot.on("text", async (ctx) => {
    const chatId = ctx.chat.id;
    const uid = String(chatId);
    const text = ctx.message.text.trim();
    const name = ctx.from.first_name || "عزيزي";

    const cust = await getOrCreateCustomer(chatId, name);

    // /start
    if (text === "/start") {
      const urgent = await getUrgentItems(uid);
      if (urgent.length && cust.total_orders > 1) {
        await ctx.reply(
          `أهلاً <b>${name}</b>! 👋\n\n` +
          `⚠️ يبدو أن هذه المنتجات على وشك تنتهي:\n` +
          urgent.map(i => `• ${i}`).join("\n") + "\n\nتبي أطلبها لك؟ 🛒",
          { parse_mode: "HTML" }
        );
      } else {
        await ctx.reply(
          `أهلاً <b>${name}</b>! 👋\nأنا <b>سلتي</b> 🛒 — مدير مشترياتك الشخصي.\n\nقولي وش تحتاج وأجيب لك أرخص سعر! 💰`,
          { parse_mode: "HTML" }
        );
      }
      return;
    }

    // نقاطي
    if (text.includes("نقاطي")) {
      await ctx.reply(`⭐ نقاطك: <b>${cust.loyalty_points || 0} نقطة</b>\nكل 100 نقطة = خصم 10 ريال 🎁`, { parse_mode: "HTML" });
      return;
    }

    const history = await getHistory(uid);
    const prompt  = await buildPrompt(uid, cust);
    const { raw, parsed } = await callAI(text, history, prompt);

    await saveMsg(uid, "user", text);
    await saveMsg(uid, "assistant", raw);

    if (parsed?.type === "order" && parsed.items?.length) {
      const pricing = await priceOrder(parsed.items);
      await setDoc(doc(db, "customers", uid), { pending_order: { pricing, message: parsed.message } }, { merge: true });
      await ctx.reply(formatSummary(pricing, parsed.message), { parse_mode: "HTML", reply_markup: confirmKeyboard() });
    } else {
      await ctx.reply(raw, { parse_mode: "HTML" });
    }
  });

  // أزرار تأكيد / إلغاء
  bot.on("callback_query", async (ctx: any) => {
    const chatId = ctx.callbackQuery.message.chat.id;
    const uid    = String(chatId);
    const action = ctx.callbackQuery.data;
    await ctx.answerCbQuery();

    const custSnap = await getDoc(doc(db, "customers", uid));
    if (!custSnap.exists()) return;
    const cust = custSnap.data();
    const pending = cust.pending_order;

    if (action === "confirm" && pending) {
      const { pricing, message } = pending;

      await addDoc(collection(db, "orders"), {
        customer_id: uid,
        items: pricing.items,
        total_amount: pricing.total,
        saved_amount: pricing.saving,
        status: "confirmed",
        created_at: serverTimestamp(),
      });

      // تحديث سلوك العميل
      const repeat = cust.repeat_items || {};
      for (const item of pricing.items) repeat[item.name] = (repeat[item.name] || 0) + 1;
      const pts = Math.floor(pricing.total / 10);
      await updateDoc(doc(db, "customers", uid), {
        pending_order: null,
        repeat_items: repeat,
        total_orders: increment(1),
        total_spent:  increment(pricing.total),
        loyalty_points: increment(pts),
      });

      await ctx.reply(
        `✅ <b>تم تأكيد طلبك يا ${cust.name}!</b>\n\n` +
        `💰 ${pricing.total} ريال | 🎁 وفّرت ${pricing.saving} ريال\n` +
        `⭐ كسبت +${pts} نقطة\n🴣 المندوب في الطريق!`,
        { parse_mode: "HTML" }
      );

    } else if (action === "cancel") {
      await updateDoc(doc(db, "customers", uid), { pending_order: null });
      await ctx.reply("تم الإلغاء 👍\nتبي تطلب شي ثاني؟ 🛒");
    }
  });

  bot.launch();
  console.log("✅ Telegram Bot running");
}

// ═══════════════════════════════════════════
// Seed بيانات تجريبية
// ═══════════════════════════════════════════
async function seedIfEmpty() {
  const snap = await getDocs(query(collection(db, "market_offers"), limit(1)));
  if (!snap.empty) return;

  const offers = [
    { productName: "أرز مصري 5كغ",    marketName: "هايبر بنده",   offerPrice: 21.95, originalPrice: 25.00 },
    { productName: "أرز بسمتي 5كغ",   marketName: "أسواق العثيم", offerPrice: 29.95, originalPrice: 35.00 },
    { productName: "زيت نخيل 1.5ل",   marketName: "لولو هايبر",  offerPrice: 11.50, originalPrice: 13.00 },
    { productName: "زيت زيتون 750مل", marketName: "هايبر بنده",   offerPrice: 26.95, originalPrice: 32.00 },
    { productName: "حليب المراعي 1ل", marketName: "كارفور",        offerPrice:  4.95, originalPrice:  5.50 },
    { productName: "حليب نادك 1ل",    marketName: "هايبر بنده",   offerPrice:  4.25, originalPrice:  5.00 },
    { productName: "دجاج مجمد 1كغ",   marketName: "أسواق العثيم", offerPrice: 15.95, originalPrice: 18.00 },
    { productName: "بيض بلدي 30حبة",  marketName: "لولو هايبر",  offerPrice: 19.95, originalPrice: 22.00 },
    { productName: "عصير نادك 1ل",    marketName: "كارفور",        offerPrice:  4.95, originalPrice:  6.00 },
    { productName: "مياه نسمة 1.5ل",  marketName: "هايبر بنده",   offerPrice:  1.15, originalPrice:  1.50 },
    { productName: "سكر أبيض 2كغ",    marketName: "أسواق العثيم", offerPrice:  7.50, originalPrice:  8.50 },
    { productName: "شاي أحمد 200جم",  marketName: "لولو هايبر",  offerPrice: 11.95, originalPrice: 14.00 },
    { productName: "تمر سكري 1كغ",    marketName: "كارفور",        offerPrice: 32.00, originalPrice: 38.00 },
    { productName: "معكرونة 500جم",   marketName: "هايبر بنده",   offerPrice:  5.95, originalPrice:  7.00 },
    { productName: "طماطم طازج 1كغ",  marketName: "أسواق العثيم", offerPrice:  3.25, originalPrice:  4.00 },
  ];

  for (const o of offers) {
    const id = Buffer.from(o.productName).toString("base64").slice(0, 20);
    await setDoc(doc(db, "market_offers", id), { ...o, scrapedAt: new Date().toISOString() });
  }
  console.log("✅ Seeded market_offers");
}

// ═══════════════════════════════════════════
// Express Server
// ═══════════════════════════════════════════
async function startServer() {
  const app = express();
  app.get("/api/health", (_, res) => res.json({ ok: true, bot: !!bot }));

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(process.cwd(), "dist");
    app.use(express.static(dist));
    app.get("*", (_, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.listen(3000, "0.0.0.0", async () => {
    console.log("🚀 Server running on http://localhost:3000");
    await seedIfEmpty();
  });
}

startServer();
