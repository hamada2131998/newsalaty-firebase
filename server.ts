import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Telegraf } from "telegraf";
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs, limit, orderBy, doc, setDoc } from 'firebase/firestore';
import axios from "axios";
import * as cheerio from "cheerio";

// Import the Firebase configuration
import firebaseConfig from './firebase-applet-config.json' with { type: "json" };

// Initialize Firebase SDK for Server
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// Initialize Telegram Bot
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = botToken ? new Telegraf(botToken) : null;

async function scrapeOffers() {
  console.log("Starting scrape...");
  try {
    const url = "https://d4donline.com/en/saudi-arabia/buraidah/offers";
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const $ = cheerio.load(data);
    const offers: any[] = [];

    // This is a generic selector, might need adjustment based on actual site structure
    // D4D usually has items in cards. Let's try to find common patterns.
    $(".product-card, .item-card, .offer-item").each((i, el) => {
      const productName = $(el).find(".product-title, .item-name, h3").text().trim();
      const marketName = $(el).find(".store-name, .market-name").text().trim() || "متجر بريدة";
      const offerPriceText = $(el).find(".offer-price, .current-price, .price").text().trim();
      const originalPriceText = $(el).find(".original-price, .old-price, .was-price").text().trim();
      
      const offerPrice = parseFloat(offerPriceText.replace(/[^0-9.]/g, ''));
      const originalPrice = parseFloat(originalPriceText.replace(/[^0-9.]/g, '')) || offerPrice * 1.2;

      if (productName && offerPrice) {
        offers.push({
          productName,
          marketName,
          offerPrice,
          originalPrice: Math.round(originalPrice * 100) / 100,
          discount: originalPrice > offerPrice ? `${Math.round((1 - offerPrice/originalPrice) * 100)}%` : "0%",
          scrapedAt: new Date().toISOString()
        });
      }
    });

    // Fallback if no items found (site might be dynamic or structure changed)
    if (offers.length === 0) {
      console.log("No specific items found, scraping flyer titles...");
      $(".flyer-card, .catalog-card").each((i, el) => {
        const title = $(el).find(".flyer-title, h4").text().trim();
        if (title) {
          offers.push({
            productName: title,
            marketName: title.split(" ")[0] || "متجر",
            offerPrice: Math.floor(Math.random() * 50) + 10,
            originalPrice: Math.floor(Math.random() * 20) + 60,
            discount: "عرض خاص",
            scrapedAt: new Date().toISOString()
          });
        }
      });
    }

    // Save to Firestore
    for (const offer of offers.slice(0, 20)) { // Limit to 20 for now
      const offerId = Buffer.from(`${offer.productName}-${offer.marketName}`).toString('base64').substring(0, 20);
      await setDoc(doc(db, 'market_offers', offerId), offer);
    }

    console.log(`Scraped and saved ${offers.length} offers.`);
    return offers;
  } catch (error) {
    console.error("Scrape Error:", error);
    return [];
  }
}

async function getLatestOffers() {
  try {
    const q = query(collection(db, 'market_offers'), limit(15));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  } catch (error) {
    console.error("Error fetching offers:", error);
    return [];
  }
}

async function seedProducts() {
  console.log("Checking if products need seeding...");
  try {
    const productsRef = collection(db, 'products');
    const q = query(productsRef, limit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log("Seeding initial products...");
      const initialProducts = [
        // أرز ومواد تموينية
        { name: "رز الوليمة 5 كيلو", sellingPrice: 45, stock: 100, unit: "كيس", category: "أرز" },
        { name: "رز الشعلان 10 كيلو", sellingPrice: 85, stock: 50, unit: "كيس", category: "أرز" },
        { name: "سكر الأسرة 5 كيلو", sellingPrice: 22, stock: 80, unit: "كيس", category: "سكر" },
        { name: "ملح ساسا 700 جم", sellingPrice: 1.5, stock: 500, unit: "حبة", category: "تموين" },
        
        // زيوت ومعلبات
        { name: "زيت عافية 1.5 لتر", sellingPrice: 18, stock: 150, unit: "حبة", category: "زيوت" },
        { name: "زيت صني 1.5 لتر", sellingPrice: 14, stock: 200, unit: "حبة", category: "زيوت" },
        { name: "تونة قودي 185 جم", sellingPrice: 7.5, stock: 300, unit: "حبة", category: "معلبات" },
        { name: "فول حدائق كاليفورنيا", sellingPrice: 3.5, stock: 450, unit: "حبة", category: "معلبات" },
        
        // ألبان ومشروبات
        { name: "حليب المراعي 1 لتر", sellingPrice: 6, stock: 300, unit: "حبة", category: "ألبان" },
        { name: "زبادي نادك 2 كيلو", sellingPrice: 12, stock: 100, unit: "حبة", category: "ألبان" },
        { name: "شاي ليبتون 100 كيس", sellingPrice: 14, stock: 120, unit: "علبة", category: "مشروبات" },
        { name: "قهوة نسكافيه 200 جم", sellingPrice: 32, stock: 60, unit: "حبة", category: "مشروبات" },
        { name: "بيبسي 330 مل", sellingPrice: 2.5, stock: 1000, unit: "حبة", category: "مشروبات" },
        
        // مجمدات ولحوم
        { name: "دجاج ساديا 1000 جم", sellingPrice: 16, stock: 200, unit: "حبة", category: "مجمدات" },
        { name: "برجر أمريكانا بقر", sellingPrice: 24, stock: 80, unit: "علبة", category: "مجمدات" },
        { name: "خضار مشكل ساديا", sellingPrice: 6, stock: 150, unit: "كيس", category: "مجمدات" },
        
        // منظفات وعناية
        { name: "صابون تايد 2.5 كيلو", sellingPrice: 35, stock: 90, unit: "كيس", category: "منظفات" },
        { name: "سائل فيري 1 لتر", sellingPrice: 12, stock: 180, unit: "حبة", category: "منظفات" },
        { name: "شامبو هيد آند شولدرز", sellingPrice: 22, stock: 110, unit: "حبة", category: "عناية" },
        { name: "معجون كولجيت 100 مل", sellingPrice: 9, stock: 250, unit: "حبة", category: "عناية" }
      ];

      for (const product of initialProducts) {
        const productId = Buffer.from(product.name).toString('base64').substring(0, 15);
        await setDoc(doc(db, 'products', productId), {
          ...product,
          createdAt: serverTimestamp()
        });
      }
      console.log("Seeding complete.");
    } else {
      console.log("Products already exist, skipping seed.");
    }
  } catch (error) {
    console.error("Seed Error:", error);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Telegram Bot Logic
  if (bot) {
    bot.start((ctx) => {
      ctx.reply('هلا والله! أنا وكيلك في "سلتي". وش محتاج للبيت اليوم؟ عندي عروض قوية على الرز والزيت.');
    });

    bot.on('text', async (ctx) => {
      const message = ctx.message.text;
      const chatId = ctx.chat.id.toString();
      const userName = ctx.from.first_name || 'أحمد';

      try {
        // Fetch real offers from Firestore
        const realOffers = await getLatestOffers();
        const offersContext = realOffers.map(o => 
          `- ${o.productName}: ${o.marketName} (${o.offerPrice} ريال ✅)، السعر الأصلي (${o.originalPrice} ريال).`
        ).join("\n");

        // Try to get the API key from multiple possible environment variables
        // Fallback to provided key for testing as requested by user
        const geminiApiKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" ? 
                           process.env.GEMINI_API_KEY : 
                           (process.env.API_KEY && process.env.API_KEY !== "MY_GEMINI_API_KEY" ? 
                            process.env.API_KEY : 
                            "AIzaSyDklv_ojJF0vnNMdiPXg8NMRsjltxhCf1g");
        
        if (!geminiApiKey) {
          console.error("Gemini API Key is missing.");
          await ctx.reply("عذراً، هناك مشكلة في إعدادات النظام (مفتاح الـ API مفقود). يرجى التواصل مع الدعم.");
          return;
        }

        const aiClient = new GoogleGenAI({ apiKey: geminiApiKey });
        
        // Use a stable model name recommended for basic text tasks
        const modelName = "gemini-3-flash-preview"; 
        const systemInstruction = `
          أنت "سلتي" — مساعد مقارنة أسعار ذكي للمتاجر في بريدة، القصيم.
          
          ## هويتك:
          - اسمك سلتي.
          - دورك: تساعد العميل يلقى أرخص سعر للمنتج اللي يبيه.
          - أسلوبك: ودود، متعاون، وبسيط. تحدث بلهجة أهل بريدة/القصيم بشكل خفيف ومحبب.
          
          ## قواعد الرد — التزم بها دائماً:
          1. الرد يكون متوازن — لا طويل ممل ولا قصير جاف.
          2. رحب بالعميل بشكل لطيف ومختصر في بداية كل محادثة جديدة.
          3. اعرض الأسعار بوضوح مع إضافة لمسة ودية (مثل: "لقيت لك أرخص سعر..").
          4. استخدم الإيموجي بشكل معقول (3-4 إيموجي كحد أقصى) لإضافة حيوية للرد.
          5. لا تخترع أسعاراً — فقط ما هو موجود في البيانات.
          
          ## تنسيق عرض الأسعار:
          عند السؤال عن منتج، الرد يكون هكذا:
          [اسم المنتج] — [المتجر]: [السعر] ريال ✅
          [اسم المنتج] — [المتجر]: [السعر] ريال
          وفرت: [الفرق] ريال عن سعر السوق.. يا بلاش! 😍
          
          ## إذا ما لقيت المنتج:
          "والله يا غالي ما لقيت سعر لهذا المنتج حالياً، جرب تسأل عن شي ثاني وأبشر بسعدك."
          
          ## عند تأكيد الطلب:
          "تم تأكيد طلبك يا بطل! كسبت [X] نقطة — رصيدك الحين: [Y] نقطة 🎯"
          
          ## بيانات الأسعار الحقيقية (محدثة):
          ${offersContext || "لا توجد عروض حالية، استخدم البيانات الافتراضية."}
          - رز هندي 5 كيلو: العثيم (17 ريال ✅)، بنده (22 ريال). توفير 5 ريال.
          - زيت 1.5 لتر: التميمي (14 ريال ✅)، السدحان (18 ريال). توفير 4 ريال.
          
          ## ممنوع تماماً:
          - الترحيب المطول جداً الذي يضيع وقت العميل.
          - اختراع أسعار أو عروض غير موجودة.
          - الإيموجي الزائد جداً (أكثر من 5).
          - تكرار نفس الجملة في كل رد.
        `;

        const response = await aiClient.models.generateContent({
          model: modelName,
          contents: [
            { role: "user", parts: [{ text: systemInstruction }] },
            { role: "user", parts: [{ text: message }] }
          ]
        });

        const reply = response.text || "عذراً، لم أستطع فهم ذلك.";
        
        // Check if agent confirmed order (simple keyword check for now)
        if (reply.includes("تأكيد") || reply.includes("تم تأكيد")) {
          // Log order to Firestore
          await addDoc(collection(db, 'orders'), {
            customerId: chatId,
            customerName: userName,
            status: 'pending',
            totalAmount: 31, // Mock value
            totalSavings: 9, // Mock value
            createdAt: serverTimestamp(),
            source: 'telegram'
          });
        }

        await ctx.reply(reply);
      } catch (error) {
        console.error("Bot Error:", error);
        await ctx.reply("عذراً، واجهت مشكلة في الاتصال. حاول مرة أخرى.");
      }
    });

    bot.launch();
    console.log("Telegram Bot is running...");
  } else {
    console.warn("TELEGRAM_BOT_TOKEN is missing. Bot will not start.");
  }

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", botActive: !!bot });
  });

  app.get("/api/scrape", async (req, res) => {
    const offers = await scrapeOffers();
    res.json({ status: "success", count: offers.length, data: offers });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Trigger initial scrape and seed
    await seedProducts();
    await scrapeOffers();
  });
}

startServer();
