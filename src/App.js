import React, { useState, useMemo, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, onSnapshot, 
  setDoc, addDoc, updateDoc, deleteDoc, query 
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  Calendar as CalendarIcon, Download, Plus, Trash2, Edit2, TrendingUp, 
  X, Car, Settings, ExternalLink, ChevronLeft, ChevronRight,
  DollarSign, PieChart, RefreshCcw, AlertTriangle
} from 'lucide-react';

// --- Firebase 配置區 ---
const firebaseConfig = {
  apiKey: "AIzaSyCvbOfki9YzBJsWGPdg_6_Pit9YD13IGio",
  authDomain: "cheyicarwash.firebaseapp.com",
  projectId: "cheyicarwash",
  storageBucket: "cheyicarwash.firebasestorage.app",
  messagingSenderId: "104026011786",
  appId: "1:104026011786:web:715f9792fd88f4d9119573",
  measurementId: "G-5WJ42QRD47"
};

const isConfigValid = firebaseConfig.apiKey && firebaseConfig.apiKey !== "";

let app, db, auth;
if (isConfigValid) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
}

const APP_ID = 'cheyi-carwash-system';

const App = () => {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(isConfigValid);

  const initialServices = {
    '小&中型車': { '快速洗車': 300, '一般洗車': 800, '精緻洗車': 1800, '基本內裝清潔': 300, '車體鍍膜': 5000, '玻璃鍍膜': 1200, '內裝深層清潔': 1000 },
    '大型車': { '快速洗車': 350, '一般洗車': 900, '精緻洗車': 1900, '基本內裝清潔': 350, '車體鍍膜': 6000, '玻璃鍍膜': 1200, '內裝深層清潔': 1000 },
    '休旅車': { '快速洗車': 400, '一般洗車': 1000, '精緻洗車': 2000, '基本內裝清潔': 400, '車體鍍膜': 7000, '玻璃鍍膜': 2000, '內裝深層清潔': 1200 },
    '商旅車': { '快速洗車': 500, '一般洗車': 1200, '精緻洗車': 2200, '基本內裝清潔': 500, '車體鍍膜': 8000, '玻璃鍍膜': 2000, '內裝深層清潔': 1200 },
  };

  const [priceMatrix, setPriceMatrix] = useState(initialServices);

  const [formData, setFormData] = useState({
    customerName: '',
    date: new Date().toISOString().split('T')[0],
    carType: '',
    serviceItem: '',
    amount: 0,
    discount: 0,
    cost: 0,
    paymentMethod: '現金'
  });

  useEffect(() => {
    if (!isConfigValid) return;
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth Error", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'transactions'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(data);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;
    const priceDoc = doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'priceMatrix');
    const unsubscribe = onSnapshot(priceDoc, (snapshot) => {
      if (snapshot.exists()) setPriceMatrix(snapshot.data());
    });
    return () => unsubscribe();
  }, [user]);

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // 本週計算 (週一為一週開始)
    const startOfWeek = new Date(now);
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);
    
    const monthlyData = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const weeklyData = transactions.filter(t => {
      const d = new Date(t.date);
      return d >= startOfWeek;
    });

    return {
      revenueWeek: weeklyData.reduce((acc, t) => acc + (Number(t.amount) - Number(t.discount)), 0),
      countWeek: weeklyData.length,
      revenueMonth: monthlyData.reduce((acc, t) => acc + (Number(t.amount) - Number(t.discount)), 0),
      countMonth: monthlyData.length
    };
  }, [transactions]);

  const syncToGoogleCalendar = (t) => {
    const dateStr = t.date.replace(/-/g, '');
    const title = encodeURIComponent(`[家庭] ${t.customerName} - ${t.serviceItem}`);
    const details = encodeURIComponent(`車型：${t.carType}\n實收：$${t.amount - t.discount}\n備註：來自車奕管理系統`);
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dateStr}/${dateStr}&details=${details}`;
    window.open(url, '_blank');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    const data = { ...formData, amount: Number(formData.amount), discount: Number(formData.discount), cost: Number(formData.cost) };
    try {
      if (editingId) {
        await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'transactions', editingId), data);
      } else {
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'transactions'), data);
      }
      closeModal();
    } catch (err) { console.error("Save failed", err); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("確定要刪除這筆紀錄嗎？")) return;
    try { await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'transactions', id)); } catch (err) { console.error("Delete failed", err); }
  };

  const handlePriceChange = async (carType, service, newVal) => {
    const updated = { ...priceMatrix, [carType]: { ...priceMatrix[carType], [service]: Number(newVal) } };
    setPriceMatrix(updated);
    try { await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'priceMatrix'), updated); } catch (err) { console.error("Update pricing failed", err); }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newData = { ...prev, [name]: value };
      if ((name === 'carType' || name === 'serviceItem')) {
        const cType = name === 'carType' ? value : prev.carType;
        const sItem = name === 'serviceItem' ? value : prev.serviceItem;
        if (cType && sItem && priceMatrix[cType]?.[sItem]) newData.amount = priceMatrix[cType][sItem];
      }
      return newData;
    });
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({ customerName: '', date: new Date().toISOString().split('T')[0], carType: '', serviceItem: '', amount: 0, discount: 0, cost: 0, paymentMethod: '現金' });
  };

  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const days = [];

    for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-28 bg-slate-50/30 border-r border-b border-slate-100"></div>);
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayData = transactions.filter(t => t.date === dateStr);
      const isToday = new Date().toISOString().split('T')[0] === dateStr;

      days.push(
        <div key={d} className={`h-28 border-r border-b border-slate-100 p-2 relative group hover:bg-teal-50/10 transition-colors ${isToday ? 'bg-teal-50/30' : 'bg-white'}`}>
          <div className="flex justify-between items-center mb-1">
            <span className={`text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-teal-500 text-white' : 'text-slate-400'}`}>{d}</span>
          </div>
          <div className="overflow-y-auto max-h-[70px] space-y-1 no-scrollbar">
            {dayData.map(t => (
              <div key={t.id} className="text-[10px] bg-white border border-slate-100 p-1 rounded-md shadow-sm flex justify-between items-center group/item hover:border-teal-300 cursor-pointer"
                   onClick={() => { setEditingId(t.id); setFormData(t); setIsModalOpen(true); }}>
                <span className="truncate font-bold text-slate-600 flex-1">{t.customerName}</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); syncToGoogleCalendar(t); }}
                  className="text-teal-400 hover:text-teal-600 ml-1"
                  title="連結至 Google 日曆 [家庭]">
                  <ExternalLink size={10} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => { setIsModalOpen(true); setFormData(prev => ({...prev, date: dateStr})); }} className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 text-teal-500 hover:bg-teal-50 p-1 rounded-full transition-all">
            <Plus size={14}/>
          </button>
        </div>
      );
    }
    return days;
  };

  if (!isConfigValid) return <div className="p-20 text-center font-black">Firebase Key 尚未設定</div>;

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-[#F0F7F7]">
      <RefreshCcw size={40} className="text-teal-500 animate-spin" />
      <div className="font-black text-teal-600 tracking-widest">正在同步雲端資料...</div>
    </div>
  );

  const carTypes = Object.keys(priceMatrix);
  const serviceNames = Object.keys(priceMatrix['小&中型車']);

  return (
    <div className="min-h-screen bg-[#F0F7F7] font-sans text-slate-700 pb-12">
      <nav className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 mb-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-teal-400 to-cyan-500 text-white p-2.5 rounded-2xl shadow-lg shadow-teal-100">
              <Car size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">車奕管理系統</h1>
              <p className="text-[10px] font-bold text-teal-600 tracking-widest uppercase">Cloud Manager</p>
            </div>
          </div>
          <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
             <button onClick={() => setView('calendar')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === 'calendar' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
               <CalendarIcon size={14}/> 預約看板
             </button>
             <button onClick={() => setView('list')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === 'list' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
               <TrendingUp size={14}/> 營收清單
             </button>
             <button onClick={() => setView('pricing')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === 'pricing' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
               <Settings size={14}/> 價目管理
             </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="text-slate-400 text-[10px] font-black uppercase mb-1 tracking-widest">本週營收</h3>
            <span className="text-3xl font-black text-teal-600">${stats.revenueWeek.toLocaleString()}</span>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="text-slate-400 text-[10px] font-black uppercase mb-1 tracking-widest">本週台數</h3>
            <span className="text-3xl font-black text-slate-800">{stats.countWeek} <span className="text-sm font-bold text-slate-400">台</span></span>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="text-slate-400 text-[10px] font-black uppercase mb-1 tracking-widest">本月營收</h3>
            <span className="text-3xl font-black text-teal-600">${stats.revenueMonth.toLocaleString()}</span>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="text-slate-400 text-[10px] font-black uppercase mb-1 tracking-widest">本月台數</h3>
            <span className="text-3xl font-black text-slate-800">{stats.countMonth} <span className="text-sm font-bold text-slate-400">台</span></span>
          </div>
        </div>

        {view === 'calendar' && (
          <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-white">
            <div className="p-8 flex justify-between items-center border-b border-slate-50">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-black text-slate-800">{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</h2>
                <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
                  <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))} className="p-2 hover:bg-white rounded-lg text-slate-400 transition-all"><ChevronLeft size={16}/></button>
                  <button onClick={() => setCurrentDate(new Date())} className="px-3 text-xs font-bold text-slate-500">本月</button>
                  <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))} className="p-2 hover:bg-white rounded-lg text-slate-400 transition-all"><ChevronRight size={16}/></button>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl text-xs font-black shadow-lg shadow-slate-200 active:scale-95 transition-transform flex items-center gap-2">
                <Plus size={16}/> 新增預約
              </button>
            </div>
            <div className="grid grid-cols-7 text-center py-4 bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 bg-slate-50/20">
              {renderCalendar()}
            </div>
          </div>
        )}

        {view === 'pricing' && (
          <div className="bg-white rounded-[2.5rem] p-10 shadow-xl border border-white">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black">價目管理</h2>
              <div className="text-teal-500 bg-teal-50 px-4 py-2 rounded-xl text-[10px] font-bold flex items-center gap-2">
                <RefreshCcw size={14}/> 雲端即時同步中
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="p-4 text-[10px] font-black text-slate-300 uppercase tracking-widest">服務項目</th>
                    {carTypes.map(t => <th key={t} className="p-4 text-xs font-black text-slate-600">{t}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {serviceNames.map(service => (
                    <tr key={service} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-bold text-slate-700 text-sm">{service}</td>
                      {carTypes.map(type => (
                        <td key={`${type}-${service}`} className="p-2">
                          <div className="relative group">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-[10px] font-bold">$</span>
                            <input type="number" value={priceMatrix[type][service]} onChange={(e) => handlePriceChange(type, service, e.target.value)}
                              className="w-full bg-slate-50 border border-transparent focus:border-teal-200 rounded-xl py-3 pl-6 pr-2 text-sm font-black focus:bg-white outline-none transition-all" />
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === 'list' && (
          <div className="bg-white rounded-[2.5rem] p-10 shadow-xl border border-white">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black">營收清單</h2>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-50">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase tracking-widest font-black">
                  <tr>
                    <th className="p-5">日期</th>
                    <th className="p-5">客戶</th>
                    <th className="p-5">服務項目</th>
                    <th className="p-5 text-right">管理</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {transactions.sort((a,b) => new Date(b.date) - new Date(a.date)).map(t => (
                    <tr key={t.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="p-5 text-xs font-bold text-slate-400">{t.date}</td>
                      <td className="p-5">
                        <div className="font-black text-slate-800">{t.customerName}</div>
                        <div className="text-[10px] text-teal-600 font-bold">{t.carType}</div>
                      </td>
                      <td className="p-5 font-black text-slate-800">${(t.amount - t.discount).toLocaleString()}</td>
                      <td className="p-5 text-right">
                         <div className="flex justify-end gap-1">
                           <button onClick={() => syncToGoogleCalendar(t)} className="p-2 text-teal-400 hover:bg-teal-50 rounded-lg"><ExternalLink size={16}/></button>
                           <button onClick={() => { setEditingId(t.id); setFormData(t); setIsModalOpen(true); }} className="p-2 text-slate-300 hover:text-teal-500 rounded-lg transition-all"><Edit2 size={16}/></button>
                           <button onClick={() => handleDelete(t.id)} className="p-2 text-slate-300 hover:text-red-500 rounded-lg transition-all"><Trash2 size={16}/></button>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black">{editingId ? '編輯預約' : '新增預約'}</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Reserved for [家庭]</p>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X/></button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">客戶資訊</label>
                  <input type="text" required value={formData.customerName} name="customerName" onChange={handleInputChange} className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">日期</label>
                  <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">車型</label>
                  <select name="carType" required value={formData.carType} onChange={handleInputChange} className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm outline-none cursor-pointer">
                    <option value="">選擇車型</option>
                    {carTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">服務</label>
                  <select name="serviceItem" required value={formData.serviceItem} onChange={handleInputChange} className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm outline-none cursor-pointer">
                    <option value="">選擇服務</option>
                    {serviceNames.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="p-6 bg-teal-50 rounded-[2rem] flex justify-between items-center border border-teal-100">
                <div>
                   <label className="text-[10px] font-black text-teal-600 uppercase block mb-1">應收金額</label>
                   <span className="font-black text-3xl text-slate-800">${formData.amount - formData.discount}</span>
                </div>
                <div className="text-right">
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">折扣</label>
                  <input type="number" name="discount" value={formData.discount} onChange={handleInputChange} className="w-24 p-3 rounded-xl border-none text-right font-black bg-white shadow-sm outline-none" />
                </div>
              </div>

              <button type="submit" className="w-full bg-teal-500 text-white py-5 rounded-2xl font-black shadow-xl shadow-teal-100 active:scale-95 transition-all">
                確認儲存並同步
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;