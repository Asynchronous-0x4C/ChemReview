import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Eraser, Trash2, Undo, Redo, Share2, Atom, MousePointer2, Move, Lock } from 'lucide-react';

/**
 * NanoMolEditor
 * A lightweight chemical structure editor compatible with PC and Mobile.
 * Supports C, H, N, O, S, Cl, F, P, Br, I with automatic hydrogen counts and skeletal display.
 * Features advanced bond rendering, smart snapping, state management props, read-only mode,
 * and Zoom/Pan capabilities.
 */

// --- Constants & Types ---

const BOND_SNAP_DIST = 20; // Distance to snap to existing atoms
const ELEMENT_COLORS = {
  C: '#2d3748', // Dark Gray
  N: '#3182ce', // Blue
  O: '#e53e3e', // Red
  H: '#718096', // Gray
  // S: '#d69e2e', // Yellow
  // Cl: '#38a169', // Green
  // F: '#48bb78', // Green
  // P: '#ed8936', // Orange
  // Br: '#805ad5', // Purple
  // I: '#805ad5', // Purple
};

const VALENCE: Record<string, number> = { C: 4, N: 3, O: 2, H: 1, S: 2, Cl: 1, F: 1, P: 5, Br: 1, I: 1 };

type ElementType = keyof typeof ELEMENT_COLORS;
type BondType = 1 | 2 | 3; // Single, Double, Triple
type ToolType = 'select' | 'draw' | 'erase';

interface AtomData {
  id: string;
  x: number;
  y: number;
  element: ElementType;
}

interface BondData {
  id: string;
  source: string; // Atom ID
  target: string; // Atom ID
  type: BondType;
}

interface HistoryState {
  atoms: AtomData[];
  bonds: BondData[];
}

export interface EditorState {
  atoms: AtomData[];
  bonds: BondData[];
  history: HistoryState[];
  historyIndex: number;
  tool: ToolType;
  activeElement: ElementType;
  view: { x: number, y: number, k: number };
}

interface NanoMolEditorProps {
  value?: Partial<EditorState>;
  onChange?: (state: EditorState) => void;
  isReadOnly?: boolean;
}

// --- Vector Helpers ---
const vec = {
  add: (v1: {x: number, y: number}, v2: {x: number, y: number}) => ({ x: v1.x + v2.x, y: v1.y + v2.y }),
  sub: (v1: {x: number, y: number}, v2: {x: number, y: number}) => ({ x: v1.x - v2.x, y: v1.y - v2.y }),
  scale: (v: {x: number, y: number}, s: number) => ({ x: v.x * s, y: v.y * s }),
  len: (v: {x: number, y: number}) => Math.sqrt(v.x * v.x + v.y * v.y),
  norm: (v: {x: number, y: number}) => {
    const l = Math.sqrt(v.x * v.x + v.y * v.y);
    return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
  },
  dot: (v1: {x: number, y: number}, v2: {x: number, y: number}) => v1.x * v2.x + v1.y * v2.y,
  cross: (v1: {x: number, y: number}, v2: {x: number, y: number}) => v1.x * v2.y - v1.y * v2.x,
  angle: (v1: {x: number, y: number}, v2: {x: number, y: number}) => {
    // Angle between v1 and v2 (0 to PI)
    return Math.acos(Math.max(-1, Math.min(1, vec.dot(vec.norm(v1), vec.norm(v2)))));
  }
};

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => vec.len(vec.sub(a, b));

const toSubscript = (num: number): string => {
  const map: Record<string, string> = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', 
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
  };
  return String(num).split('').map(n => map[n] || n).join('');
};

const snapToAngle = (x1: number, y1: number, x2: number, y2: number) => {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const snap = Math.PI / 6; // 30 degrees
  const snappedAngle = Math.round(angle / snap) * snap;
  const standardLen = 40 * 1.5; 
  return {
    x: x1 + Math.cos(snappedAngle) * standardLen,
    y: y1 + Math.sin(snappedAngle) * standardLen,
  };
};

// --- Render Logic ---

const getAtomLabel = (atom: AtomData, bonds: BondData[]) => {
  const connectedBonds = bonds.filter(b => b.source === atom.id || b.target === atom.id);
  const currentValence = connectedBonds.reduce((sum, b) => sum + b.type, 0);
  const maxValence = VALENCE[atom.element] || 0;
  // Simple saturation for common organic elements
  const implicitH = Math.max(0, maxValence - currentValence);

  if (atom.element === 'C') {
    if (connectedBonds.length === 0) {
      return `CH${toSubscript(4)}`;
    }
    return null; // Skeletal
  }

  let label = atom.element as string;
  let labelH = '';
  if (implicitH > 0) {
    if(atom.element === 'H'){
      labelH += toSubscript(2);
    } else {
      labelH += 'H';
    }
    if (implicitH > 1) {
      labelH += toSubscript(implicitH);
    }
  }
  
  // Decide H placement (left or right) based on connectivity could be added here
  // For now, simple append
  if (currentValence === 0 && atom.element !== 'N' && atom.element !== 'H') {
      // e.g. H2O
      return labelH + label; 
  }
  return label + labelH;
};

// SMILES Generator (Simplified)
export const generateSmiles = (atoms: AtomData[], bonds: BondData[]): string => {
  if (atoms.length === 0) return '';

  const adj: Record<string, { neighborId: string; bondType: number }[]> = {};
  atoms.forEach(a => (adj[a.id] = []));
  bonds.forEach(b => {
    adj[b.source]?.push({ neighborId: b.target, bondType: b.type });
    adj[b.target]?.push({ neighborId: b.source, bondType: b.type });
  });

  const visited = new Set<string>();
  const rings: Record<string, number> = {};
  let ringCounter = 1;
  let smilesParts: string[] = [];

  const dfs = (currentId: string, parentId: string | null): string => {
    visited.add(currentId);
    const atom = atoms.find(a => a.id === currentId);
    if (!atom) return '';
    let str = atom.element as string;
    const neighbors = adj[currentId] || [];
    const branches: string[] = [];
    
    for (const edge of neighbors) {
      if (edge.neighborId === parentId) continue;
      const bondSymbol = edge.bondType === 3 ? '#' : edge.bondType === 2 ? '=' : '';
      if (visited.has(edge.neighborId)) {
        if (!rings[edge.neighborId]) rings[edge.neighborId] = ringCounter++;
        str += `${bondSymbol}${rings[edge.neighborId]}`;
      } else {
        branches.push(`${bondSymbol}${dfs(edge.neighborId, currentId)}`);
      }
    }
    if (branches.length > 0) {
      const last = branches.pop();
      str += branches.map(b => `(${b})`).join('') + last;
    }
    return str;
  };

  atoms.forEach(atom => {
    if (!visited.has(atom.id)) {
      smilesParts.push(dfs(atom.id, null));
    }
  });
  return smilesParts.join('.');
};

// --- Component ---

export default function NanoMolEditor({ value, onChange, isReadOnly = false }: NanoMolEditorProps) {
  const [atoms, setAtoms] = useState<AtomData[]>([]);
  const [bonds, setBonds] = useState<BondData[]>([]);
  
  // View State (Zoom/Pan)
  const [view, setView] = useState({ x: 0, y: 0, k: 1.0 });
  
  // History
  const [history, setHistory] = useState<HistoryState[]>([{ atoms: [], bonds: [] }]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Tools
  const [tool, setTool] = useState<ToolType>('draw');
  const [activeElement, setActiveElement] = useState<ElementType>('C');
  const [generatedSmiles, setGeneratedSmiles] = useState('');

  // Interaction
  const [dragStart, setDragStart] = useState<{ id: string; x: number; y: number } | null>(null); // For Atom dragging/bonding (World coords)
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null); // World coords
  const [hoveredAtom, setHoveredAtom] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [snapTargetId, setSnapTargetId] = useState<string | null>(null);

  // Panning State
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null); // Screen coords

  const svgRef = useRef<SVGSVGElement>(null);

  // --- Prop Sync & Validation ---
  useEffect(() => {
    if (value) {
      // Validate structure
      const isValid = Array.isArray(value.atoms) && Array.isArray(value.bonds);
      if (isValid) {
        // Deep comparison or simply set state. 
        // Using JSON stringify check to avoid unnecessary re-renders/loops if parent passes new object with same content
        const currentJSON = JSON.stringify({ atoms, bonds, historyIndex, tool, activeElement });
        const newJSON = JSON.stringify({ 
            atoms: value.atoms, 
            bonds: value.bonds, 
            historyIndex: value.historyIndex ?? historyIndex,
            tool: value.tool ?? tool,
            activeElement: value.activeElement ?? activeElement,
            view: value.view ?? view
        });

        if (currentJSON !== newJSON) {
            if (value.atoms) setAtoms(value.atoms);
            if (value.bonds) setBonds(value.bonds);
            if (value.history) setHistory(value.history);
            if (typeof value.historyIndex === 'number') setHistoryIndex(value.historyIndex);
            if (value.tool) setTool(value.tool);
            if (value.activeElement) setActiveElement(value.activeElement);
            if (value.view) setView(value.view);
        }
      }
    }
  }, [value]); // Depend on value

  // --- State Change Notification ---
  const notifyChange = (overrides: Partial<EditorState> = {}) => {
    if (onChange) {
      onChange({
        atoms: overrides.atoms ?? atoms,
        bonds: overrides.bonds ?? bonds,
        history: overrides.history ?? history,
        historyIndex: overrides.historyIndex ?? historyIndex,
        tool: overrides.tool ?? tool,
        activeElement: overrides.activeElement ?? activeElement,
        view: overrides.view ?? view
      });
    }
  };

  // --- History Management ---

  const commitToHistory = (newAtoms: AtomData[], newBonds: BondData[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ atoms: newAtoms, bonds: newBonds });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setAtoms(newAtoms);
    setBonds(newBonds);

    notifyChange({
        atoms: newAtoms,
        bonds: newBonds,
        history: newHistory,
        historyIndex: newHistory.length - 1
    });
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setAtoms(prev.atoms);
      setBonds(prev.bonds);
      setHistoryIndex(historyIndex - 1);
      
      notifyChange({
          atoms: prev.atoms,
          bonds: prev.bonds,
          historyIndex: historyIndex - 1
      });
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setAtoms(next.atoms);
      setBonds(next.bonds);
      setHistoryIndex(historyIndex + 1);

      notifyChange({
          atoms: next.atoms,
          bonds: next.bonds,
          historyIndex: historyIndex + 1
      });
    }
  };

  // --- Tool & Element Setters ---
  const handleSetTool = (t: ToolType) => {
      setTool(t);
      notifyChange({ tool: t });
  };

  const handleSetElement = (el: ElementType) => {
      setActiveElement(el);
      setTool('draw'); // Switch to draw automatically
      notifyChange({ activeElement: el, tool: 'draw' });
  };

  // --- Actions ---

  const addAtom = (x: number, y: number, element: ElementType = activeElement) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newAtom = { id, x, y, element };
    return { atom: newAtom, id };
  };

  const clearCanvas = () => {
    if (isReadOnly) return;
    commitToHistory([], []);
  };

  // --- Coordinate Systems ---

  // Converts Screen (Mouse) Coords -> World (Data) Coords
  const getPointerCoords = (e: React.MouseEvent | React.PointerEvent | React.WheelEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    return {
      x: (relX - view.x) / view.k,
      y: (relY - view.y) / view.k
    };
  };

  // --- Handlers ---

  const handleWheel = (e: React.WheelEvent) => {
    if (isReadOnly) return;
    
    // Zoom logic
    const scaleFactor = 1 - e.deltaY * 0.001;
    const newK = Math.max(0.1, Math.min(5, view.k * scaleFactor));
    
    // Zoom centered on mouse pointer
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate new offset to keep mouse point stationary in world coords
    // WorldX = (MouseX - ViewX) / ViewK
    // NewViewX = MouseX - WorldX * NewK
    const worldX = (mouseX - view.x) / view.k;
    const worldY = (mouseY - view.y) / view.k;
    
    const newX = mouseX - worldX * newK;
    const newY = mouseY - worldY * newK;

    const newView = { x: newX, y: newY, k: newK };
    setView(newView);
    notifyChange({ view: newView });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isReadOnly) return;
    const { x, y } = getPointerCoords(e);
    
    // Hit testing
    const clickedAtom = atoms.find(a => distance(a, { x, y }) < 15);
    const clickedBond = !clickedAtom ? bonds.find(b => {
        const s = atoms.find(a => a.id === b.source);
        const t = atoms.find(a => a.id === b.target);
        if (!s || !t) return false;
        const A = x - s.x; const B = y - s.y;
        const C = t.x - s.x; const D = t.y - s.y;
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        if (lenSq !== 0) param = dot / lenSq;
        let xx, yy;
        if (param < 0) { xx = s.x; yy = s.y; }
        else if (param > 1) { xx = t.x; yy = t.y; }
        else { xx = s.x + param * C; yy = s.y + param * D; }
        return Math.sqrt((x - xx) * (x - xx) + (y - yy) * (y - yy)) < 8;
    }) : null;

    // Pan Start Check: Not drawing, not clicking element
    if (tool !== 'draw' && !clickedAtom && !clickedBond) {
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        (e.target as Element).setPointerCapture(e.pointerId);
        return;
    }

    // Existing Tool Logic
    if (tool === 'erase') {
      if (clickedAtom) {
        const newAtoms = atoms.filter(a => a.id !== clickedAtom.id);
        const newBonds = bonds.filter(b => b.source !== clickedAtom.id && b.target !== clickedAtom.id);
        commitToHistory(newAtoms, newBonds);
      } else if (clickedBond) {
        const newBonds = bonds.filter(b => b.id !== clickedBond.id);
        commitToHistory(atoms, newBonds);
      }
      return;
    }

    if (tool === 'select') {
      if (clickedAtom) {
        setDragStart({ id: clickedAtom.id, x: clickedAtom.x, y: clickedAtom.y }); // Store World pos/ID
        setIsDragging(true);
      }
      setPointerPos({ x, y });
      (e.target as Element).setPointerCapture(e.pointerId);
      return;
    }

    if (tool === 'draw') {
      if (clickedAtom) {
        setDragStart({ id: clickedAtom.id, x: clickedAtom.x, y: clickedAtom.y });
      } else if (clickedBond) {
          // Toggle bond
          const nextType = (t: number) => t === 1 ? 2 : t === 2 ? 3 : 1;
          const newBonds = bonds.map(b => b.id === clickedBond.id ? { ...b, type: nextType(b.type) } : b) as BondData[];
          commitToHistory(atoms, newBonds);
      } else {
        const { atom, id } = addAtom(x, y);
        setAtoms([...atoms, atom]);
        setDragStart({ id, x, y });
      }
      setIsDragging(true);
    }
    
    setPointerPos({ x, y });
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isReadOnly) return;

    // Pan Logic
    if (isPanning && panStart) {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        const newView = { ...view, x: view.x + dx, y: view.y + dy };
        setView(newView);
        setPanStart({ x: e.clientX, y: e.clientY });
        return;
    }

    const coords = getPointerCoords(e);
    
    if (tool === 'select' && isDragging && dragStart) {
      setAtoms(prev => prev.map(a => a.id === dragStart.id ? { ...a, x: coords.x, y: coords.y } : a));
      setPointerPos(coords);
      return;
    }

    if (tool === 'draw') {
      if (!isDragging || !dragStart) {
          const hovered = atoms.find(a => distance(a, coords) < 15);
          setHoveredAtom(hovered ? hovered.id : null);
          return;
      }

      // 1. Calculate Snapped Angle Position first
      const snappedPos = snapToAngle(dragStart.x, dragStart.y, coords.x, coords.y);
      
      // 2. Check if the snapped position (OR the cursor position) is close to an existing atom
      // We prioritize snapping to an atom if the calculated 'perfect angle' landing spot is close to one.
      const snapTarget = atoms.find(a => 
        a.id !== dragStart.id && 
        (distance(a, coords) < BOND_SNAP_DIST || distance(a, snappedPos) < BOND_SNAP_DIST)
      );

      if (snapTarget) {
        setPointerPos({ x: snapTarget.x, y: snapTarget.y });
        setSnapTargetId(snapTarget.id);
      } else {
        setPointerPos(snappedPos);
        setSnapTargetId(null);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isReadOnly) return;

    if (isPanning) {
        setIsPanning(false);
        setPanStart(null);
        notifyChange({ view: view });
        return;
    }

    if (tool === 'select' && isDragging) {
      commitToHistory(atoms, bonds);
      setIsDragging(false);
      setDragStart(null);
      return;
    }

    if (tool === 'draw' && isDragging && dragStart && pointerPos) {
      const dist = distance(dragStart, pointerPos);
      
      // Click (Short drag)
      if (dist < 5) {
        const targetAtom = atoms.find(a => a.id === dragStart.id);
        if (targetAtom) {
            // Change element
            const newAtoms = atoms.map(a => a.id === targetAtom.id ? { ...a, element: activeElement } : a);
            commitToHistory(newAtoms, bonds);
        }
      } else {
        // Drag (Create Bond)
        let targetId = snapTargetId;
        let newAtoms = [...atoms];

        if (!targetId) {
          const { atom, id } = addAtom(pointerPos.x, pointerPos.y);
          newAtoms.push(atom);
          targetId = id;
        }
        
        if (targetId && targetId !== dragStart.id) {
          const existingBondIndex = bonds.findIndex(b => 
            (b.source === dragStart.id && b.target === targetId) || 
            (b.source === targetId && b.target === dragStart.id)
          );
          
          let newBonds = [...bonds];
          
          if (existingBondIndex >= 0) {
            // Bond exists -> Cycle Type
            const b = newBonds[existingBondIndex];
            const nextType = (b.type === 1) ? 2 : (b.type === 2) ? 3 : 1;
            newBonds[existingBondIndex] = { ...b, type: nextType };
          } else {
            // New Bond
            newBonds.push({
              id: Math.random().toString(36).substr(2, 9),
              source: dragStart.id,
              target: targetId!,
              type: 1
            });
          }
          commitToHistory(newAtoms, newBonds);
        } else {
           // Cancelled drag to self/nowhere? 
           // If we dragged to nowhere and didn't snap, we created a new atom above.
           commitToHistory(newAtoms, bonds);
        }
      }
    }

    setDragStart(null);
    setIsDragging(false);
    setHoveredAtom(null);
    setSnapTargetId(null);
    setPointerPos(null);
  };

  // Update SMILES
  useEffect(() => {
    const s = generateSmiles(atoms, bonds);
    setGeneratedSmiles(s);
  }, [atoms, bonds]);

  // --- Bond Rendering Logic (Advanced) ---

  const getMinAngle = (atomId: string,s: AtomData,t: AtomData,b: BondData, axis: {x:number, y:number}) => {
      const neighbors = bonds
        .filter(bond => (bond.source === atomId || bond.target === atomId) && bond.id !== b.id)
        .map(bond => {
            const otherId = bond.source === atomId ? bond.target : bond.source;
            const other = atoms.find(a => a.id === otherId);
            const myAtom = atomId === s.id ? s : t;
            return other ? vec.sub(other, myAtom) : {x:0,y:0};
        });
        
      const myAxis = atomId === s.id ? axis : vec.scale(axis, -1);
      
      let minRight = 999;
      let minLeft = 999;
      let existsRight = false;
      let existsLeft = false;
      
      neighbors.forEach(nb => {
          const cross = vec.cross(axis, nb);
          const ang = vec.angle(myAxis, nb);
          if (cross > 0) {
              if (ang < minRight) minRight = ang;
              existsRight = true;
          } else {
              if (ang < minLeft) minLeft = ang;
              existsLeft = true;
          }
      });
      return { minRight, minLeft, existsRight, existsLeft };
  };

  const getBondCoords = (b: BondData) => {
    const s = atoms.find(a => a.id === b.source);
    const t = atoms.find(a => a.id === b.target);
    if (!s || !t) return null;

    const v = vec.sub(t, s); // Vector S -> T
    const len = vec.len(v);
    const n = vec.norm(v);
    const perp = { x: -n.y, y: n.x }; // Perpendicular vector (Right side relative to S->T)
    const offset = 6; // Padding between lines

    if (b.type === 1) {
      return [{ x1: s.x, y1: s.y, x2: t.x, y2: t.y }];
    }

    if (b.type === 3 && s.element !== 'C' && t.element !== 'C') {
      // Triple bond: Center + two offsets
      return [
        { x1: s.x, y1: s.y, x2: t.x, y2: t.y },
        { x1: s.x + perp.x * offset, y1: s.y + perp.y * offset, x2: t.x + perp.x * offset, y2: t.y + perp.y * offset },
        { x1: s.x - perp.x * offset, y1: s.y - perp.y * offset, x2: t.x - perp.x * offset, y2: t.y - perp.y * offset }
      ];
    } else if(b.type === 3) {

      const result = [{ x1: s.x, y1: s.y, x2: t.x, y2: t.y }];

      const sAng = getMinAngle(s.id, s, t, b, v);
      const tAng = getMinAngle(t.id, s, t, b, v);

      result.push(...[true,false].map((drawOnRight) => {
        const shift = drawOnRight ? offset : -offset;
        const shiftVec = { x: perp.x * shift, y: perp.y * shift };
        
        let p1 = { x: s.x + shiftVec.x, y: s.y + shiftVec.y };
        let p2 = { x: t.x + shiftVec.x, y: t.y + shiftVec.y };
        
        // Shorten line if neighbor exists on that side to avoid overlap
        const sShorten = Math.min(len * 0.5, offset * Math.tan(Math.PI / 2 - (Math.min(sAng.minRight, sAng.minLeft) / 2)));
        const tShorten = Math.min(len * 0.5, offset * Math.tan(Math.PI / 2 - (Math.min(tAng.minRight, tAng.minLeft) / 2)));
        const sShortenVec = vec.scale(n, sShorten);
        const tShortenVec = vec.scale(n, tShorten);
        
        if (drawOnRight ? sAng.existsRight : sAng.existsLeft) {
            p1 = vec.add(p1, sShortenVec);
        }
        if (drawOnRight ? tAng.existsRight : tAng.existsLeft) {
            p2 = vec.sub(p2, tShortenVec);
        }
        return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
      }));

      return result;
    }

    if (b.type === 2 && s.element !== 'C' && t.element !== 'C') {
      return [
        { x1: s.x + perp.x * offset * 0.5, y1: s.y + perp.y * offset * 0.5, x2: t.x + perp.x * offset * 0.5, y2: t.y + perp.y * offset * 0.5 },
        { x1: s.x - perp.x * offset * 0.5, y1: s.y - perp.y * offset * 0.5, x2: t.x - perp.x * offset * 0.5, y2: t.y - perp.y * offset * 0.5 }
      ];
    } else if (b.type === 2) {
      // Advanced Double Bond Rendering
      // Determine which side to draw the second line (pi-bond)

      const sAng = getMinAngle(s.id, s, t, b, v);
      const tAng = getMinAngle(t.id, s, t, b, v);
      
      // Score: sum of min angles. Lower is preferred (interior).
      // If a side doesn't exist, treat as large angle (PI).
      const scoreRight = (sAng.existsRight ? sAng.minRight : Math.PI) + (tAng.existsRight ? tAng.minRight : Math.PI);
      const scoreLeft = (sAng.existsLeft ? sAng.minLeft : Math.PI) + (tAng.existsLeft ? tAng.minLeft : Math.PI);
      
      const drawOnRight = scoreRight < scoreLeft;
      
      // Calculate coordinates
      const shift = drawOnRight ? offset : -offset;
      const shiftVec = { x: perp.x * shift, y: perp.y * shift };
      
      let p1 = { x: s.x + shiftVec.x, y: s.y + shiftVec.y };
      let p2 = { x: t.x + shiftVec.x, y: t.y + shiftVec.y };
      
      // Shorten line if neighbor exists on that side to avoid overlap
      const sShorten = Math.min(len * 0.5, offset * Math.tan(Math.PI / 2 - (Math.min(sAng.minRight, sAng.minLeft) / 2)));
      const tShorten = Math.min(len * 0.5, offset * Math.tan(Math.PI / 2 - (Math.min(tAng.minRight, tAng.minLeft) / 2)));
      const sShortenVec = vec.scale(n, sShorten);
      const tShortenVec = vec.scale(n, tShorten);
      
      if (drawOnRight ? sAng.existsRight : sAng.existsLeft) {
          p1 = vec.add(p1, sShortenVec);
      }
      if (drawOnRight ? tAng.existsRight : tAng.existsLeft) {
          p2 = vec.sub(p2, tShortenVec);
      }
      
      return [
        { x1: s.x, y1: s.y, x2: t.x, y2: t.y }, // Main sigma bond (Center)
        { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y } // Pi bond (Offset & Shortened)
      ];
    }
    return null;
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-50 text-slate-800 font-sans select-none overflow-hidden relative" style={{touchAction:"none"}}>
      
      {/* Header */}
      <header className="flex-none bg-white border-b border-slate-200 p-2 shadow-sm flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-2 mr-2">
           <div className="bg-indigo-600 p-1.5 rounded text-white"><Atom size={20} /></div>
           <h1 className="font-bold text-lg hidden sm:block">NanoMol</h1>
           {isReadOnly && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded flex items-center gap-1"><Lock size={10}/> Read Only</span>}
        </div>

        {/* Tools: Hide in ReadOnly */}
        {!isReadOnly && (
          <div className="flex gap-2 items-center overflow-x-auto no-scrollbar justify-center flex-1">
            <div className="flex bg-gray-100 p-1 rounded-lg gap-1">
               <button onClick={undo} disabled={historyIndex === 0} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white disabled:opacity-30 text-gray-600"><Undo size={16} /></button>
               <button onClick={redo} disabled={historyIndex >= history.length - 1} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white disabled:opacity-30 text-gray-600"><Redo size={16} /></button>
            </div>
            <div className="w-px bg-gray-300 h-6"></div>
            <div className="flex bg-gray-100 p-1 rounded-lg gap-1">
              <button onClick={() => handleSetTool('select')} className={`w-9 h-9 rounded flex items-center justify-center transition-all ${tool === 'select' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:bg-gray-200'}`}><Move size={18} /></button>
              <button onClick={() => handleSetTool('draw')} className={`w-9 h-9 rounded flex items-center justify-center transition-all ${tool === 'draw' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:bg-gray-200'}`}><MousePointer2 size={18} /></button>
              <button onClick={() => handleSetTool('erase')} className={`w-9 h-9 rounded flex items-center justify-center transition-all ${tool === 'erase' ? 'bg-white shadow text-red-500' : 'text-gray-500 hover:bg-gray-200'}`}><Eraser size={18} /></button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
            {!isReadOnly && (
              <button onClick={clearCanvas} className="p-2 text-gray-400 hover:text-red-600 rounded"><Trash2 size={18} /></button>
            )}
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 relative overflow-hidden bg-gray-50">
        
        {/* Canvas Area */}
        <svg 
            ref={svgRef}
            className={`absolute inset-0 w-full h-full block bg-white ${isReadOnly ? 'cursor-default' : (isPanning ? 'cursor-grabbing' : (tool === 'select' ? 'cursor-move' : 'cursor-crosshair'))}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={handleWheel}
        >
            <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform={`matrix(${view.k} 0 0 ${view.k} ${view.x} ${view.y})`}>
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f7fafc" strokeWidth="1"/>
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            <g transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
                <g className="bonds">
                    {bonds.map(bond => {
                        const coords = getBondCoords(bond);
                        if (!coords) return null;
                        return (
                            <g key={bond.id}>
                                <line x1={coords[0].x1} y1={coords[0].y1} x2={coords[0].x2} y2={coords[0].y2} stroke="transparent" strokeWidth="15" />
                                {coords.map((line, i) => (
                                    <line key={i} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="#4a5568" strokeWidth="2.5" strokeLinecap="round" />
                                ))}
                            </g>
                        );
                    })}
                    {!isReadOnly && isDragging && dragStart && pointerPos && !snapTargetId && (
                        <line x1={dragStart.x} y1={dragStart.y} x2={pointerPos.x} y2={pointerPos.y} stroke="#cbd5e0" strokeWidth="2" strokeDasharray="5,5" />
                    )}
                    {!isReadOnly && isDragging && dragStart && pointerPos && snapTargetId && (
                        <line x1={dragStart.x} y1={dragStart.y} x2={pointerPos.x} y2={pointerPos.y} stroke="#3182ce" strokeWidth="3" opacity="0.5" />
                    )}
                </g>

                <g className="atoms">
                    {atoms.map(atom => {
                        const isHovered = !isReadOnly && hoveredAtom === atom.id;
                        const isSnapTarget = !isReadOnly && snapTargetId === atom.id;
                        const label = getAtomLabel(atom, bonds);
                        const hasLabel = label !== null;
                        return (
                            <g key={atom.id} transform={`translate(${atom.x}, ${atom.y})`} className="transition-all duration-100">
                                <circle r="18" fill="transparent" />
                                {isSnapTarget && <circle r="18" fill="transparent" stroke="#3182ce" strokeWidth="2" opacity="0.6" className="animate-pulse" />}
                                {(hasLabel || isHovered) ? (
                                    <>
                                        <circle r={hasLabel ? 14 : 6} fill="white" stroke={isHovered ? "#3182ce" : (hasLabel ? "white" : "#cbd5e0")} strokeWidth={hasLabel ? 0 : 1} />
                                        {hasLabel && <text textAnchor="middle" dy="0.35em" fill={ELEMENT_COLORS[atom.element] || '#000'} fontWeight="bold" fontSize="16px" style={{ pointerEvents: 'none', userSelect: 'none' }}>{label}</text>}
                                        {!hasLabel && isHovered && <circle r="3" fill="#cbd5e0" />}
                                    </>
                                ) : <circle r="2" fill="transparent" />}
                            </g>
                        );
                    })}
                    {!isReadOnly && isDragging && pointerPos && tool === 'draw' && !snapTargetId && (
                        <g transform={`translate(${pointerPos.x}, ${pointerPos.y})`} opacity="0.6" style={{pointerEvents: 'none'}}>
                            <circle r="12" fill="white" stroke="#3182ce" strokeWidth="2" strokeDasharray="4,2"/>
                            <text textAnchor="middle" dy="0.35em" fill={ELEMENT_COLORS[activeElement]} fontWeight="bold">{activeElement}</text>
                        </g>
                    )}
                </g>
            </g>
        </svg>

        {/* Floating Element Picker Palette */}
        {!isReadOnly && (
            <div className="absolute right-4 top-4 flex flex-col gap-2 p-2 bg-white rounded-xl shadow-lg border border-gray-100 max-h-[calc(100%-2rem)] overflow-y-auto no-scrollbar">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">Atom</span>
                {(Object.keys(ELEMENT_COLORS) as ElementType[]).map(el => (
                    <button 
                        key={el} 
                        onClick={() => handleSetElement(el)} 
                        className={`w-9 h-9 rounded-full font-bold text-sm transition-all flex items-center justify-center ${activeElement === el && tool === 'draw' ? 'bg-indigo-600 text-white shadow-md transform scale-105' : 'text-gray-500 hover:bg-gray-100 hover:text-indigo-600'}`}
                    >
                        {el}
                    </button>
                ))}
            </div>
        )}
      </div>

      <footer className="bg-white border-t border-slate-200 p-3 text-xs text-gray-500">
         <div className="flex items-center justify-between max-w-3xl mx-auto">
            <div className="flex items-center gap-2">
                <span className="font-bold bg-gray-100 px-2 py-1 rounded text-gray-600">SMILES</span>
                <code className="font-mono text-indigo-600 select-all">{generatedSmiles}</code>
            </div>
            <button onClick={() => navigator.clipboard.writeText(generatedSmiles)} className="hover:text-indigo-600 flex items-center gap-1">
                <Share2 size={14} /> <span className="hidden sm:inline">Copy</span>
            </button>
         </div>
      </footer>
    </div>
  );
}