import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { createOrder } from "./firestoreService";
import { auth } from "../firebase";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const createOrderFunctionDeclaration: FunctionDeclaration = {
  name: "createOrder",
  parameters: {
    type: Type.OBJECT,
    description: "إنشاء طلب جديد للعميل في قاعدة البيانات",
    properties: {
      totalAmount: {
        type: Type.NUMBER,
        description: "إجمالي قيمة الطلب بالريال السعودي",
      },
      totalSavings: {
        type: Type.NUMBER,
        description: "إجمالي المبلغ الذي وفره العميل مقارنة بأسعار السوق",
      },
      pointsEarned: {
        type: Type.NUMBER,
        description: "عدد النقاط التي كسبها العميل من هذا الطلب",
      },
    },
    required: ["totalAmount", "totalSavings", "pointsEarned"],
  },
};

export const saltAgent = async (message: string, history: any[]) => {
  const model = "gemini-3-flash-preview";
  const user = auth.currentUser;
  
  const systemInstruction = `
    أنت "وكيل سلتي" (Salti Agent)، مدير مشتريات شخصي ذكي لبيوت مدينة بريدة.
    اسم العميل الحالي: ${user?.displayName || 'أحمد'}.
    
    مهمتك هي مساعدة العميل في طلب احتياجاته الغذائية والمنزلية بأفضل سعر.
    
    مبادئك:
    1. التخصيص: أنت تعرف العميل وتعرف نمط استهلاكه، ناديه باسمه أحياناً.
    2. التوفير: قارن الأسعار دائماً وأخبره كم وفر بأسلوب مشجع.
    3. الأسلوب: ودود جداً، خدوم، يتحدث بلهجة أهل بريدة/القصيم بشكل خفيف ومحبب. لا تكن رسمياً ولا جافاً.
    4. الذكاء: إذا طلب "رز"، اقترح عليه النوع الذي يفضله عادة أو أخبره عن عرض أفضل بأسلوب "نصيحة من أخ".
    
    قواعد الرد:
    - كن طبيعياً في كلامك، استخدم عبارات مثل "أبشر"، "من عيوني"، "يا هلا والله".
    - استخدم الإيموجي (2-4) لإعطاء طابع ودي للدردشة.
    - لا تطل الكلام كثيراً، خير الكلام ما قل ودل وبنفس الوقت كان لطيفاً.
    
    عندما يقرر العميل إتمام الطلب (مثلاً يقول "أكد الطلب" أو "تم")، يجب عليك استدعاء وظيفة 'createOrder' بالقيم المناسبة.
    
    أمثلة للأسعار (للمحاكاة حالياً):
    - رز هندي 5 كيلو: 17 ريال (السوق: 22 ريال) -> توفير 5 ريال.
    - زيت 1.5 لتر: 14 ريال (السوق: 18 ريال) -> توفير 4 ريال.
    - نقاط الولاء: كل 10 ريال = 10 نقاط.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: [
        { role: "user", parts: [{ text: systemInstruction }] },
        ...history,
        { role: "user", parts: [{ text: message }] }
      ],
      config: {
        tools: [{ functionDeclarations: [createOrderFunctionDeclaration] }],
      }
    });

    const functionCalls = response.functionCalls;
    if (functionCalls) {
      for (const call of functionCalls) {
        if (call.name === "createOrder" && user) {
          const { totalAmount, totalSavings, pointsEarned } = call.args as any;
          await createOrder(user.uid, totalAmount, totalSavings, pointsEarned);
          return `تم تأكيد طلبك بنجاح يا ${user.displayName || 'أحمد'}! ✅\nإجمالي الطلب: ${totalAmount} ريال.\nوفرت اليوم: ${totalSavings} ريال.\nكسبت ${pointsEarned} نقطة.\nالتوصيل غداً الصبح بين 8-10. 📦`;
        }
      }
    }

    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "عذراً، واجهت مشكلة في الاتصال. حاول مرة أخرى.";
  }
};
