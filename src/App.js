import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Download, 
  Plus, 
  Trash2, 
  Edit2, 
  TrendingUp, 
  X, 
  Car, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  DollarSign,
  PieChart,
  RefreshCcw,
  ExternalLink
} from 'lucide-react';

// --- Firebase 核心導入 ---
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, updateDoc, deleteDoc, 
  doc, onSnapshot, query, orderBy 
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// --- Firebase 配置 ---
const firebaseConfig = {
  apiKey: "AIzaSyDaPsCZ_3x9ZDR86QvHO9W780cndj_nxqA",
  authDomain: "cheyi-ebb4f.firebaseapp.com",
  projectId: "cheyi-ebb4f",
  storageBucket: "cheyi-ebb4f.firebasestorage.app",
  messagingSenderId: "272732193668",
  appId: "1:272732193668:web:198d1a5727a0300737d3d1",
  measurementId: "G-1R0X5XN4MW"
};

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const COLLECTION_PATH = 'carwash_transactions';

const App = () => {
  const initialServices = {
    '小&中型車': { '快速洗車': 300, '一般洗車': 800, '精緻洗車': 1800, '基本內裝清潔': 300, '車體鍍膜': 5000, '玻璃鍍膜': 1200, '內裝深層清潔': 1000 },
    '大型車': { '快速洗車': 350, '一般洗車': 900, '精緻洗車': 1900, '基本內裝清潔': 350, '車體鍍膜': 6000, '玻璃鍍膜': 1200, '內裝深層清潔': 1000 },
    '休旅車': { '快速洗車': 400, '一般洗車': 1000, '精緻洗車': 2000, '基本內裝清潔': 400, '車體鍍膜': 7000, '玻璃鍍膜': 2000, '內裝深層清潔': 1200 },
    '商旅車': { '快速洗車': 500, '一般洗車': 1200, '精緻洗車': 2200, '基本內裝清潔': 500, '車體鍍膜': 8000, '玻璃鍍膜': 2000, '內裝深層清潔': 1200 },
  };

  const [view, setView] = useState('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [priceMatrix, setPriceMatrix] = useState(() => {
    const saved = localStorage.getItem('cheyi_prices');
    return saved ? JSON.parse(saved) : initialServices;
  });

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
    const initAuth = async () => {
      try { await signInAnonymously(auth); } catch (err) { console.error(err); }
    };
    initAuth();
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const q = query(collection(db, COLLECTION_PATH), orderBy('date', 'desc'));
        const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setTransactions(data);
          setLoading(false);
        }, (err) => { console.error(err); setLoading(false); });
        return () => unsubscribeFirestore();
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    localStorage.setItem('cheyi_prices', JSON.stringify(priceMatrix));
  }, [priceMatrix]);

  const stats = useMemo(() => {
    const now = new Date();
    
    // --- 本月數據邏輯 ---
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monthlyData = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    // --- 本週數據邏輯 (從週日開始計算) ---
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const weeklyData = transactions.filter(t => {
      const d = new Date(t.date);
      return d >= startOfWeek && d <= now;
    });

    const calculateRev = (data) => data.reduce((acc, t) => acc + (Number(t.amount) - (Number(t.discount) || 0)), 0);

    return {
      revenueWeek: calculateRev(weeklyData),
      countWeek: weeklyData.length,
      revenueMonth: calculateRev(monthlyData),
      countMonth: monthlyData.length,
      netProfitMonth: monthlyData.reduce((acc, t) => acc + (Number(t.amount) - (Number(t.discount) || 0) - (Number(t.cost) || 0)), 0),
    };
  }, [transactions]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newData = { ...prev, [name]: value };
      if ((name === 'carType' || name === 'serviceItem')) {
        const cType = name === 'carType' ? value : prev.carType;
        const sItem = name === 'serviceItem' ? value : prev.serviceItem;
        if (cType && sItem && priceMatrix[cType]?.[sItem]) {
          newData.amount = priceMatrix[cType][sItem];
        }
      }
      return newData;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return alert("連線中...");
    const payload = { ...formData, amount: Number(formData.amount), discount: Number(formData.discount), cost: Number(formData.cost) };
    try {
      if (editingId) { await updateDoc(doc(db, COLLECTION_PATH, editingId), payload); }
      else { await addDoc(collection(db, COLLECTION_PATH), payload); }
      closeModal();
    } catch (err) { alert("儲存失敗"); }
  };

  const deleteTransaction = async (id) => {
    if (window.confirm('確定刪除？')) { await deleteDoc(doc(db, COLLECTION_PATH, id)); }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({ customerName: '', date: new Date().toISOString().split('T')[0], carType: '', serviceItem: '', amount: 0, discount: 0, cost: 0, paymentMethod: '現金' });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F0F7F7]">
        <RefreshCcw className="animate-spin text-teal-500 mb-4" size={48} />
        <p className="font-bold text-slate-500 text-xs tracking-widest uppercase">Syncing Cloud Data...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F7F7] font-sans text-slate-700 pb-12">
      <nav className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 mb-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-teal-400 to-cyan-500 text-white p-2.5 rounded-2xl shadow-lg">
              <Car size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">車奕洗車坊</h1>
              <div className="flex items-center gap-1.5">
                 <div className={`w-1.5 h-1.5 rounded-full ${user ? 'bg-teal-500' : 'bg-red-400'}`}></div>
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{user ? 'Cloud Connected' : 'Offline'}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
             <button onClick={() => setView('calendar')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === 'calendar' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>預約看板</button>
             <button onClick={() => setView('list')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === 'list' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>營收清單</button>
             <button onClick={() => setView('pricing')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === 'pricing' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>價目管理</button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6">
        {/* 統計看板 - 同時顯示本週與本月 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-white">
            <DollarSign className="text-teal-500 mb-2" size={20}/>
            <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-wider">本週總營收</h3>
            <p className="text-2xl font-black text-slate-800">${stats.revenueWeek.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-white">
            <TrendingUp className="text-cyan-500 mb-2" size={20}/>
            <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-wider">本月總營收</h3>
            <p className="text-2xl font-black text-slate-800">${stats.revenueMonth.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-white">
            <Car className="text-teal-500 mb-2" size={20}/>
            <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-wider">本週進場台數</h3>
            <p className="text-2xl font-black text-slate-800">{stats.countWeek} <span className="text-xs font-bold text-slate-400 ml-1">台</span></p>
          </div>
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-white">
            <PieChart className="text-indigo-500 mb-2" size={20}/>
            <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-wider">本月進場台數</h3>
            <p className="text-2xl font-black text-slate-800">{stats.countMonth} <span className="text-xs font-bold text-slate-400 ml-1">台</span></p>
          </div>
        </div>

        {view === 'calendar' && (
          <div className="bg-white rounded-[2.5rem] shadow-xl border border-white overflow-hidden">
             <div className="p-8 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-2 hover:bg-slate-50 rounded-full text-slate-400"><ChevronLeft size={20}/></button>
                  <h2 className="text-2xl font-black text-slate-800 min-w-[140px] text-center">{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</h2>
                  <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-2 hover:bg-slate-50 rounded-full text-slate-400"><ChevronRight size={20}/></button>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="w-full md:w-auto bg-slate-900 text-white px-8 py-4 rounded-2xl text-xs font-black shadow-lg hover:bg-teal-600 transition-all flex items-center justify-center gap-2">
                  <Plus size={18}/> 新增預約
                </button>
             </div>
             <div className="grid grid-cols-7 text-center py-4 bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
             </div>
             <div className="grid grid-cols-7">
                {(() => {
                  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
                  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
                  const days = [];
                  for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-32 bg-slate-50/30 border-r border-b border-slate-100"></div>);
                  for (let d = 1; d <= daysInMonth; d++) {
                    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const dayData = transactions.filter(t => t.date === dateStr);
                    days.push(
                      <div key={d} className="h-32 border-r border-b border-slate-100 p-2 relative bg-white hover:bg-teal-50/10 transition-colors">
                        <span className="text-[10px] font-black text-slate-300">{d}</span>
                        <div className="overflow-y-auto max-h-[80px] space-y-1 mt-1 no-scrollbar">
                          {dayData.map(t => (
                            <div key={t.id} onClick={() => { setEditingId(t.id); setFormData(t); setIsModalOpen(true); }} className="text-[10px] bg-white border border-slate-100 p-1 rounded-lg shadow-sm font-bold text-slate-600 truncate hover:border-teal-400 cursor-pointer">
                              {t.customerName}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return days;
                })()}
             </div>
          </div>
        )}

        {view === 'list' && (
          <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-white overflow-x-auto">
             <table className="w-full text-left">
                <thead className="text-[10px] font-black text-slate-300 uppercase tracking-widest border-b border-slate-50">
                  <tr>
                    <th className="px-4 py-4">日期</th>
                    <th className="px-4 py-4">客戶名稱</th>
                    <th className="px-4 py-4">服務項目</th>
                    <th className="px-4 py-4">金額</th>
                    <th className="px-4 py-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {transactions.map(t => (
                    <tr key={t.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-5 text-xs text-slate-400 font-mono">{t.date}</td>
                      <td className="px-4 py-5 font-bold text-slate-700">{t.customerName}</td>
                      <td className="px-4 py-5 text-xs font-bold text-slate-500">{t.serviceItem}</td>
                      <td className="px-4 py-5 font-black text-teal-500">${(t.amount - (t.discount || 0)).toLocaleString()}</td>
                      <td className="px-4 py-5 text-right flex justify-end gap-2 opacity-20 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingId(t.id); setFormData(t); setIsModalOpen(true); }} className="p-2 text-slate-400 hover:text-teal-500"><Edit2 size={14}/></button>
                        <button onClick={() => deleteTransaction(t.id)} className="p-2 text-slate-400 hover:text-red-400"><Trash2 size={14}/></button>
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr><td colSpan="5" className="py-20 text-center text-slate-300 text-xs font-bold">暫無交易紀錄</td></tr>
                  )}
                </tbody>
             </table>
          </div>
        )}

        {view === 'pricing' && (
          <div className="bg-white rounded-[2.5rem] p-10 shadow-xl border border-white">
             <h2 className="text-2xl font-black text-slate-800 mb-8">價目表設定</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {Object.keys(priceMatrix).map(type => (
                  <div key={type} className="bg-slate-50 p-6 rounded-3xl">
                    <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2 text-sm"><Car size={16} className="text-teal-500"/> {type}</h3>
                    <div className="space-y-2">
                      {Object.keys(priceMatrix[type]).map(service => (
                        <div key={service} className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-100">
                          <span className="text-xs font-bold text-slate-500">{service}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-300">$</span>
                            <input 
                              type="number" 
                              className="w-20 text-right font-black text-teal-600 outline-none"
                              value={priceMatrix[type][service]}
                              onChange={(e) => setPriceMatrix(prev => ({...prev, [type]: {...prev[type], [service]: Number(e.target.value)}}))}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="text-xl font-black">{editingId ? '編輯預約' : '新增預約'}</h3>
              <button onClick={closeModal} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20}/></button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-1">客戶名稱</label>
                   <input type="text" required name="customerName" value={formData.customerName} onChange={handleInputChange} className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold text-sm focus:bg-white focus:ring-2 ring-teal-500/10 transition-all" placeholder="輸入名稱" />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-1">日期</label>
                   <input type="date" required name="date" value={formData.date} onChange={handleInputChange} className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold text-sm focus:bg-white focus:ring-2 ring-teal-500/10 transition-all" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-1">車型</label>
                   <select name="carType" value={formData.carType} onChange={handleInputChange} className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold text-sm appearance-none focus:bg-white focus:ring-2 ring-teal-500/10 transition-all">
                     <option value="">選擇車型</option>
                     {Object.keys(priceMatrix).map(t => <option key={t} value={t}>{t}</option>)}
                   </select>
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-1">服務項目</label>
                   <select name="serviceItem" value={formData.serviceItem} onChange={handleInputChange} className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold text-sm appearance-none focus:bg-white focus:ring-2 ring-teal-500/10 transition-all">
                     <option value="">選擇服務</option>
                     {formData.carType && Object.keys(priceMatrix[formData.carType]).map(s => <option key={s} value={s}>{s}</option>)}
                   </select>
                </div>
              </div>
              <div className="bg-teal-50 p-6 rounded-[2rem] flex items-center justify-between border border-teal-100">
                <div>
                  <label className="text-[10px] font-black text-teal-600 uppercase block mb-1">實收金額</label>
                  <div className="flex items-center gap-1 text-teal-700">
                    <span className="text-lg font-black">$</span>
                    <input type="number" name="amount" value={formData.amount} onChange={handleInputChange} className="bg-transparent text-3xl font-black outline-none w-32" />
                  </div>
                </div>
                <div className="text-right">
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">支出成本</label>
                  <div className="flex items-center gap-1 text-slate-400 justify-end">
                    <span className="text-sm font-black">$</span>
                    <input type="number" name="cost" value={formData.cost} onChange={handleInputChange} className="bg-transparent text-xl font-black outline-none w-24 text-right" />
                  </div>
                </div>
              </div>
              <button type="submit" className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black shadow-xl hover:bg-teal-600 transition-all uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                確認儲存資料
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;