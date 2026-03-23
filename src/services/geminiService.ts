import { GoogleGenAI } from "@google/genai";
import { createOrder } from "./firestoreService";
import { auth } from "../firebase";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const saltAgent = async (message: string, history: any[]) => {
  const user = auth.currentUser;

  const systemInstruction = `أنت "سلتي" 🛒، مساعد مشتريات ذكي للعائلات السعودية في بريدة.
شخصيتك: ودود، مباشر، بلهجة سعودية خفيفة.
مهمتك: مساعدة العميل في طلب احتياجاته بأرخص سعر.

قواعد:
- ردود قصيرة ومفيدة (3-5 أسطر)
- استخدم الإيموجي باعتدال
- اختم بـ "تبي تضيف شي؟ 🛒"

أمثلة أسعار:
- أرز 5كغ: 21.95 ريال (بنده) مقابل 25 ريال (السوق)
- زيت 1.5ل: 11.50 ريال (لولو) مقابل 13 ريال (السوق)
- حليب 1ل: 4.25 ريال (بنده) مقابل 5.50 ريال (السوق)

عند تأكيد الطلب استدعِ createOrder.`;

  try {
    const contents = [
      { role: "user", parts: [{ text: systemInstruction }] },
      ...history,
      { role: "user", parts: [{ text: message }] },
    ];

    const res = await ai.models.generateContent({ model: "gemini-2.0-flash", contents });
    const text = res.text || "";

    // كشف تأكيد الطلب
    if ((text.includes("تأكيد") || text.includes("تم")) && user) {
      const total   = Math.floor(Math.random() * 80) + 40;
      const savings = Math.floor(total * 0.13);
      await createOrder(user.uid, total, savings, Math.floor(total / 10));
      return `✅ <b>تم تأكيد طلبك!</b>\nإجمالي: <b>${total} ريال</b> | وفّرت: <b>${savings} ريال</b>\n⭐ كسبت ${Math.floor(total/10)} نقطة\n📦 يوصل خلال 45-60 دقيقة!`;
    }

    return text;
  } catch (err) {
    console.error("Gemini error:", err);
    return "عذراً، واجهت مشكلة. حاول مرة أخرى.";
  }
};
