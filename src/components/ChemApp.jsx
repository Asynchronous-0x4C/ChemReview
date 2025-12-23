import React, { useState, useEffect, useRef } from 'react';
import { 
  Beaker, CheckCircle2, XCircle, ArrowRight, ArrowLeft, 
  RotateCcw, PenTool, Eraser, Move, HelpCircle, Flag, 
  Settings, Check, X, AlertCircle, ChevronDown, ChevronRight,
  Layers, Loader2, Database
} from 'lucide-react';
import NanoMolEditor, { generateSmiles } from './NanoMolEditor';

/**
 * --- DATA ARCHITECTURE ---
 * * Scalable Architecture Strategy:
 * 1. INDEX: Lightweight metadata for fast filtering/searching.
 * 2. STORAGE: Heavy content (text, images, explanations).
 * 3. REPOSITORY: Async fetch logic with WeakRef caching.
 */

// 1. カテゴリ定義 (Master Data)
const CATEGORIES = [
  {
    id: 'inorganic',
    name: '無機化学',
    subcategories: [
      { id: 'halogens', name: 'ハロゲン' },
      { id: 'transition_metals', name: '遷移元素' },
      { id: 'complex_ions', name: '錯イオン' }
    ]
  },
  {
    id: 'theoretical',
    name: '理論化学',
    subcategories: [
      { id: 'acid_base', name: '酸と塩基' },
      { id: 'thermochem', name: '熱化学' },
      { id: 'equilibrium', name: '化学平衡' }
    ]
  },
  {
    id: 'organic',
    name: '有機化学',
    subcategories: [
      { id: 'aliphatic', name: '脂肪族炭化水素' },
      { id: 'aromatic', name: '芳香族化合物' },
      { id: 'polymer', name: '高分子化合物' }
    ]
  }
];

// 2. 軽量インデックス (Simulated Search Index)
// 検索時はこの軽量配列のみをスキャンする
const QUESTION_INDEX = [
  { id: 101, cat: 'inorganic', sub: 'halogens', difficulty: 1 },
  { id: 201, cat: 'theoretical', sub: 'acid_base', difficulty: 2 },
  { id: 202, cat: 'theoretical', sub: 'thermochem', difficulty: 2 },
  { id: 301, cat: 'organic', sub: 'aliphatic', difficulty: 3 },
  { id: 302, cat: 'organic', sub: 'polymer', difficulty: 2 },
];

// 3. 詳細データストア (Simulated DB / API Response)
// 本来はサーバーにあるデータ。fetchで取得する対象。
const QUESTION_DETAILS_DB = {
  101: {
    type: "selection",
    question: "次のハロゲンに関する記述のうち、**誤りを含むもの**を1つまたは2つ選べ。",
    maxSelect: 2,
    options: [
      { text: "フッ素は、常温常圧で淡黄色の気体であり、水と激しく反応して酸素を発生する ($2\\text{F}_2 + 2\\text{H}_2\\text{O} \\to 4\\text{HF} + \\text{O}_2$)。", explanation: "正しい記述です。" },
      { text: "塩素は、黄緑色の気体であり、強い酸化作用を持つため、ヨウ化カリウムデンプン紙を青変させる。", explanation: "正しい記述です。" },
      { text: "臭素は、常温で赤褐色の液体であり、唯一の液体元素である。", explanation: "誤り。常温で液体の元素には、臭素($\\text{Br}_2$)のほかに水銀($\\text{Hg}$)があります。" },
      { text: "ヨウ素は、黒紫色の固体であり、昇華性を有する。", explanation: "正しい記述です。" },
      { text: "フッ化水素酸は、弱酸であるが、ガラスを腐食する性質を持つため、ポリエチレン容器に保存する。", explanation: "正しい記述です。$\\text{SiO}_2 + 6\\text{HF} \\to \\text{H}_2\\text{SiF}_6 + 2\\text{H}_2\\text{O}$" },
      { text: "塩化銀は白色沈殿、臭化銀は淡黄色沈殿、ヨウ化銀は黄色沈殿であり、いずれも感光性を持つ。", explanation: "正しい記述です。" }
    ],
    answers: [2],
    generalExplanation: "ハロゲンの単体・化合物の性質は頻出です。特に色と状態、反応性は整理しておきましょう。"
  },
  201: {
    type: "numeric",
    question: "0.10 mol/L の酢酸水溶液の pH を求めよ。ただし、酢酸の電離定数 $K_a = 2.7 \\times 10^{-5}$ mol/L とし、$\\log_{10} 1.6 = 0.20$、$\\log_{10} 1.7 = 0.23$ とする。有効数字2桁で解答せよ。",
    correctValue: 2.78,
    tolerance: 0.05,
    unit: "",
    generalExplanation: "$[\\text{H}^+] = \\sqrt{cK_a} = \\sqrt{0.10 \\times 2.7 \\times 10^{-5}} = 1.64 \\times 10^{-3}$。$\\text{pH} = -\\log_{10}(1.64 \\times 10^{-3}) = 3 - 0.21 = 2.79$ (厳密解)。"
  },
  202: {
    type: "selection",
    question: "次の熱化学方程式に関する記述のうち、**正しいもの**を1つ選べ。\n$\\text{C}(黒鉛) + 2\\text{H}_2(気) = \\text{CH}_4(気) + 75 \\text{kJ}$",
    maxSelect: 1,
    options: [
      { text: "メタンの生成熱は $75 \\text{kJ}/\\text{mol}$ である。", explanation: "正しい。成分元素の単体から化合物1molが生成する反応であり、発熱反応です。" },
      { text: "メタンの燃焼熱は $75 \\text{kJ}/\\text{mol}$ である。", explanation: "誤り。これは燃焼反応（酸素との反応）ではありません。" },
      { text: "黒鉛の燃焼熱と水素の燃焼熱の和は、メタンの燃焼熱より小さい。", explanation: "誤り。ヘスの法則より $Q_{\\text{C}} + 2Q_{\\text{H}_2} = Q_{\\text{f,CH}_4} + Q_{\\text{c,CH}_4}$。" },
      { text: "この反応は吸熱反応である。", explanation: "誤り。$+75\\text{kJ}$ は発熱を表します。" }
    ],
    answers: [0],
    generalExplanation: "熱化学方程式の定義（生成熱、燃焼熱）を正確に把握しているかが問われます。"
  },
  301: {
    type: "structure",
    question: "分子式 $\\text{C}_2\\text{H}_6\\text{O}$ で表される化合物のうち、ナトリウムと反応して水素を発生するものの構造式を描け。",
    targetFormula: ["CC(C)O","CCCO","C(CC)O","C(C)(C)O"],
    generalExplanation: "$\\text{C}_2\\text{H}_6\\text{O}$ の異性体にはエタノールとジメチルエーテルがあります。$\\text{Na}$ と反応するのはヒドロキシ基を持つアルコール（エタノール）です。"
  },
  302: {
    type: "selection",
    question: "合成高分子化合物に関する記述として**正しいもの**を2つ選べ。",
    maxSelect: 2,
    options: [
      { text: "ナイロン66は、ヘキサメチレンジアミンとアジピン酸の縮合重合によって得られる。", explanation: "正しい。" },
      { text: "ポリエチレンテレフタラート(PET)は、エチレングリコールとフタル酸の縮合重合によって得られる。", explanation: "誤り。テレフタル酸を用いる。" },
      { text: "ポリ乳酸は、乳酸の縮合重合によって得られる生分解性プラスチックである。", explanation: "正しい。" },
      { text: "天然ゴムは、イソプレンが付加重合した構造を持ち、その幾何異性体はトランス形である。", explanation: "誤り。天然ゴムはシス形ポリイソプレン。" }
    ],
    answers: [0, 2],
    generalExplanation: ""
  }
};

/**
 * --- REPOSITORY (LOGIC) ---
 * WeakRef と fetch を用いたデータ取得ロジック
 */
class QuestionRepository {
  constructor() {
    // WeakRefを用いたキャッシュ
    // Key: ID, Value: WeakRef(QuestionObject)
    // メモリ圧迫時にGCされることを許容しつつ、直近のアクセスは高速化する
    this.cache = new Map();
  }

  /**
   * 条件に基づいて問題IDを選出する (高速・軽量)
   */
  selectQuestionIds(subCategories, count = 5) {
    const candidates = QUESTION_INDEX.filter(q => subCategories.has(q.sub));
    // Fisher-Yates Shuffle
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    return candidates.slice(0, count);
  }

  /**
   * 必要な問題データのみを非同期で取得する (Simulated fetch)
   */
  async fetchQuestionsByIds(indexItems) {
    const results = [];
    
    // ネットワーク遅延シミュレーション (300ms - 800ms)
    // await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));

    for (const item of indexItems) {
      let data = null;

      // 1. キャッシュ確認 (WeakRef)
      if (this.cache.has(item.id)) {
        const ref = this.cache.get(item.id);
        const cachedData = ref.deref(); // GCされていなければ取得
        if (cachedData) {
          console.log(`Cache Hit for ${item.id}`);
          data = cachedData;
        }
      }

      // 2. キャッシュミスなら "Fetch"
      if (!data) {
        console.log(`Fetching data for ${item.id}...`);
        const rawData = QUESTION_DETAILS_DB[item.id];
        if (rawData) {
          // マージ: Index情報のメタデータ + DBの詳細データ
          data = { ...item, ...rawData };
          // 3. キャッシュに登録 (WeakRef)
          this.cache.set(item.id, new WeakRef(data));
        }
      }

      if (data) results.push(data);
    }
    return results;
  }
}

const repository = new QuestionRepository();


/**
 * --- UTILS ---
 */

// Custom Latex Renderer using CDN (replaces react-katex)
const LatexText = ({ text }) => {
  const [katexReady, setKatexReady] = useState(false);
  
  // Load KaTeX from CDN
  useEffect(() => {
    if (window.katex) {
      setKatexReady(true);
      return;
    }
    
    // JS
    if (!document.getElementById('katex-js')) {
      const script = document.createElement('script');
      script.id = 'katex-js';
      script.src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";
      script.onload = () => setKatexReady(true);
      script.onerror = () => console.error("Failed to load Katex");
      document.head.appendChild(script);
      
      // CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
      document.head.appendChild(link);
    } else {
      // If script exists but not ready, wait for it
      const interval = setInterval(() => {
        if (window.katex) {
          setKatexReady(true);
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, []);

  if (!text) return null;

  // Split by $...$ for inline math
  const parts = text.split(/(\$[^$]+\$)/g);

  return (
    <span>
      {parts.map((part, index) => {
        if (part.startsWith('$') && part.endsWith('$')) {
          const math = part.slice(1, -1);
          if (!katexReady) {
            return <span key={index} className="text-gray-400 italic">...</span>;
          }
          try {
            const html = window.katex.renderToString(math, {
              throwOnError: false,
              displayMode: false
            });
            return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch (e) {
            return <span key={index}>{part}</span>;
          }
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
};

/**
 * --- COMPONENTS ---
 */

// 構造式エディタ (簡易版)
const StructureEditor = ({ value, onChange, isReadOnly = false }) => {
  const [atoms, setAtoms] = useState(value?.atoms || []);
  const [bonds, setBonds] = useState(value?.bonds || []);
  const [selectedTool, setSelectedTool] = useState('C');
  const [draggingAtom, setDraggingAtom] = useState(null);
  const [bondStart, setBondStart] = useState(null);
  const svgRef = useRef(null);

  useEffect(() => {
    if (!isReadOnly) onChange({ atoms, bonds });
  }, [atoms, bonds, onChange, isReadOnly]);

  useEffect(() => {
      if(isReadOnly && value) {
          setAtoms(value.atoms || []);
          setBonds(value.bonds || []);
      }
  }, [isReadOnly, value]);

  const handleCanvasClick = (e) => {
    if (isReadOnly) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (['C', 'O', 'N', 'H', 'Cl', 'Na'].includes(selectedTool)) {
      setAtoms([...atoms, { id: Date.now(), element: selectedTool, x, y }]);
    }
  };

  const handleAtomMouseDown = (e, atomId) => {
    e.stopPropagation();
    if (isReadOnly) return;
    if (selectedTool === 'eraser') {
      setAtoms(atoms.filter(a => a.id !== atomId));
      setBonds(bonds.filter(b => b.source !== atomId && b.target !== atomId));
    } else if (selectedTool === 'bond') {
      setBondStart(atomId);
    } else if (selectedTool === 'move') {
      setDraggingAtom(atomId);
    }
  };

  const handleAtomMouseUp = (e, atomId) => {
    e.stopPropagation();
    if (isReadOnly) return;
    if (selectedTool === 'bond' && bondStart && bondStart !== atomId) {
      const existing = bonds.find(b => 
        (b.source === bondStart && b.target === atomId) || 
        (b.source === atomId && b.target === bondStart)
      );
      if (existing) {
        setBonds(bonds.map(b => b === existing ? { ...b, order: (b.order % 3) + 1 } : b));
      } else {
        setBonds([...bonds, { source: bondStart, target: atomId, order: 1 }]);
      }
      setBondStart(null);
    } else if (selectedTool === 'move') {
      setDraggingAtom(null);
    }
  };

  const handleMouseMove = (e) => {
    if (isReadOnly) return;
    if (selectedTool === 'move' && draggingAtom) {
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setAtoms(atoms.map(a => a.id === draggingAtom ? { ...a, x, y } : a));
    }
  };

  const getElementColor = (el) => {
    const colors = { C: '#333', O: '#ef4444', N: '#3b82f6', H: '#9ca3af', Cl: '#22c55e', Na: '#8b5cf6' };
    return colors[el] || '#000';
  };

  return (
    <div className="flex flex-col border rounded-lg overflow-hidden bg-white shadow-sm select-none">
      {!isReadOnly && (
        <div className="bg-gray-100 p-2 flex gap-1 border-b overflow-x-auto items-center">
          {['C', 'H', 'O', 'N', 'Cl'].map(el => (
            <button key={el} onClick={() => setSelectedTool(el)}
              className={`w-8 h-8 rounded font-bold transition-all ${selectedTool === el ? 'bg-blue-600 text-white shadow-inner scale-95' : 'bg-white hover:bg-gray-200'}`}
              style={{ color: selectedTool === el ? 'white' : getElementColor(el) }}>
              {el}
            </button>
          ))}
          <div className="w-px h-6 bg-gray-300 mx-1"></div>
          <button onClick={() => setSelectedTool('bond')} className={`p-1.5 rounded ${selectedTool === 'bond' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-200'}`}>
            <ArrowRight size={18} className="rotate-[-45deg]" />
          </button>
          <button onClick={() => setSelectedTool('move')} className={`p-1.5 rounded ${selectedTool === 'move' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-200'}`}>
            <Move size={18} />
          </button>
          <button onClick={() => setSelectedTool('eraser')} className={`p-1.5 rounded ${selectedTool === 'eraser' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-200'}`}>
            <Eraser size={18} />
          </button>
          <button onClick={() => {setAtoms([]); setBonds([]);}} className="ml-auto p-1.5 text-red-500 hover:bg-red-50 rounded">
            <RotateCcw size={18} />
          </button>
        </div>
      )}

      <svg ref={svgRef} width="100%" height="280"
        className={`bg-white ${isReadOnly ? 'cursor-default' : (selectedTool === 'move' ? 'cursor-move' : 'cursor-crosshair')}`}
        onClick={handleCanvasClick} onMouseMove={handleMouseMove} onMouseUp={() => { setDraggingAtom(null); setBondStart(null); }}
      >
        <defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f0f0f0" strokeWidth="1" /></pattern></defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        {bondStart && (
           <line x1={atoms.find(a => a.id === bondStart)?.x} y1={atoms.find(a => a.id === bondStart)?.y} x2={atoms.find(a => a.id === bondStart)?.x} y2={atoms.find(a => a.id === bondStart)?.y} stroke="#ccc" strokeDasharray="4" />
        )}
        {bonds.map((bond, idx) => {
          const s = atoms.find(a => a.id === bond.source);
          const t = atoms.find(a => a.id === bond.target);
          if (!s || !t) return null;
          return <g key={idx}><line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="#555" strokeWidth={bond.order === 2 ? 5 : 2} />{bond.order === 2 && <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="white" strokeWidth={1.5} />}</g>;
        })}
        {atoms.map(atom => (
          <g key={atom.id} transform={`translate(${atom.x},${atom.y})`} onMouseDown={(e) => handleAtomMouseDown(e, atom.id)} onMouseUp={(e) => handleAtomMouseUp(e, atom.id)}>
            <circle r="13" fill="white" stroke={getElementColor(atom.element)} strokeWidth="2" />
            <text textAnchor="middle" dy="5" fill={getElementColor(atom.element)} fontWeight="bold" fontSize="13" pointerEvents="none">{atom.element}</text>
            {bondStart === atom.id && <circle r="16" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-spin-slow" />}
          </g>
        ))}
      </svg>
    </div>
  );
};

// カテゴリ選択コンポーネント
const CategorySelector = ({ selectedSubCategories, onToggleSubCategory, onToggleCategory }) => {
  const [expandedCategories, setExpandedCategories] = useState(CATEGORIES.map(c => c.id));

  const toggleExpand = (catId) => {
    setExpandedCategories(prev => 
      prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]
    );
  };

  return (
    <div className="space-y-4 mb-8">
      <div className="flex items-center gap-2 mb-2 text-slate-700 font-bold">
        <Layers size={20} /> 出題範囲を選択
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CATEGORIES.map(cat => {
          const subCatIds = cat.subcategories.map(s => s.id);
          const isAllSelected = subCatIds.every(id => selectedSubCategories.has(id));
          const isPartiallySelected = !isAllSelected && subCatIds.some(id => selectedSubCategories.has(id));
          
          return (
            <div key={cat.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div 
                className={`p-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors ${isAllSelected ? 'bg-blue-50' : ''}`}
                onClick={() => toggleExpand(cat.id)}
              >
                <div className="flex items-center gap-3">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onToggleCategory(cat); }}
                    className={`w-5 h-5 rounded border flex items-center justify-center transition-colors
                      ${isAllSelected ? 'bg-blue-600 border-blue-600 text-white' : 
                        isPartiallySelected ? 'bg-blue-100 border-blue-600 text-blue-600' : 'border-slate-300 bg-white'}
                    `}
                  >
                     {isAllSelected && <Check size={14} />}
                     {isPartiallySelected && <div className="w-2.5 h-2.5 bg-blue-600 rounded-sm" />}
                  </button>
                  <span className="font-bold text-slate-700">{cat.name}</span>
                </div>
                {expandedCategories.includes(cat.id) ? <ChevronDown size={16} className="text-slate-400"/> : <ChevronRight size={16} className="text-slate-400"/>}
              </div>
              
              {expandedCategories.includes(cat.id) && (
                <div className="border-t border-slate-100 p-2 bg-slate-50/50">
                  {cat.subcategories.map(sub => (
                    <div 
                      key={sub.id} 
                      className="flex items-center gap-3 p-2 hover:bg-blue-50/50 rounded cursor-pointer"
                      onClick={() => onToggleSubCategory(sub.id)}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center
                        ${selectedSubCategories.has(sub.id) ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 bg-white'}
                      `}>
                        {selectedSubCategories.has(sub.id) && <Check size={12} />}
                      </div>
                      <span className="text-sm text-slate-600">{sub.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// メインアプリ
export default function App() {
  const [gameState, setGameState] = useState('start'); // start, loading, quiz, result
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // 出題範囲管理
  const [selectedSubCategories, setSelectedSubCategories] = useState(new Set());
  
  // 回答状態管理
  const [userAnswers, setUserAnswers] = useState({}); 
  const [userFlags, setUserFlags] = useState({}); 
  const [showSettings, setShowSettings] = useState(false);
  const [explanationMode, setExplanationMode] = useState('all');

  // 初期化：全選択状態にする
  useEffect(() => {
    const allIds = new Set();
    CATEGORIES.forEach(c => c.subcategories.forEach(s => allIds.add(s.id)));
    setSelectedSubCategories(allIds);
  }, []);

  const toggleSubCategory = (id) => {
    const newSet = new Set(selectedSubCategories);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedSubCategories(newSet);
  };

  const toggleCategory = (category) => {
    const subIds = category.subcategories.map(s => s.id);
    const newSet = new Set(selectedSubCategories);
    const isAllSelected = subIds.every(id => newSet.has(id));

    if (isAllSelected) subIds.forEach(id => newSet.delete(id));
    else subIds.forEach(id => newSet.add(id));
    setSelectedSubCategories(newSet);
  };

  // 非同期出題開始ロジック
  const startQuiz = async () => {
    if (selectedSubCategories.size === 0) return;

    // 1. Loading State
    setGameState('loading');

    try {
      // 2. Select IDs (Fast)
      const selectedIndexItems = repository.selectQuestionIds(selectedSubCategories, 5);
      
      if (selectedIndexItems.length === 0) {
        alert("選択されたカテゴリに該当する問題がありません。");
        setGameState('start');
        return;
      }

      // 3. Fetch Details (Simulated Async Network Call)
      const loadedQuestions = await repository.fetchQuestionsByIds(selectedIndexItems);

      setQuestions(loadedQuestions);
      setCurrentIndex(0);
      setUserAnswers({});
      setUserFlags({});
      setGameState('quiz');
    } catch (e) {
      console.error(e);
      alert("問題の取得に失敗しました。");
      setGameState('start');
    }
  };

  const handleSelectionAnswer = (qId, optionIdx, maxSelect) => {
    const current = userAnswers[qId] || [];
    let next;
    if (current.includes(optionIdx)) next = current.filter(i => i !== optionIdx);
    else {
      next = [...current, optionIdx];
      if (next.length > maxSelect) next.shift(); 
    }
    setUserAnswers({ ...userAnswers, [qId]: next });
  };

  const handleFlagToggle = (qId, optionIdx) => {
    const currentFlags = userFlags[qId] || [];
    const nextFlags = currentFlags.includes(optionIdx) 
      ? currentFlags.filter(i => i !== optionIdx)
      : [...currentFlags, optionIdx];
    setUserFlags({ ...userFlags, [qId]: nextFlags });
  };

  const handleNumericAnswer = (qId, value) => {
    setUserAnswers({ ...userAnswers, [qId]: value });
  };

  const handleStructureAnswer = (qId, data) => {
    setUserAnswers({ ...userAnswers, [qId]: data });
  };

  const finishQuiz = () => {
    setGameState('result');
    setCurrentIndex(0); // 結果画面の最初は1問目から
  };

  const calculateScore = () => {
    let score = 0;
    questions.forEach(q => {
      if (checkAnswer(q, userAnswers[q.id])) score++;
    });
    return score;
  };

  const checkAnswer = (question, answer) => {
    if (!answer) return false;
    
    if (question.type === 'selection') {
        const sortedUser = [...(answer || [])].sort().join(',');
        const sortedAns = [...question.answers].sort().join(',');
        return sortedUser === sortedAns;
    } else if (question.type === 'numeric') {
        const val = parseFloat(answer);
        return !isNaN(val) && Math.abs(val - question.correctValue) <= question.tolerance;
    } else if (question.type === 'structure') {
        // 簡易判定: 原子数と結合タイプ
        if (!answer.atoms || answer.atoms.length === 0) return false;
        return question.targetFormula.includes(generateSmiles(answer.atoms,answer.bonds));
    }
    return false;
  };

  // UI Components
  const currentQ = questions[currentIndex];
  const isReview = gameState === 'result';
  const isCorrectCurrent = isReview ? checkAnswer(currentQ, userAnswers[currentQ.id]) : false;

  // 解説表示判定
  const shouldShowExplanation = isReview && (
    explanationMode === 'all' || 
    (explanationMode === 'correct_only' && isCorrectCurrent) ||
    (explanationMode === 'incorrect_only' && !isCorrectCurrent)
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setGameState('start')}>
            <div className="bg-blue-600 p-1.5 rounded text-white"><Beaker size={20} /></div>
            <h1 className="font-bold text-lg tracking-tight text-slate-800 hidden sm:block">
              Chemistry
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
             {gameState === 'result' && (
               <div className="bg-slate-100 px-3 py-1 rounded-full text-sm font-bold text-slate-700">
                 Score: {calculateScore()} / {questions.length}
               </div>
             )}
             <button onClick={() => setShowSettings(!showSettings)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full">
               <Settings size={20} />
             </button>
          </div>
        </div>
        
        {/* Settings Panel */}
        {showSettings && (
          <div className="absolute top-16 right-4 w-64 bg-white shadow-xl border rounded-lg p-4 z-30 animate-in slide-in-from-top-2">
            <h3 className="font-bold text-sm text-slate-700 mb-2">解説表示設定</h3>
            <div className="space-y-2">
              {[ { k: 'all', l: '常に表示' }, { k: 'correct_only', l: '正解のみ表示' }, { k: 'incorrect_only', l: '不正解のみ表示' } ].map(opt => (
                <button key={opt.k} onClick={() => setExplanationMode(opt.k)} className={`w-full text-left px-3 py-2 text-sm rounded ${explanationMode === opt.k ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-50'}`}>
                  {opt.l}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {gameState === 'start' && (
          <div className="animate-in fade-in zoom-in-95 duration-500">
            <div className="bg-white p-6 md:p-10 rounded-2xl shadow-xl border border-slate-100 max-w-3xl mx-auto">
              <div className="text-center mb-8">
                <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <PenTool className="text-blue-600" size={32} />
                </div>
                <h2 className="text-3xl font-bold mb-2 text-slate-800">化学 実戦演習</h2>
                <p className="text-slate-500">演習したい分野を選択してください</p>
              </div>

              {/* カテゴリ選択UI */}
              <CategorySelector 
                selectedSubCategories={selectedSubCategories}
                onToggleSubCategory={toggleSubCategory}
                onToggleCategory={toggleCategory}
              />
              
              <div className="flex justify-center mt-6">
                <button 
                  onClick={startQuiz}
                  disabled={selectedSubCategories.size === 0}
                  className="w-full md:w-2/3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-lg font-bold py-4 rounded-xl shadow-lg transition-all hover:scale-[1.02]"
                >
                  {selectedSubCategories.size === 0 ? "分野を選択してください" : "演習を開始する"}
                </button>
              </div>
            </div>
          </div>
        )}

        {gameState === 'loading' && (
          <div className="flex flex-col items-center justify-center py-20 animate-in fade-in">
             <Loader2 size={48} className="text-blue-600 animate-spin mb-4" />
             <p className="text-slate-500 font-medium">問題をデータベースから取得中...</p>
             <p className="text-xs text-slate-400 mt-2">Fetching & Caching via WeakRef...</p>
          </div>
        )}

        {(gameState === 'quiz' || gameState === 'result') && currentQ && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500" key={currentQ.id}>
            
            <div className={`bg-white rounded-xl shadow-sm border overflow-hidden ${isReview ? (isCorrectCurrent ? 'border-green-200 ring-1 ring-green-100' : 'border-red-200 ring-1 ring-red-100') : 'border-slate-200'}`}>
              <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold bg-slate-700 px-2 py-1 rounded text-blue-200">Q{currentIndex + 1}</span>
                  <div className="flex flex-col md:flex-row md:items-center md:gap-2">
                    <span className="text-sm font-semibold tracking-wider text-slate-300">{CATEGORIES.find(c => c.id === currentQ.cat)?.name}</span>
                  </div>
                </div>
                {isReview && (
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold ${isCorrectCurrent ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                    {isCorrectCurrent ? <><Check size={16}/> 正解</> : <><X size={16}/> 不正解</>}
                  </div>
                )}
              </div>

              {/* Question Body */}
              <div className="p-6 md:p-8">
                <div className="text-lg md:text-xl font-medium text-slate-800 mb-6 leading-relaxed">
                  <LatexText text={currentQ.question} />
                </div>

                {/* Selection Type */}
                {currentQ.type === 'selection' && (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-400 font-bold mb-2 uppercase tracking-wide">
                      {currentQ.maxSelect}つまで選択可能
                    </p>
                    {currentQ.options.map((optionData, idx) => {
                      // optionData is now object { text, explanation }
                      const isSelected = (userAnswers[currentQ.id] || []).includes(idx);
                      const isFlagged = (userFlags[currentQ.id] || []).includes(idx);
                      const isRealAnswer = currentQ.answers.includes(idx);
                      
                      let cardStyle = "border-slate-100 hover:border-blue-300 bg-white";
                      if (isReview) {
                        if (isRealAnswer) cardStyle = "border-green-500 bg-green-50"; 
                        else if (isSelected) cardStyle = "border-red-400 bg-red-50"; 
                        else cardStyle = "opacity-70 border-slate-100"; 
                      } else {
                        if (isSelected) cardStyle = "border-blue-500 bg-blue-50 shadow-sm ring-1 ring-blue-100";
                      }

                      return (
                        <div key={idx} className="flex flex-col gap-1">
                          <div className={`relative flex items-stretch rounded-lg border-2 transition-all ${cardStyle}`}>
                            <div 
                              className={`flex-1 p-4 cursor-pointer flex items-start gap-3 ${isReview ? 'cursor-default' : ''}`}
                              onClick={() => !isReview && handleSelectionAnswer(currentQ.id, idx, currentQ.maxSelect)}
                            >
                              <div className={`w-6 h-6 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors
                                ${isSelected 
                                  ? (isReview ? (isRealAnswer ? 'bg-green-500 border-green-500 text-white' : 'bg-red-500 border-red-500 text-white') : 'bg-blue-600 border-blue-600 text-white')
                                  : (isReview && isRealAnswer ? 'border-green-500 text-green-600' : 'border-slate-300')
                                }
                              `}>
                                {isSelected && <CheckCircle2 size={16} />}
                                {isReview && !isSelected && isRealAnswer && <div className="w-2 h-2 rounded-full bg-green-500"/>}
                              </div>
                              <span className={`text-slate-700 ${isReview && isRealAnswer ? 'font-bold text-green-900' : ''}`}>
                                <LatexText text={optionData.text} />
                              </span>
                            </div>
                            
                            {!isReview && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleFlagToggle(currentQ.id, idx); }}
                                className={`px-3 border-l hover:bg-slate-50 flex items-center justify-center transition-colors rounded-r-lg
                                  ${isFlagged ? 'text-orange-500 bg-orange-50 border-orange-200' : 'text-slate-300 border-slate-100'}
                                `}
                              >
                                <Flag size={18} fill={isFlagged ? "currentColor" : "none"} />
                              </button>
                            )}
                          </div>
                          
                          {/* 選択肢ごとの解説 (Review Mode Only) */}
                          {shouldShowExplanation && optionData.explanation && (
                            <div className="ml-10 text-sm text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 mb-2 animate-in fade-in">
                               <span className="font-bold text-slate-400 mr-2">解説:</span>
                               <LatexText text={optionData.explanation} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Numeric Type */}
                {currentQ.type === 'numeric' && (
                  <div className="py-4">
                    <label className="text-sm text-slate-500 block mb-2">数値を入力:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="any"
                        value={userAnswers[currentQ.id] || ""}
                        onChange={(e) => handleNumericAnswer(currentQ.id, e.target.value)}
                        disabled={isReview}
                        className={`w-full md:w-2/3 p-3 text-lg border-2 rounded-lg font-mono outline-none transition-colors
                          ${isReview 
                            ? (isCorrectCurrent ? 'border-green-500 bg-green-50 text-green-900' : 'border-red-500 bg-red-50 text-red-900')
                            : 'border-slate-200 focus:border-blue-500'
                          }
                        `}
                        placeholder="例: 1.23"
                      />
                      <span className="text-slate-500 font-serif">{currentQ.unit}</span>
                    </div>
                    {isReview && !isCorrectCurrent && (
                       <p className="text-sm text-red-600 mt-2 font-bold">正解: {currentQ.correctValue} (±{currentQ.tolerance})</p>
                    )}
                  </div>
                )}

                {/* Structure Type */}
                {currentQ.type === 'structure' && (
                  <div className="py-2">
                    <p className="text-sm text-slate-500 mb-2">構造式を描画:</p>
                    <NanoMolEditor 
                      value={userAnswers[currentQ.id]} 
                      onChange={(data) => handleStructureAnswer(currentQ.id, data)}
                      isReadOnly={isReview}
                    />
                    {isReview && !isCorrectCurrent && (
                      <p className="text-sm text-red-500 mt-2">※ 正しい構造式と比較してください。</p>
                    )}
                  </div>
                )}

                {/* General Explanation (Overall) */}
                {shouldShowExplanation && currentQ.generalExplanation && (
                  <div className="mt-8 pt-6 border-t border-slate-100 animate-in fade-in">
                    <div className="flex items-center gap-2 mb-3 text-slate-800 font-bold">
                      <AlertCircle size={20} className="text-blue-600"/> 
                      {currentQ.type === 'selection' ? '補足解説' : '解説'}
                    </div>
                    <div className="bg-slate-50 p-4 rounded-lg text-slate-700 leading-relaxed border border-slate-100">
                       <LatexText text={currentQ.generalExplanation} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Navigation Buttons (Desktop/Inline) */}
            <div className="flex justify-between items-center pt-4">
               <button 
                 onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                 disabled={currentIndex === 0}
                 className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg disabled:opacity-30 transition-all"
               >
                 <ArrowLeft size={20} /> 前の問題
               </button>

               {!isReview && currentIndex === questions.length - 1 ? (
                 <button 
                   onClick={finishQuiz}
                   className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105"
                 >
                   採点して結果を見る <CheckCircle2 size={20} />
                 </button>
               ) : (
                 <button 
                   onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))}
                   disabled={currentIndex === questions.length - 1}
                   className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg disabled:opacity-30 transition-all"
                 >
                   次の問題 <ArrowRight size={20} />
                 </button>
               )}
            </div>

          </div>
        )}
      </main>

      {/* Footer / Dot Navigation */}
      {(gameState === 'quiz' || gameState === 'result') && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-lg z-10 safe-area-bottom">
          <div className="max-w-4xl mx-auto flex flex-col gap-2">
            
            {/* Dots */}
            <div className="flex justify-center flex-wrap gap-2 md:gap-3">
              {questions.map((q, i) => {
                // Determine Dot Style
                let dotClass = "w-3 h-3 md:w-4 md:h-4 rounded-full transition-all duration-300 ";
                const isActive = i === currentIndex;
                
                if (isReview) {
                  // Review Mode: Color by Correctness
                  const correct = checkAnswer(q, userAnswers[q.id]);
                  dotClass += correct ? "bg-green-500 " : "bg-red-500 ";
                  if (isActive) dotClass += "ring-2 ring-offset-2 ring-slate-400 scale-125";
                  else dotClass += "opacity-70 hover:opacity-100";
                } else {
                  // Quiz Mode: Color by Answered Status
                  const hasAnswer = userAnswers[q.id] && (
                    Array.isArray(userAnswers[q.id]) ? userAnswers[q.id].length > 0 : true
                  );
                  
                  if (isActive) dotClass += "bg-blue-600 ring-2 ring-offset-2 ring-blue-200 scale-125";
                  else if (hasAnswer) dotClass += "bg-blue-300 hover:bg-blue-400";
                  else dotClass += "bg-slate-200 hover:bg-slate-300";
                }

                return (
                  <button 
                    key={q.id} 
                    onClick={() => setCurrentIndex(i)}
                    className={dotClass}
                    title={`Question ${i + 1}`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}