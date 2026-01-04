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
  ExternalLink, 
  ChevronLeft, 
  ChevronRight,
  DollarSign,
  PieChart,
  RefreshCcw
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
  // --- 狀態管理 ---
  const [view, setView] = useState('calendar'); 
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [priceMatrix, setPriceMatrix] = useState(() => {
    const saved = localStorage.getItem('cheyi_prices');
    return saved ? JSON.parse(saved) : {
      '小&中型車': { '快速洗車': 300, '一般洗車': 800, '精緻洗車': 1800, '基本內裝清潔': 300, '車體鍍膜': 5000, '玻璃鍍膜': 1200, '內裝深層清潔': 1000 },
      '大型車': { '快速洗車': 350, '一般洗車': 900, '精緻洗車': 1900, '基本內裝清潔': 350, '車體鍍膜': 6000, '玻璃鍍膜': 1200, '內裝深層清潔': 1000 },
      '休旅車': { '快速洗車': 400, '一般洗車': 1000, '精緻洗車': 2000, '基本內裝清潔': 400, '車體鍍膜': 7000, '玻璃鍍膜': 2000, '內裝深層清潔': 1200 },
      '商旅車': { '快速洗車': 500, '一般洗車': 1200, '精緻洗車': 2200, '基本內裝清潔': 500, '車體鍍膜': 8000, '玻璃鍍膜': 2000, '內裝深層清潔': 1200 },
    };
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

  // --- 持久化與 Firebase 同步 ---
  useEffect(() => {
    localStorage.setItem('cheyi_prices', JSON.stringify(priceMatrix));
  }, [priceMatrix]);

  useEffect(() => {
    const initApp = async () => {
      try { await signInAnonymously(auth); } catch (err) { console.error("Auth failed", err); }
    };
    initApp();

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const q = query(collection(db, COLLECTION_PATH), orderBy('date', 'desc'));
        const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setTransactions(data);
          setLoading(false);
        }, (err) => { console.error("Firestore error", err); setLoading(false); });
        return () => unsubscribeFirestore();
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // --- 統計計算 ---
  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0,0,0,0);
    
    const monthlyData = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const weeklyData = transactions.filter(t => new Date(t.date) >= startOfWeek);

    return {
      totalRevenueMonth: monthlyData.reduce((acc, t) => acc + (Number(t.amount) - (Number(t.discount) || 0)), 0),
      netProfitMonth: monthlyData.reduce((acc, t) => acc + (Number(t.amount) - (Number(t.discount) || 0) - (Number(t.cost) || 0)), 0),
      countMonth: monthlyData.length,
      countWeek: weeklyData.length
    };
  }, [transactions]);

  // --- 操作函數 ---
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
    if (!user) return alert("尚未連線");
    const payload = { ...formData, amount: Number(formData.amount), discount: Number(formData.discount), cost: Number(formData.cost) };
    try {
      if (editingId) {
        await updateDoc(doc(db, COLLECTION_PATH, editingId), payload);
      } else {
        await addDoc(collection(db, COLLECTION_PATH), payload);
      }
      closeModal();
    } catch (err) {
      alert("儲存失敗，請檢查網路或設定");
    }
  };

  const deleteTransaction = async (id) => {
    if (window.confirm('確定要刪除此筆紀錄嗎？')) {
      await deleteDoc(doc(db, COLLECTION_PATH, id));
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({ customerName: '', date: new Date().toISOString().split('T')[0], carType: '', serviceItem: '', amount: 0, discount: 0, cost: 0, paymentMethod: '現金' });
  };

  const exportToExcel = () => {
    const headers = ['日期', '客戶', '車型', '項目', '支付', '金額', '折扣', '成本', '淨利'];
    const rows = transactions.map(t => [t.date, t.customerName, t.carType, t.serviceItem, t.paymentMethod, t.amount, t.discount, t.cost, (t.amount - t.discount - t.cost)]);
    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `車奕洗車坊_報表_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  // --- UI 組件 ---
  const StatCard = ({ title, value, subValue, icon: Icon, color }) => (
    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-white flex flex-col justify-between hover:shadow-md transition-all">
      <div className={`w-12 h-12 mb-4 rounded-2xl flex items-center justify-center ${color === 'teal' ? 'bg-teal-50 text-teal-600' : 'bg-cyan-50 text-cyan-600'}`}>
        <Icon size={24} />
      </div>
      <div>
        <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">{title}</h3>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black text-slate-800">{value}</span>
          {subValue && <span className="text-[10px] font-bold text-slate-400">{subValue}</span>}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F0F7F7]">
        <RefreshCcw className="animate-spin text-teal-500 mb-4" size={48} />
        <p className="font-bold text-slate-500">正在同步雲端資料...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F7F7] font-sans text-slate-700 pb-12">
      {/* 導覽列 */}
      <nav className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 mb-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-teal-400 to-cyan-500 text-white p-2.5 rounded-2xl shadow-lg shadow-teal-100">
              <Car size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">車奕洗車坊</h1>
              <div className="flex items-center gap-1.5">
                 <div className={`w-1.5 h-1.5 rounded-full ${user ? 'bg-teal-500' : 'bg-red-400'}`}></div>
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{user ? 'Cloud Connected' : 'Offline Mode'}</span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl">
             <button onClick={() => setView('calendar')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === 'calendar' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
               <CalendarIcon size={14}/> 預約看板
             </button>
             <button onClick={() => setView('list')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === 'list' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
               <TrendingUp size={14}/> 營收明細
             </button>
             <button onClick={() => setView('pricing')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === 'pricing' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
               <Settings size={14}/> 價目管理
             </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6">
        {/* 統計概覽 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8">
          <StatCard title="本月總營收" value={`$${stats.totalRevenueMonth.toLocaleString()}`} icon={DollarSign} color="teal" />
          <StatCard title="預計淨利" value={`$${stats.netProfitMonth.toLocaleString()}`} icon={PieChart} color="cyan" />
          <StatCard title="本週台數" value={stats.countWeek} subValue="台" icon={Car} color="teal" />
          <StatCard title="本月台數" value={stats.countMonth} subValue="台" icon={TrendingUp} color="cyan" />
        </div>

        {/* 主內容區 */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {view === 'calendar' && (
            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-teal-900/5 border border-white overflow-hidden">
              <div className="p-6 md:p-8 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl md:text-2xl font-black text-slate-800">{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</h2>
                  <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
                    <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))} className="p-2 hover:bg-white rounded-lg text-slate-400"><ChevronLeft size={16}/></button>
                    <button onClick={() => setCurrentDate(new Date())} className="px-3 text-xs font-bold text-slate-500">本月</button>
                    <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))} className="p-2 hover:bg-white rounded-lg text-slate-400"><ChevronRight size={16}/></button>
                  </div>
                </div>
                <button onClick={() => { setIsModalOpen(true); setFormData(prev => ({...prev, date: new Date().toISOString().split('T')[0]})); }} 
                  className="w-full md:w-auto bg-slate-900 text-white px-8 py-4 rounded-2xl text-xs font-black shadow-lg hover:bg-teal-600 transition-all flex items-center justify-center gap-2">
                  <Plus size={18}/> 新增預約
                </button>
              </div>
              <div className="grid grid-cols-7 text-center py-4 bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {(() => {
                  const year = currentDate.getFullYear();
                  const month = currentDate.getMonth();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const firstDay = new Date(year, month, 1).getDay();
                  const days = [];
                  for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-28 md:h-32 bg-slate-50/30 border-r border-b border-slate-100"></div>);
                  for (let d = 1; d <= daysInMonth; d++) {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const dayData = transactions.filter(t => t.date === dateStr);
                    const isToday = new Date().toISOString().split('T')[0] === dateStr;
                    days.push(
                      <div key={d} className={`h-28 md:h-32 border-r border-b border-slate-100 p-1.5 relative group hover:bg-teal-50/10 transition-colors ${isToday ? 'bg-teal-50/30' : 'bg-white'}`}>
                        <span className={`text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-teal-500 text-white' : 'text-slate-300'}`}>{d}</span>
                        <div className="overflow-y-auto max-h-[75px] space-y-1 mt-1 no-scrollbar">
                          {dayData.map(t => (
                            <div key={t.id} className="text-[10px] bg-white border border-slate-100 p-1.5 rounded-lg shadow-sm font-bold text-slate-600 truncate cursor-pointer hover:border-teal-400"
                                 onClick={() => { setEditingId(t.id); setFormData(t); setIsModalOpen(true); }}>
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
            <div className="bg-white rounded-[2.5rem] p-6 md:p-8 shadow-xl shadow-teal-900/5 border border-white">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-slate-800">所有明細</h2>
                <button onClick={exportToExcel} className="flex items-center gap-2 bg-teal-50 text-teal-600 px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-teal-100">
                  <Download size={16}/> 匯出 CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-[10px] font-black text-slate-300 uppercase tracking-widest border-b border-slate-50">
                    <tr>
                      <th className="px-4 py-4">日期</th>
                      <th className="px-4 py-4">客戶</th>
                      <th className="px-4 py-4">項目</th>
                      <th className="px-4 py-4">金額</th>
                      <th className="px-4 py-4 text-right">管理</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {transactions.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/50 group">
                        <td className="px-4 py-5 text-xs text-slate-400 font-mono">{t.date}</td>
                        <td className="px-4 py-5 font-bold text-slate-700">{t.customerName}</td>
                        <td className="px-4 py-5">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-600">{