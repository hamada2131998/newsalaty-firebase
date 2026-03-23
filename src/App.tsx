/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageCircle, 
  LayoutDashboard, 
  ShoppingCart, 
  User, 
  TrendingDown, 
  Send, 
  CheckCheck,
  Package,
  Star,
  History,
  LogIn,
  LogOut,
  Loader2,
  Plus,
  Trash2,
  Edit2,
  Save,
  X
} from 'lucide-react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth, signInWithGoogle } from './firebase';
import { saltAgent } from './services/geminiService';
import { 
  subscribeToAllOrders, 
  subscribeToLoyalty, 
  subscribeToProfile,
  createOrder,
  subscribeToProducts,
  addProduct,
  updateProduct,
  deleteProduct
} from './services/firestoreService';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

function SaltiApp() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'chat' | 'products'>('dashboard');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'هلا والله! أنا وكيلك في سلتي. وش محتاج للبيت اليوم؟ عندي عروض قوية على الرز والزيت.',
      sender: 'agent',
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loyalty, setLoyalty] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', sellingPrice: 0, stock: 0, unit: 'كيلو', category: 'عام' });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user && isAuthReady) {
      const unsubOrders = subscribeToAllOrders(setOrders);
      const unsubLoyalty = subscribeToLoyalty(user.uid, setLoyalty);
      const unsubProfile = subscribeToProfile(user.uid, setProfile);
      const unsubProducts = subscribeToProducts(setProducts);
      
      return () => {
        unsubOrders();
        unsubLoyalty();
        unsubProfile();
        unsubProducts();
      };
    }
  }, [user, isAuthReady]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    const history = messages.map(m => ({
      role: m.sender === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }]
    }));

    const response = await saltAgent(inputText, history);

    const agentMsg: Message = {
      id: (Date.now() + 1).toString(),
      text: response || 'عذراً، لم أستطع فهم ذلك.',
      sender: 'agent',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, agentMsg]);
    setIsTyping(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleAddProduct = async () => {
    if (!newProduct.name || newProduct.sellingPrice <= 0) return;
    await addProduct(newProduct);
    setNewProduct({ name: '', sellingPrice: 0, stock: 0, unit: 'كيلو', category: 'عام' });
    setIsAddingProduct(false);
  };

  const handleDeleteProduct = async (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
      await deleteProduct(id);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <Loader2 className="animate-spin text-[#128C7E]" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white p-8 text-center">
        <div className="w-24 h-24 bg-[#128C7E] rounded-full flex items-center justify-center font-bold text-4xl text-white mb-8 shadow-xl">
          س
        </div>
        <h1 className="text-3xl font-bold text-gray-800 mb-4">لوحة تحكم سلتي</h1>
        <p className="text-gray-600 mb-12 max-w-xs">هذه اللوحة مخصصة لك كصاحب مشروع لمتابعة طلبات العملاء عبر تيليجرام.</p>
        <button 
          onClick={signInWithGoogle}
          className="flex items-center gap-3 bg-white border border-gray-300 px-8 py-3 rounded-full shadow-md hover:shadow-lg transition-shadow font-medium text-gray-700 active:scale-95"
        >
          <LogIn size={20} className="text-gray-500" />
          تسجيل الدخول كمدير
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-white shadow-2xl overflow-hidden font-sans">
      {/* Header */}
      <header className="bg-[#075E54] text-white p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center font-bold text-xl">
            س
          </div>
          <div>
            <h1 className="font-bold text-lg">سلتي | Salti</h1>
            <p className="text-xs text-emerald-200">مدير مشترياتك الشخصي</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setActiveTab('chat')}
            className={`p-2 rounded-lg transition-colors ${activeTab === 'chat' ? 'bg-white/20' : ''}`}
          >
            <MessageCircle size={20} />
          </button>
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`p-2 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-white/20' : ''}`}
          >
            <LayoutDashboard size={20} />
          </button>
          <button 
            onClick={() => setActiveTab('products')}
            className={`p-2 rounded-lg transition-colors ${activeTab === 'products' ? 'bg-white/20' : ''}`}
          >
            <Package size={20} />
          </button>
          <button 
            onClick={handleSignOut}
            className="p-2 rounded-lg hover:bg-white/20 transition-colors"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative bg-[#E5DDD5]">
        <AnimatePresence mode="wait">
          {activeTab === 'chat' ? (
            <motion.div 
              key="chat"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex flex-col h-full items-center justify-center p-8 text-center bg-white"
            >
              <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6">
                <MessageCircle size={40} />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">المحادثات الآن عبر تيليجرام</h3>
              <p className="text-sm text-gray-500 mb-8">
                عملاؤك يتحدثون الآن مع "وكيل سلتي" مباشرة عبر تطبيق تيليجرام. يمكنك متابعة الطلبات والتحليلات من تبويب "لوحة التحكم".
              </p>
              <a 
                href="https://t.me/botfather" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[#128C7E] font-bold underline"
              >
                تأكد من ربط TELEGRAM_BOT_TOKEN في الإعدادات
              </a>
            </motion.div>
          ) : activeTab === 'products' ? (
            <motion.div 
              key="products"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="h-full bg-gray-50 overflow-y-auto p-4 space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">قاعدة بيانات المنتجات</h2>
                <button 
                  onClick={() => setIsAddingProduct(!isAddingProduct)}
                  className="bg-[#128C7E] text-white p-2 rounded-full shadow-lg active:scale-90 transition-transform"
                >
                  {isAddingProduct ? <X size={20} /> : <Plus size={20} />}
                </button>
              </div>

              {isAddingProduct && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-emerald-100 space-y-3"
                >
                  <input 
                    type="text" 
                    placeholder="اسم المنتج (مثلاً: رز هندي)" 
                    className="w-full p-2 border rounded-lg text-sm"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input 
                      type="number" 
                      placeholder="السعر" 
                      className="w-full p-2 border rounded-lg text-sm"
                      value={newProduct.sellingPrice || ''}
                      onChange={(e) => setNewProduct({...newProduct, sellingPrice: parseFloat(e.target.value)})}
                    />
                    <input 
                      type="text" 
                      placeholder="الوحدة (كيلو/حبة)" 
                      className="w-full p-2 border rounded-lg text-sm"
                      value={newProduct.unit}
                      onChange={(e) => setNewProduct({...newProduct, unit: e.target.value})}
                    />
                  </div>
                  <input 
                    type="text" 
                    placeholder="التصنيف (مثلاً: أرز، زيوت)" 
                    className="w-full p-2 border rounded-lg text-sm"
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({...newProduct, category: e.target.value})}
                  />
                  <button 
                    onClick={handleAddProduct}
                    className="w-full bg-[#128C7E] text-white py-2 rounded-lg font-bold"
                  >
                    إضافة المنتج
                  </button>
                </motion.div>
              )}

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Technical Grid Header */}
                <div className="grid grid-cols-5 p-3 bg-gray-100 border-bottom border-gray-200">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">المنتج</span>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 text-center">التصنيف</span>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 text-center">السعر</span>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 text-center">المخزون</span>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 text-left">إجراء</span>
                </div>

                <div className="divide-y divide-gray-50">
                  {products.length > 0 ? products.map((p) => (
                    <div key={p.id} className="grid grid-cols-5 p-3 items-center hover:bg-gray-50 transition-colors">
                      <div className="text-sm font-medium text-gray-800 truncate">{p.name}</div>
                      <div className="text-xs text-center text-gray-400">{p.category || 'عام'}</div>
                      <div className="text-sm font-mono text-center text-emerald-600">{p.sellingPrice} ر.س</div>
                      <div className="text-sm text-center text-gray-500">{p.stock || 0} {p.unit}</div>
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => handleDeleteProduct(p.id)}
                          className="p-1 text-red-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div className="p-8 text-center text-gray-400 text-sm italic">
                      لا توجد منتجات حالياً. أضف منتجك الأول!
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full bg-gray-50 overflow-y-auto p-4 space-y-6"
            >
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-gray-800">لوحة تحكم الوكيل</h2>
                <p className="text-sm text-gray-500">تحليل ذكي للعميل: {user.displayName || 'أحمد'}</p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex items-center gap-2 text-blue-600 mb-1">
                    <Package size={18} />
                    <span className="text-xs font-bold">إجمالي الطلبات</span>
                  </div>
                  <div className="text-2xl font-bold">{orders.length}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex items-center gap-2 text-emerald-600 mb-1">
                    <TrendingDown size={18} />
                    <span className="text-xs font-bold">إجمالي التوفير</span>
                  </div>
                  <div className="text-2xl font-bold">{orders.reduce((acc, o) => acc + (o.totalSavings || 0), 0)} ر.س</div>
                </div>
              </div>

              {/* Intelligence Layers */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                <h3 className="font-bold flex items-center gap-2">
                  <Package size={18} className="text-blue-500" />
                  تحليل محادثات تيليجرام
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-2 bg-blue-50 rounded-lg">
                    <span className="text-sm font-medium">الطبقة 1: السلوك</span>
                    <span className="text-xs bg-blue-200 text-blue-700 px-2 py-0.5 rounded-full">نشط</span>
                  </div>
                  <p className="text-xs text-gray-600 px-2">يتم تحليل أنماط الطلب من المحادثات المباشرة لتوقع الاحتياجات القادمة.</p>
                  
                  <div className="flex justify-between items-center p-2 bg-purple-50 rounded-lg">
                    <span className="text-sm font-medium">الطبقة 2: الشخصية</span>
                    <span className="text-xs bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full">محلل</span>
                  </div>
                  <p className="text-xs text-gray-600 px-2">الوكيل يفهم نبرة العميل ويقدم العروض التي تناسب أسلوبه في اتخاذ القرار.</p>
                </div>
              </div>

              {/* Recent Orders */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                <h3 className="font-bold flex items-center gap-2">
                  <History size={18} className="text-gray-500" />
                  آخر الطلبات
                </h3>
                <div className="space-y-3">
                  {orders.length > 0 ? orders.map((o) => (
                    <div key={o.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                      <div>
                        <div className="font-medium">{o.customerName || 'عميل تيليجرام'}</div>
                        <div className="text-xs text-gray-400">
                          {o.createdAt?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || 'الآن'}
                        </div>
                      </div>
                      <div className="font-bold text-emerald-600">{o.totalAmount} ر.س</div>
                    </div>
                  )) : (
                    <p className="text-xs text-gray-400 text-center py-4">لا توجد طلبات سابقة</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Nav (Mobile Style) */}
      <footer className="bg-white border-t border-gray-100 p-2 flex justify-around shrink-0">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'dashboard' ? 'text-[#128C7E]' : 'text-gray-400'}`}
        >
          <LayoutDashboard size={20} />
          <span className="text-[10px]">الرئيسية</span>
        </button>
        <button 
          onClick={() => setActiveTab('products')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'products' ? 'text-[#128C7E]' : 'text-gray-400'}`}
        >
          <Package size={20} />
          <span className="text-[10px]">المنتجات</span>
        </button>
        <button 
          onClick={() => setActiveTab('chat')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'chat' ? 'text-[#128C7E]' : 'text-gray-400'}`}
        >
          <MessageCircle size={20} />
          <span className="text-[10px]">المحادثة</span>
        </button>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <SaltiApp />
  );
}
