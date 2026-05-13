window.ALL_ITEMS = [
  ...MATERIALS,
  ...CATALYSTS.filter((c) => c.id !== "none"),
  ...POTION_BASE,
  ...AGENTS,
];
window.findItem = (id) => ALL_ITEMS.find((m) => m.id === id) || null;

window.findBestIngredients = (
  recipe,
  agentQualityBonus = 0,
  lager = {},
  disabledIds = new Set(),
  ignoreEmpty = false,
  agent = null,
) => {
  const recipeEl = recipe.element.toLowerCase();
  const lagerFilled = Object.keys(lager).length > 0;
  const agFire = agent?.fire ?? 0,
    agEarth = agent?.earth ?? 0,
    agAir = agent?.air ?? 0,
    agWater = agent?.water ?? 0;
  const agQuality = agent?.quality ?? agentQualityBonus;

  const typeLists = recipe.ingredients.map((requiredType, slotIdx) => {
    const all = MATERIALS.filter(
      (m) => m.type === requiredType && !disabledIds.has(m.id),
    );
    const filtered = all.filter(
      (m) => !(ignoreEmpty && lagerFilled && !(lager[m.id] > 0)),
    );
    if (ignoreEmpty && lagerFilled && filtered.length < all.length) {
      console.log(
        `[findBestIngredients] "${recipe.product}" slot ${slotIdx} (${requiredType}): ${all.length} items total, ${filtered.length} after ignoreEmpty filter. Removed:`,
        all
          .filter((m) => !(lager[m.id] > 0))
          .map((m) => `${m.name}(${lager[m.id] ?? 0})`)
          .join(", "),
      );
    }
    const list = filtered.sort((a, b) => {
      const aMax = Math.max(a.fire, a.earth, a.air, a.water);
      const bMax = Math.max(b.fire, b.earth, b.air, b.water);
      const aMatch = aMax > 0 && a[recipeEl] === aMax ? 1 : 0;
      const bMatch = bMax > 0 && b[recipeEl] === bMax ? 1 : 0;
      if (bMatch !== aMatch) return bMatch - aMatch;
      return a.quality - b.quality;
    });
    return list;
  });

  if (
    typeLists.some((list, i) => {
      if (list.length === 0) {
        console.warn(
          `[findBestIngredients] "${recipe.product}" slot ${i} (${recipe.ingredients[i]}): NO items available after filtering!`,
        );
        return true;
      }
      return false;
    })
  )
    return null;

  let bestCombo = null;
  let bestScore = Infinity;

  const search = (depth, currentCombo) => {
    if (depth === 4) {
      let f = 0,
        e = 0,
        a = 0,
        w = 0;
      let qualitySum = 0;

      for (let i = 0; i < 4; i++) {
        let item = currentCombo[i];
        let weight = i === 0 ? 2 : 1;
        f += item.fire * weight;
        e += item.earth * weight;
        a += item.air * weight;
        w += item.water * weight;
        qualitySum += item.quality * weight;
      }

      let calculatedQuality = Math.floor(qualitySum / 5) + agQuality;

      let f2 = f + agFire,
        e2 = e + agEarth,
        a2 = a + agAir,
        w2 = w + agWater;
      let dom = "None";
      const maxVal = Math.max(f2, e2, a2, w2);
      if (maxVal > 0) {
        let domCount = 0;
        if (f2 === maxVal) {
          domCount++;
          dom = "Fire";
        }
        if (e2 === maxVal) {
          domCount++;
          dom = "Earth";
        }
        if (a2 === maxVal) {
          domCount++;
          dom = "Air";
        }
        if (w2 === maxVal) {
          domCount++;
          dom = "Water";
        }
        if (domCount > 1) dom = "Tie";
      }

      const elTotal =
        recipeEl === "fire"
          ? f2
          : recipeEl === "earth"
            ? e2
            : recipeEl === "air"
              ? a2
              : w2;
      const meetsMinScore =
        !(recipe.minScore > 0) || elTotal >= recipe.minScore;
      if (
        dom === recipe.element &&
        calculatedQuality >= recipe.minQuality &&
        meetsMinScore
      ) {
        const qs = currentCombo.map((m) => m.quality);
        const othersAvg = (qs[1] + qs[2] + qs[3]) / 3;
        const targetMain = othersAvg * 1.1;
        const variance =
          Math.pow(qs[0] - targetMain, 2) +
          Math.pow(qs[1] - othersAvg, 2) +
          Math.pow(qs[2] - othersAvg, 2) +
          Math.pow(qs[3] - othersAvg, 2);
        // Lager-Bonus: Zutaten mit mehr Bestand bevorzugen (hï¿½here Menge = niedrigerer Penalty)
        const lagerPenalty = currentCombo.reduce((sum, m) => {
          const amt = lager[m.id] || 0;
          return sum + Math.max(0, 1000 - amt);
        }, 0);
        // Element-Malus: Zutaten bestrafen, deren primäres Element NICHT dem Rezept-Element entspricht
        const nonMatchPenalty =
          currentCombo.reduce((sum, m) => {
            const mMax = Math.max(m.fire, m.earth, m.air, m.water);
            const primaryMatches = mMax > 0 && m[recipeEl] === mMax;
            return sum + (primaryMatches ? 0 : 1);
          }, 0) * 1e15;
        // Primär: Element-Übereinstimmung; sekundär: qualitySum; tertiär: variance; quartär: lagerPenalty
        const score =
          nonMatchPenalty +
          qualitySum * 100000000 +
          Math.round(variance) * 10000 +
          lagerPenalty;
        if (score < bestScore) {
          bestScore = score;
          bestCombo = [...currentCombo];
        }
      }
      return;
    }

    for (let item of typeLists[depth]) {
      currentCombo.push(item);
      search(depth + 1, currentCombo);
      currentCombo.pop();
    }
  };

  search(0, []);
  if (!bestCombo) {
    // Debug: max erreichbarer elTotal und quality ohne Score-Bedingung
    let maxEl = 0,
      maxQ = 0;
    const best0 = typeLists[0].reduce(
      (b, m) => (m.air > (b?.air ?? -1) ? m : b),
      null,
    );
    const bestQ = typeLists.map((l) =>
      l.reduce((b, m) => (m.quality > (b?.quality ?? -1) ? m : b), null),
    );
    const elVals = [
      best0,
      ...typeLists
        .slice(1)
        .map((l) =>
          l.reduce(
            (b, m) => (m[recipeEl] > (b?.[recipeEl] ?? -1) ? m : b),
            null,
          ),
        ),
    ];
    if (elVals.every(Boolean)) {
      let f = 0,
        e = 0,
        a = 0,
        w = 0,
        qsum = 0;
      elVals.forEach((m, i) => {
        const w2 = i === 0 ? 2 : 1;
        f += m.fire * w2;
        e += m.earth * w2;
        a += m.air * w2;
        w += m.water * w2;
        qsum += m.quality * w2;
      });
      const elT =
        recipeEl === "fire"
          ? f
          : recipeEl === "earth"
            ? e
            : recipeEl === "air"
              ? a
              : w;
      const q = Math.floor(qsum / 5) + agentQualityBonus;
      const maxVal = Math.max(f, e, a, w);
      const domEl = [
        ["fire", f],
        ["earth", e],
        ["air", a],
        ["water", w],
      ]
        .filter(([, v]) => v === maxVal)
        .map(([n]) => n)
        .join("/");
      console.warn(
        `[findBestIngredients] "${recipe.product}" returned null. Best-case (max-el combo): elTotal=${elT} (need ${recipe.minScore}), quality=${q} (need ${recipe.minQuality}), dom=${domEl} (need ${recipe.element}), ignoreEmpty=${ignoreEmpty}`,
      );
      console.log(
        `  Best-case items:`,
        elVals
          .map(
            (m, i) =>
              `slot${i}=${m.name}(${recipeEl}:${m[recipeEl]},q:${m.quality},lager:${lager[m.id] ?? 0})`,
          )
          .join(", "),
      );
    }
  }
  return bestCombo;
};

// Fallback-Kette: (1) ignoreEmpty + kein Agent, (2) ignoreEmpty + Agent,
// (3) !ignoreEmpty + kein Agent, (4) !ignoreEmpty + Agent
// Gibt { combo, agent } zurück — agent ist null wenn kein Auto-Agent gebraucht wurde
window.findBestIngredientsWithFallback = (
  recipe,
  lager,
  disabledIds,
  ignoreEmpty,
) => {
  const bestAgent =
    window.AGENTS.find(
      (a) => a.element === recipe.element && a.quality === 20,
    ) || null;
  let combo,
    usedAgent = null;

  combo = window.findBestIngredients(
    recipe,
    0,
    lager,
    disabledIds,
    ignoreEmpty,
  );
  if (combo) return { combo, agent: null };

  if (bestAgent) {
    combo = window.findBestIngredients(
      recipe,
      0,
      lager,
      disabledIds,
      ignoreEmpty,
      bestAgent,
    );
    if (combo) return { combo, agent: bestAgent };
  }

  if (ignoreEmpty) {
    combo = window.findBestIngredients(recipe, 0, lager, disabledIds, false);
    if (combo) return { combo, agent: null };

    if (bestAgent) {
      combo = window.findBestIngredients(
        recipe,
        0,
        lager,
        disabledIds,
        false,
        bestAgent,
      );
      if (combo) return { combo, agent: bestAgent };
    }
  }

  return { combo: null, agent: null };
};

window.TYPE_ICONS = {
  Alloy: 1010,
  Food: 517,
  Sand: 7043,
  Wood: 1019,
  Beast: 919,
  Magic: 7117,
};

window.readCustomRecipes = () => {
  try {
    return JSON.parse(localStorage.getItem("alchemyCustomRecipes") || "[]");
  } catch {
    return [];
  }
};

window.writeCustomRecipes = (recipes) => {
  localStorage.setItem("alchemyCustomRecipes", JSON.stringify(recipes));
};

window.readFavorites = () => {
  try {
    return new Set(
      JSON.parse(localStorage.getItem("alchemyFavorites") || "[]"),
    );
  } catch {
    return new Set();
  }
};

window.writeFavorites = (set) => {
  localStorage.setItem("alchemyFavorites", JSON.stringify([...set]));
};

window.readCart = () => {
  try {
    return JSON.parse(localStorage.getItem("alchemyCart") || "[]");
  } catch {
    return [];
  }
};

window.writeCart = (cart) => {
  try {
    localStorage.setItem("alchemyCart", JSON.stringify(cart));
  } catch { }
};

window.readStateCookie = () => {
  try {
    const match = document.cookie.match(/(?:^|; )alchemyState=([^;]*)/);
    return match ? JSON.parse(decodeURIComponent(match[1])) : null;
  } catch {
    return null;
  }
};

window.writeStateCookie = (data) => {
  document.cookie =
    "alchemyState=" +
    encodeURIComponent(JSON.stringify(data)) +
    "; path=/; max-age=31536000";
};

const { useState, useMemo, useEffect } = React;
const ItemIcon = ({ id, name, size = "w-8 h-8", className = "" }) => {
  const src = ICON_DB[id] || null;
  if (!src) {
    return /*#__PURE__*/ React.createElement(
      "div",
      {
        className: `${size} ${className} bg-slate-200 dark:bg-slate-700/50 rounded-md flex items-center justify-center text-[10px] font-bold text-slate-400 dark:text-slate-500`,
        title: "Kein Icon verf\xEF\xBF\xBDgbar",
      },
      "?",
    );
  }
  return /*#__PURE__*/ React.createElement("img", {
    src: src,
    alt: name,
    title: name,
    className: `${size} ${className} object-contain drop-shadow-sm`,
  });
};
const NpcIcon = ({ npc, size = "w-10 h-10", chosen = false }) =>
  npc?.img
    ? /*#__PURE__*/ React.createElement("img", {
      src: npc.img,
      alt: npc.name,
      className: `${size} rounded-lg object-contain flex-shrink-0`,
    })
    : /*#__PURE__*/ React.createElement(
      "div",
      {
        className: `${size} rounded-lg flex items-center justify-center flex-shrink-0 ${chosen ? "bg-green-100 dark:bg-green-900/40" : "bg-slate-100 dark:bg-slate-700"}`,
      },
        /*#__PURE__*/ React.createElement("i", {
        className: `fa-solid fa-person text-base ${chosen ? "text-green-500" : "text-slate-400"}`,
      }),
    );
const MapView = ({
  loc,
  chosen,
  highlightedKeys,
  onlyHighlighted,
  maxSize,
  onSelect,
  fill,
}) => {
  const [imgError, setImgError] = React.useState(false);
  const [imgNatural, setImgNatural] = React.useState({
    w: 512,
    h: 512,
  });
  const containerRef = React.useRef(null);
  const [containerSize, setContainerSize] = React.useState(null);
  React.useEffect(() => {
    if (!fill || !containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r)
        setContainerSize({
          w: r.width,
          h: r.height,
        });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [fill]);
  if (!loc.mapImg || imgError) return null;
  const allMarked = loc.npcs.filter((n) => n.mapX != null && n.mapY != null);
  const marked =
    onlyHighlighted && highlightedKeys
      ? allMarked.filter((n) => highlightedKeys.includes(n.key))
      : allMarked;
  const effectiveMax = maxSize ?? imgNatural.w;
  const getNpcPos = (npc) => {
    if (!fill || !containerSize) {
      return {
        leftPct: (npc.mapX / imgNatural.w) * 100,
        topPct: (npc.mapY / imgNatural.h) * 100,
      };
    }
    const scale = Math.min(
      containerSize.w / imgNatural.w,
      containerSize.h / imgNatural.h,
    );
    const offX = (containerSize.w - imgNatural.w * scale) / 2;
    const offY = (containerSize.h - imgNatural.h * scale) / 2;
    return {
      leftPct: ((offX + npc.mapX * scale) / containerSize.w) * 100,
      topPct: ((offY + npc.mapY * scale) / containerSize.h) * 100,
    };
  };
  return /*#__PURE__*/ React.createElement(
    "div",
    {
      ref: containerRef,
      className:
        "relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900",
      style: fill
        ? {
          position: "absolute",
          inset: 0,
        }
        : {
          aspectRatio: `${imgNatural.w} / ${imgNatural.h}`,
          width: "100%",
          maxWidth: `${effectiveMax}px`,
        },
    },
    /*#__PURE__*/ React.createElement("img", {
      src: loc.mapImg,
      alt: loc.label,
      onError: () => setImgError(true),
      onLoad: (e) =>
        setImgNatural({
          w: e.target.naturalWidth || 512,
          h: e.target.naturalHeight || 512,
        }),
      className: "w-full h-full object-contain",
    }),
    marked.map((npc) => {
      const isChosen =
        chosen?.key === npc.key || highlightedKeys?.includes(npc.key);
      const { leftPct, topPct } = getNpcPos(npc);
      const labelBelow = npc.key === "bandit";
      return /*#__PURE__*/ React.createElement(
        "button",
        {
          key: npc.key,
          onClick: () => onSelect(npc),
          style: {
            left: `${leftPct}%`,
            top: `${topPct}%`,
            transform: labelBelow
              ? "translate(-50%, 0)"
              : "translate(-50%, -100%)",
          },
          className: "absolute flex flex-col items-center gap-0.5 group z-10",
          title: npc.name,
        },
        !labelBelow &&
          /*#__PURE__*/ React.createElement(
          "span",
          {
            className: `text-[9px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap leading-tight
                                        ${isChosen ? "bg-green-500 text-white" : "bg-slate-800/80 text-white group-hover:bg-indigo-600"}`,
          },
          npc.name,
        ),
        /*#__PURE__*/ React.createElement("div", {
          className: `w-3 h-3 rounded-full border-2 border-white shadow-md
                                    ${isChosen ? "bg-green-400" : "bg-indigo-500 group-hover:bg-indigo-400"}`,
          style: {
            marginTop: labelBelow ? "0" : "-2px",
          },
        }),
        labelBelow &&
          /*#__PURE__*/ React.createElement(
          "span",
          {
            className: `text-[9px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap leading-tight
                                        ${isChosen ? "bg-green-500 text-white" : "bg-slate-800/80 text-white group-hover:bg-indigo-600"}`,
          },
          npc.name,
        ),
      );
    }),
    marked.length === 0 &&
      /*#__PURE__*/ React.createElement(
      "div",
      {
        className:
          "absolute inset-0 flex items-end justify-center pb-2 pointer-events-none",
      },
        /*#__PURE__*/ React.createElement(
        "span",
        {
          className:
            "text-[10px] bg-slate-800/60 text-slate-300 px-2 py-0.5 rounded",
        },
        "Koordinaten noch nicht gesetzt",
      ),
    ),
  );
};
function App() {
  const [cauldron, setCauldron] = useState(() => {
    const s = readStateCookie();
    if (!s?.cauldron) return [null, null, null, null];
    return s.cauldron.map((id) =>
      id != null ? MATERIALS.find((m) => m.id === id) || null : null,
    );
  });
  const [catalyst, setCatalyst] = useState(() => {
    const s = readStateCookie();
    return s?.catalystName
      ? CATALYSTS.find((c) => c.name === s.catalystName) || CATALYSTS[0]
      : CATALYSTS[0];
  });
  const [selectedRecipe, setSelectedRecipe] = useState(() => {
    const s = readStateCookie();
    return s?.recipeId != null
      ? RECIPES.find((r) => r.id === s.recipeId) || null
      : null;
  });
  const [errorMsg, setErrorMsg] = useState("");
  const [filterRank, setFilterRank] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [swapSlotIndex, setSwapSlotIndex] = useState(null);
  const [swapOriginalItem, setSwapOriginalItem] = useState(null);
  const _swapOriginalRef = React.useRef(null);
  const _swapLastSlot = React.useRef(null);
  const [swapElementFilter, setSwapElementFilter] = useState(null);
  const [swapQualityFilter, setSwapQualityFilter] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const match = document.cookie.match(/(?:^|; )darkMode=([^;]*)/);
    return match ? match[1] === "1" : true;
  });
  const [lang, setLang] = useState(() => {
    const m = document.cookie.match(/(?:^|; )lang=([^;]*)/);
    return m ? m[1] : "de";
  });
  const t = (key) => (UI_T[lang] || UI_T.de)[key] ?? key;
  const [disabledItems, setDisabledItems] = useState(() => {
    try {
      return new Set(
        JSON.parse(localStorage.getItem("alchemyDisabledItems") || "[]"),
      );
    } catch {
      return new Set();
    }
  });
  const toggleDisabledItem = (id) => {
    setDisabledItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem("alchemyDisabledItems", JSON.stringify([...next]));
      } catch { }
      return next;
    });
  };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stockAlertOpen, setStockAlertOpen] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(() => {
    try {
      return parseInt(
        localStorage.getItem("alchemyLowStockThreshold") || "5",
        10,
      );
    } catch {
      return 5;
    }
  });
  const saveLowStockThreshold = (val) => {
    const n = Math.max(1, Math.min(9999, parseInt(val, 10) || 1));
    setLowStockThreshold(n);
    try {
      localStorage.setItem("alchemyLowStockThreshold", String(n));
    } catch { }
  };
  const [simplifiedDelivery, setSimplifiedDelivery] = useState(() => {
    try {
      return localStorage.getItem("alchemySimplifiedDelivery") === "1";
    } catch {
      return false;
    }
  });
  const toggleSimplifiedDelivery = () => {
    setSimplifiedDelivery((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("alchemySimplifiedDelivery", next ? "1" : "0");
      } catch { }
      return next;
    });
  };
  const [simplifiedCraftView, setSimplifiedCraftView] = useState(() => {
    try {
      return localStorage.getItem("alchemySimplifiedCraftView") === "1";
    } catch {
      return false;
    }
  });
  const toggleSimplifiedCraftView = () => {
    setSimplifiedCraftView((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(
          "alchemySimplifiedCraftView",
          next ? "1" : "0",
        );
      } catch { }
      return next;
    });
  };
  const [sessionStep4RecipeIdx, setSessionStep4RecipeIdx] = useState(() => {
    const v = parseInt(localStorage.getItem("alchemyStep4RecipeIdx"), 10);
    return isNaN(v) ? 0 : v;
  });
  const setSessionStep4RecipeIdxPersist = (v) => {
    setSessionStep4RecipeIdx(v);
    localStorage.setItem("alchemyStep4RecipeIdx", String(v));
  };
  const [ignoreEmptyItems, setIgnoreEmptyItems] = useState(() => {
    try {
      return localStorage.getItem("alchemyIgnoreEmptyItems") === "1";
    } catch {
      return false;
    }
  });
  const toggleIgnoreEmptyItems = () => {
    setIgnoreEmptyItems((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("alchemyIgnoreEmptyItems", next ? "1" : "0");
      } catch { }
      return next;
    });
  };
  const [rememberIngredients, setRememberIngredients] = useState(() => {
    try {
      return localStorage.getItem("alchemyRememberIngredients") === "1";
    } catch {
      return false;
    }
  });
  const toggleRememberIngredients = () => {
    setRememberIngredients((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("alchemyRememberIngredients", next ? "1" : "0");
      } catch { }
      return next;
    });
  };
  const saveRecipeIngredientsPersist = (recipeId, materialIds, agentId) => {
    try {
      localStorage.setItem(
        `alchemyRecipeIngredients_${recipeId}`,
        JSON.stringify({ materialIds, agentId: agentId ?? null }),
      );
    } catch { }
  };
  const loadRecipeIngredientsPersist = (recipeId) => {
    try {
      const s = localStorage.getItem(`alchemyRecipeIngredients_${recipeId}`);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  };
  const clearAllRecipeIngredientsPersist = () => {
    try {
      const keys = Object.keys(localStorage).filter((k) =>
        k.startsWith("alchemyRecipeIngredients_"),
      );
      keys.forEach((k) => localStorage.removeItem(k));
    } catch { }
  };
  const [matSplitMode, setMatSplitMode] = useState(() => {
    try {
      return localStorage.getItem("alchemySplitMode") || "none";
    } catch {
      return "none";
    }
  });
  const setMatSplitModeAndSave = (mode) => {
    setMatSplitMode(mode);
    try {
      localStorage.setItem("alchemySplitMode", mode);
    } catch { }
  };
  const getStorageType = (id) =>
    MATERIALS.find((m) => m.id === id)?.type === "Food" ||
      id === 609 ||
      id === 645 ||
      id === 656 ||
      id === 657
      ? "usable"
      : "etc";
  const [selectedAgent, setSelectedAgent] = useState(() => {
    const s = readStateCookie();
    return s?.agentId != null
      ? AGENTS.find((a) => a.id === s.agentId) || null
      : null;
  });
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [catalystModalOpen, setCatalystModalOpen] = useState(false);
  const [isCustomMode, setIsCustomMode] = useState(() => {
    const s = readStateCookie();
    return s?.isCustomMode ?? false;
  });
  const [customSlotTypes, setCustomSlotTypes] = useState(() => {
    const s = readStateCookie();
    return s?.customSlotTypes ?? [null, null, null, null];
  });
  const [customRank, setCustomRank] = useState(() => {
    const s = readStateCookie();
    return s?.customRank ?? "Basic";
  });
  const [typePickerSlot, setTypePickerSlot] = useState(null);
  const [customRecipes, setCustomRecipes] = useState(() => readCustomRecipes());
  const [favorites, setFavorites] = useState(() => readFavorites());
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveRecipeName, setSaveRecipeName] = useState("");
  const [activeCustomRecipeId, setActiveCustomRecipeId] = useState(null);
  const [cart, setCart] = useState(() => readCart());
  const [cartOpen, setCartOpen] = useState(() => {
    const s = readStateCookie();
    return s?.cartOpen ?? false;
  });
  const [cartExpandedRecipe, setCartExpandedRecipe] = useState(null);
  const [matGrouped, setMatGrouped] = useState(false);
  const pendingRemove = React.useRef({});

  // Session-Workflow
  const _savedSession = (() => {
    try {
      return JSON.parse(localStorage.getItem("alchemySession") || "null");
    } catch {
      return null;
    }
  })();
  const [sessionOpen, setSessionOpen] = useState(() => !!_savedSession?.open);
  const [sessionStep, setSessionStep] = useState(
    () => _savedSession?.step ?? 1,
  ); // 1=Auswahl, 2=Zutaten, 3=Plan
  const [sessionMaxStep, setSessionMaxStep] = useState(
    () => _savedSession?.step ?? 1,
  );
  const goToSessionStep = (s) => {
    setSessionStep(s);
    setSessionMaxStep((prev) => Math.max(prev, s));
  };
  React.useEffect(() => {
    setSessionMaxStep((prev) => Math.max(prev, sessionStep));
  }, [sessionStep]);
  const [sessionRecipes, setSessionRecipes] = useState(() => {
    const raw = _savedSession?.recipes ?? [];
    return raw.map((r) => ({
      _id: Math.random().toString(36).slice(2, 10),
      parentId: null,
      ...r,
    }));
  }); // [{recipeId, savedMaterials:[id|null,...], _id:string, parentId:string|null}]
  const [sessionActiveIdx, setSessionActiveIdx] = useState(
    () => _savedSession?.activeIdx ?? 0,
  ); // welches Rezept wird in Schritt 2 bearbeitet
  const [sessionSearch, setSessionSearch] = useState("");
  const [sessionFilterRank, setSessionFilterRank] = useState("All");
  const [sessionCauldron, setSessionCauldron] = useState(() => {
    const ids = _savedSession?.cauldron ?? [null, null, null, null];
    return ids.map((id) =>
      id != null ? MATERIALS.find((m) => m.id === id) || null : null,
    );
  });
  const [sessionSwapSlotIndex, setSessionSwapSlotIndex] = useState(null);
  const [sessionSwapOriginalItem, setSessionSwapOriginalItem] = useState(null);
  const _sessionSwapOriginalRef = React.useRef(null);
  const _sessionSwapLastSlot = React.useRef(null);
  const sessionDeliveryCardRefs = React.useRef([]);
  const scrollToNextDeliveryCard = (currentIdx) => {
    const nextIdx = currentIdx + 1;
    setTimeout(() => {
      const el = sessionDeliveryCardRefs.current[nextIdx];
      if (el)
        el.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 150);
  };
  const [sessionSwapElementFilter, setSessionSwapElementFilter] =
    useState(null);
  const [sessionSwapQualityFilter, setSessionSwapQualityFilter] =
    useState(null);
  const [sessionAgents, setSessionAgents] = useState(() => {
    const id = _savedSession?.agentId ?? null;
    const agent = id != null ? AGENTS.find((a) => a.id === id) || null : null;
    // legacy: single agentId → put in slot 0; new: agentIds array
    if (_savedSession?.agentIds)
      return _savedSession.agentIds.map((aid) =>
        aid != null ? AGENTS.find((a) => a.id === aid) || null : null,
      );
    return agent ? [agent] : [];
  });
  const sessionAgent = sessionAgents[sessionActiveIdx] ?? null;
  const setSessionAgent = (agent) =>
    setSessionAgents((prev) => {
      const next = [...prev];
      while (next.length <= sessionActiveIdx) next.push(null);
      next[sessionActiveIdx] = agent;
      return next;
    });
  const [sessionAgentModalOpen, setSessionAgentModalOpen] = useState(false);
  const [sessionDelivery, setSessionDelivery] = useState(
    () => _savedSession?.delivery ?? [],
  );
  const [sessionStep3ExpandedRecipes, setSessionStep3ExpandedRecipes] =
    useState(() => new Set());
  const [sessionDeliveryTab, setSessionDeliveryTab] = useState([]);
  const [sessionDragIdx, setSessionDragIdx] = useState(null);
  const [sessionDragOverIdx, setSessionDragOverIdx] = useState(null);
  const [sessionCraftPicker, setSessionCraftPicker] = useState(null);
  const sessionReorderRecipes = (fromIdx, toIdx) => {
    if (fromIdx === toIdx) return;
    setSessionRecipes((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
    setSessionAgents((prev) => {
      const next = [...prev];
      while (next.length <= Math.max(fromIdx, toIdx)) next.push(null);
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
    setSessionActiveIdx(toIdx);
  };
  const [copiedNaviKey, setCopiedNaviKey] = useState(null);
  const [ocrState, setOcrState] = useState(null); // null | 'loading' | 'noimage' | 'error' | {found: N}
  const [ocrAmbiguous, setOcrAmbiguous] = useState(null); // null | { list: [{text, matches}], idx }
  const copyNavi = (npc, key) => {
    const parts = npc.navi.split(" ");
    const cmd = `/navi ${parts[0]} ${parts[1]}/${parts[2]}`;
    navigator.clipboard.writeText(cmd).catch(() => { });
    setCopiedNaviKey(key);
    setTimeout(() => setCopiedNaviKey(null), 2000);
  };
  const levenshtein = (a, b) => {
    const dp = Array.from(
      {
        length: a.length + 1,
      },
      (_, i) => [i, ...Array(b.length).fill(0)],
    );
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] =
          a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return dp[a.length][b.length];
  };
  const preprocessImageBlob = (blob) =>
    new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const scale = 4;
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Grayscale + threshold for pixel fonts
        const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = idata.data;
        for (let i = 0; i < d.length; i += 4) {
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const val = gray < 160 ? 0 : 255;
          d[i] = d[i + 1] = d[i + 2] = val;
        }
        ctx.putImageData(idata, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(resolve, "image/png");
      };
      img.src = url;
    });
  const runOcr = async (blob) => {
    try {
      if (!window.Tesseract) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "./tesseract.min.js";
          s.onload = resolve;
          s.onerror = () => {
            const s2 = document.createElement("script");
            s2.src = "https://unpkg.com/tesseract.js@5/dist/tesseract.min.js";
            s2.onload = resolve;
            s2.onerror = reject;
            document.head.appendChild(s2);
          };
          document.head.appendChild(s);
        });
      }
      const processedBlob = await preprocessImageBlob(blob);
      const workerAbsPath = new URL("./worker.min.js", document.baseURI).href;
      const {
        data: { text },
      } = await window.Tesseract.recognize(processedBlob, "eng", {
        workerPath: workerAbsPath,
        tessedit_pageseg_mode: "6",
        tessedit_ocr_engine_mode: "1",
      });
      console.log("[OCR raw]", text);
      const norm = (s) =>
        s
          .toLowerCase()
          .replace(/[^a-z0-9 ]/g, "")
          .trim();

      // Strip all non-alphanumeric for comparison (handles unicode apostrophes, dashes etc.)
      const flat = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

      // Collect candidates, counting occurrences per flat-form.
      // We use a Map<flatString → {bestText, count}> so that:
      //   - OCR artifacts ("Garms Essence" vs "Garm's Essence") share one flat-key
      //     and are counted as ONE item (same recipe, OCR noise)
      //   - Genuinely repeated entries ("Water Stone" × 2) get count=2
      const candidateMap = new Map(); // flat → { bestText, count }

      const addCandidate = (raw, countable) => {
        const text2 = raw.trim();
        if (text2.length < 3) return;
        const f = flat(text2);
        if (!f) return;
        if (candidateMap.has(f)) {
          // Only increment count if this strategy is allowed to count duplicates
          // (Strategy 1 = parentheses = the only reliable count source)
          if (countable) candidateMap.get(f).count++;
        } else {
          candidateMap.set(f, {
            bestText: text2,
            count: 1,
          });
        }
      };

      // Strategy 1: anything in parentheses starting with a capital letter
      // e.g. "(Energy Ore)" — most reliable for this game UI
      // countable=true: each paren occurrence = one real recipe slot
      const parenRe = /\(([A-Z][^)\n]{1,45})\)/g;
      let m;
      while ((m = parenRe.exec(text)) !== null) addCandidate(m[1], true);

      // Strategy 2: R1: / R1) / Ri: with optional paren around name
      // countable=false: only used for discovery, not counting
      const rRe = /[Rr][lLiI1\d][^A-Za-z\n]{0,4}([A-Z][^\n(]{1,45})/g;
      while ((m = rRe.exec(text)) !== null) {
        const c = m[1].replace(/[()[\]{}'"`]/g, "").trim();
        if (c.length > 2) addCandidate(c, false);
      }

      // Strategy 3: every line that starts with a capital and looks like a name
      // countable=false: only used for discovery, not counting
      text.split("\n").forEach((line) => {
        const clean = line.replace(/^[^A-Z]+/, "").trim();
        if (/^[A-Z][a-zA-Z' ]{3,40}$/.test(clean)) addCandidate(clean, false);
      });
      const dedupedCandidates = [...candidateMap.values()];
      console.log(
        "[OCR candidates]",
        dedupedCandidates.map((c) => `${c.bestText}×${c.count}`),
      );
      const allRecipes = [...RECIPES, ...customRecipes];
      console.log(
        "[OCR allRecipes count]",
        allRecipes.length,
        allRecipes.slice(0, 3).map((r) => r.product),
      );
      let found = 0;
      const ocrQueue = []; // ordered: {type:'exact',recipeId} | {type:'ambiguous',text,matches}
      // We do NOT block duplicates — the user wants them.
      dedupedCandidates.forEach(({ bestText: name, count }) => {
        if (ocrQueue.length >= 5) return;
        const nNorm = norm(name);
        const nFlat = flat(name);
        if (nNorm.length < 3) return;
        const nWords = nNorm.split(" ").filter((w) => w.length > 2);
        const allMatches = [];
        allRecipes.forEach((r) => {
          if (!r.product) return;
          const rNorm = norm(r.product);
          const rFlat = flat(r.product);
          const rWords = rNorm.split(" ").filter((w) => w.length > 2);
          let score = Infinity;
          if (rFlat === nFlat || rNorm === nNorm) {
            score = 0;
          } else if (rNorm.includes(nNorm) || nNorm.includes(rNorm)) {
            score = Math.abs(rNorm.length - nNorm.length) * 0.5;
          } else if (nWords.length > 0 && rWords.length > 0) {
            const intersection = nWords.filter((w) =>
              rWords.includes(w),
            ).length;
            const wordScore =
              intersection / Math.max(nWords.length, rWords.length);
            if (wordScore >= 0.75) score = (1 - wordScore) * 5;
          }
          if (score === Infinity) {
            const dist = levenshtein(rFlat, nFlat);
            const maxLen = Math.max(rFlat.length, nFlat.length);
            if (maxLen > 0 && dist / maxLen < 0.28) score = dist;
          }
          if (score < Infinity)
            allMatches.push({
              recipe: r,
              score,
            });
        });
        if (allMatches.length === 0) {
          console.log(`[OCR no-match] "${name}" → no recipe within threshold`);
          return;
        }
        allMatches.sort((a, b) => a.score - b.score);

        // For ambiguity check: deduplicate by recipeId within this candidate's matches only
        const seenIds = new Set();
        const unique = allMatches.filter((m) => {
          if (seenIds.has(m.recipe.id)) return false;
          seenIds.add(m.recipe.id);
          return true;
        });

        // Eindeutig wenn: bester Score 0 (exakt) oder bester Score deutlich besser als der nächste
        const singleExact =
          unique[0].score === 0
            ? unique.length === 1 || unique[1].score > 0
            : unique.length === 1 || unique[0].score * 2.5 < unique[1].score;
        if (unique.length === 1 || singleExact) {
          const best = unique[0].recipe;
          // Push once per occurrence (e.g. Water Stone ×2 → 2 queue entries)
          const times = Math.min(count, 5 - ocrQueue.length);
          for (let i = 0; i < times; i++)
            ocrQueue.push({
              type: "exact",
              recipeId: best.id,
            });
          const runner_up = unique[1]
            ? ` (runner-up: "${unique[1].recipe.product}" score=${unique[1].score.toFixed(2)})`
            : " (sole match)";
          console.log(
            `[OCR match] "${name}" ×${count} → "${best.product}" | score=${unique[0].score.toFixed(2)}${runner_up}`,
          );
          found += times;
        } else {
          console.log(
            `[OCR ambiguous] "${name}" → top matches:`,
            unique
              .slice(0, 5)
              .map((m) => `"${m.recipe.product}" score=${m.score.toFixed(2)}`),
          );
          ocrQueue.push({
            type: "ambiguous",
            text: name,
            matches: unique.map((m) => m.recipe),
          });
        }
      });
      setOcrState({
        found,
      });
      setTimeout(() => setOcrState(null), 4000);
      console.log(
        "[OCR queue order]",
        ocrQueue.map((x) =>
          x.type === "exact" ? `exact:${x.recipeId}` : `ambiguous:${x.text}`,
        ),
      );
      if (ocrQueue.length > 0) {
        const hasAmbiguous = ocrQueue.some((x) => x.type === "ambiguous");
        if (!hasAmbiguous) {
          // Pre-build outside setState to avoid stale closures
          // Duplicates in toAdd are intentional (same recipe multiple times in screenshot)
          const toAdd = ocrQueue.map((item) => ({
            recipeId: item.recipeId,
            savedMaterials: null,
          }));
          console.log(
            "[OCR no-ambiguous toAdd]",
            toAdd.map((x) => x.recipeId),
          );
          setSessionRecipes((prev) => [...prev, ...toAdd]);
        } else {
          const firstAmbiguousIdx = ocrQueue.findIndex(
            (x) => x.type === "ambiguous",
          );
          setOcrAmbiguous({
            list: ocrQueue,
            idx: firstAmbiguousIdx,
            resolvedIds: {},
          });
        }
      }
    } catch (e) {
      console.error("OCR:", e);
      setOcrState("error");
      setTimeout(() => setOcrState(null), 3000);
    }
  };
  const scanScreenshot = () => {
    setOcrState("paste");
    const handler = (e) => {
      document.removeEventListener("paste", handler);
      const items = e.clipboardData?.items;
      if (!items) {
        setOcrState("noimage");
        setTimeout(() => setOcrState(null), 3000);
        return;
      }
      let blob = null;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          blob = item.getAsFile();
          break;
        }
      }
      if (!blob) {
        setOcrState("noimage");
        setTimeout(() => setOcrState(null), 3000);
        return;
      }
      setSessionRecipes([]);
      setOcrState("loading");
      runOcrRef.current(blob);
    };
    document.addEventListener("paste", handler);
    // Auto-cancel if user doesn't paste within 15s
    setTimeout(() => {
      document.removeEventListener("paste", handler);
      setOcrState((prev) => (prev === "paste" ? null : prev));
    }, 15000);
  };

  // Ref so the paste handler always calls the latest runOcr (avoids stale closure over sessionRecipes)
  const runOcrRef = React.useRef(runOcr);
  runOcrRef.current = runOcr;

  // Auto-trigger OCR on paste in Step 1 unless search input is focused
  useEffect(() => {
    if (sessionStep !== 1) return;
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      const isInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        document.activeElement?.isContentEditable;
      if (isInput) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      let blob = null;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          blob = item.getAsFile();
          break;
        }
      }
      if (!blob) return; // no image → don't intercept (allow normal paste)
      e.preventDefault();
      setSessionRecipes([]);
      setOcrState("loading");
      runOcrRef.current(blob);
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [sessionStep]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "alchemySession",
        JSON.stringify({
          open: sessionOpen,
          step: sessionStep,
          recipes: sessionRecipes,
          activeIdx: sessionActiveIdx,
          cauldron: sessionCauldron.map((m) => m?.id ?? null),
          agentId: sessionAgent?.id ?? null,
          agentIds: sessionAgents.map((a) => a?.id ?? null),
          delivery: sessionDelivery,
        }),
      );
    } catch { }
  }, [
    sessionOpen,
    sessionStep,
    sessionRecipes,
    sessionActiveIdx,
    sessionCauldron,
    sessionAgents,
    sessionDelivery,
  ]);
  const [lagerText, setLagerText] = useState(() => {
    try {
      return localStorage.getItem("alchemyLager") || "";
    } catch {
      return "";
    }
  });
  const [lagerOpen, setLagerOpen] = useState(false);
  const lagerHovered = React.useRef(false);
  const parseLagerText = (text) => {
    const map = {};
    const materialIds = new Set([
      ...MATERIALS.map((m) => m.id),
      ...CATALYSTS.filter((c) => c.id !== "none").map((c) => c.id),
      ...POTION_BASE.map((p) => p.id),
      ...AGENTS.map((a) => a.id),
    ]);
    text.split("\n").forEach((line) => {
      const parts = line.trim().split("\t");
      if (parts.length < 3) return;
      const id = parseInt(parts[0]);
      const amount = parseInt(parts[2].replace(/[.,]/g, "").replace(/\s/g, ""));
      if (isNaN(id) || isNaN(amount)) return;
      if (!materialIds.has(id)) return;
      map[id] = (map[id] || 0) + amount;
    });
    return map;
  };
  const [parsedLager, setParsedLager] = useState(() => {
    // Immer aus Rohtext parsen, damit neu hinzugefügte Item-Typen (z.B. Agents) erkannt werden
    try {
      const text = localStorage.getItem("alchemyLager") || "";
      if (text) return parseLagerText(text);
    } catch { }
    try {
      const stored = localStorage.getItem("alchemyLagerData");
      if (stored) return JSON.parse(stored);
    } catch { }
    return {};
  });
  const saveLager = (text) => {
    setLagerText(text);
    const map = parseLagerText(text);
    setParsedLager(map);
    try {
      localStorage.setItem("alchemyLager", text);
    } catch { }
    try {
      localStorage.setItem("alchemyLagerData", JSON.stringify(map));
    } catch { }
    return map;
  };
  const sessionAllMaterials = React.useMemo(() => {
    const matNeeded = {};
    sessionRecipes.forEach(({ recipeId, savedMaterials }) => {
      const recipe = [...RECIPES, ...customRecipes].find(
        (r) => r.id === recipeId,
      );
      if (!recipe) return;
      let materials;
      if (savedMaterials && savedMaterials.some((id) => id != null)) {
        materials = savedMaterials
          .map((id) => (id != null ? MATERIALS.find((m) => m.id === id) : null))
          .filter(Boolean);
      } else {
        materials =
          findBestIngredients(recipe, 0, parsedLager, disabledItems) || [];
      }
      materials.forEach((mat) => {
        matNeeded[mat.id] = (matNeeded[mat.id] || 0) + 1;
      });
      const effectiveRank =
        recipe.rank === "Custom" ? recipe.customRank : recipe.rank;
      const potionId = {
        Basic: 645,
        Intermediate: 656,
        Advanced: 657,
      }[effectiveRank];
      if (potionId) matNeeded[potionId] = (matNeeded[potionId] || 0) + 2;
    });
    sessionAgents.forEach((agent) => {
      if (agent) matNeeded[agent.id] = (matNeeded[agent.id] || 0) + 1;
    });
    return matNeeded;
  }, [
    sessionRecipes,
    customRecipes,
    parsedLager,
    sessionAgents,
    disabledItems,
  ]);
  const sessionPerRecipeMaterials = React.useMemo(() => {
    return sessionRecipes.map(({ recipeId, savedMaterials }, recipeIdx) => {
      const recipe = [...RECIPES, ...customRecipes].find(
        (r) => r.id === recipeId,
      );
      if (!recipe) return {};
      const matNeeded = {};
      let materials;
      if (savedMaterials && savedMaterials.some((id) => id != null)) {
        materials = savedMaterials
          .map((id) => (id != null ? MATERIALS.find((m) => m.id === id) : null))
          .filter(Boolean);
      } else {
        materials =
          findBestIngredients(recipe, 0, parsedLager, disabledItems) || [];
      }
      materials.forEach((mat) => {
        matNeeded[mat.id] = (matNeeded[mat.id] || 0) + 1;
      });
      const effectiveRank =
        recipe.rank === "Custom" ? recipe.customRank : recipe.rank;
      const potionId = {
        Basic: 645,
        Intermediate: 656,
        Advanced: 657,
      }[effectiveRank];
      if (potionId) matNeeded[potionId] = (matNeeded[potionId] || 0) + 2;
      const recipeAgent = sessionAgents[recipeIdx] ?? null;
      if (recipeAgent)
        matNeeded[recipeAgent.id] = (matNeeded[recipeAgent.id] || 0) + 1;
      return matNeeded;
    });
  }, [
    sessionRecipes,
    customRecipes,
    parsedLager,
    sessionAgents,
    disabledItems,
  ]);
  const startSession = () => {
    // Wenn bereits eine Session läuft, diese fortsetzen
    if (sessionRecipes.length > 0) {
      setSessionOpen(true);
      return;
    }
    setSessionRecipes([]);
    setSessionStep(1);
    setSessionMaxStep(1);
    setSessionSearch("");
    setSessionCauldron([null, null, null, null]);
    setSessionActiveIdx(0);
    setSessionDelivery([]);
    setSessionDeliveryTab([]);
    setSessionOpen(true);
  };
  const sessionToggleRecipe = (recipeId) => {
    setSessionRecipes((prev) => {
      const existing = prev.find((r) => r.recipeId === recipeId);
      if (existing) {
        const toRemove = new Set();
        const collect = (id) => {
          toRemove.add(id);
          prev.filter((r) => r.parentId === id).forEach((r) => collect(r._id));
        };
        collect(existing._id);
        return prev.filter((r) => !toRemove.has(r._id));
      }
      if (sessionSearch) setSessionSearch("");
      return [
        ...prev,
        {
          recipeId,
          savedMaterials: null,
          _id: Math.random().toString(36).slice(2, 10),
          parentId: null,
        },
      ];
    });
  };
  const sessionGoToStep2 = () => {
    // Für jedes Rezept beste Zutaten vorbelegen (mit Agent-Fallback)
    const agentUpdates = [];
    const newRecipes = sessionRecipes.map((entry, idx) => {
      if (entry.savedMaterials && entry.savedMaterials.some((id) => id != null))
        return entry;
      const recipe = [...RECIPES, ...customRecipes].find(
        (r) => r.id === entry.recipeId,
      );
      if (!recipe)
        return {
          ...entry,
          savedMaterials: [null, null, null, null],
        };
      let matIds;
      if (recipe.rank === "Custom" && recipe.savedMaterials) {
        matIds = recipe.savedMaterials;
        if (recipe.savedAgentId != null && !(sessionAgents[idx] ?? null)) {
          const savedAgent =
            AGENTS.find((a) => a.id === recipe.savedAgentId) || null;
          if (savedAgent) agentUpdates.push({ idx, agent: savedAgent });
        }
      } else if (rememberIngredients) {
        const persisted = loadRecipeIngredientsPersist(entry.recipeId);
        if (persisted) {
          matIds = persisted.materialIds;
          if (persisted.agentId != null && !(sessionAgents[idx] ?? null)) {
            const savedAgent =
              AGENTS.find((a) => a.id === persisted.agentId) || null;
            if (savedAgent) agentUpdates.push({ idx, agent: savedAgent });
          }
        } else {
          matIds = [null, null, null, null];
        }
      } else {
        const existingAgent = sessionAgents[idx] ?? null;
        let combo;
        if (existingAgent) {
          // Bereits Agent gewählt: direkt mit diesem suchen
          combo =
            findBestIngredients(
              recipe,
              0,
              parsedLager,
              disabledItems,
              ignoreEmptyItems,
              existingAgent,
            ) ||
            (ignoreEmptyItems
              ? findBestIngredients(
                recipe,
                0,
                parsedLager,
                disabledItems,
                false,
                existingAgent,
              )
              : null);
        }
        if (!combo) {
          const { combo: fb, agent: fbAgent } = findBestIngredientsWithFallback(
            recipe,
            parsedLager,
            disabledItems,
            ignoreEmptyItems,
          );
          combo = fb;
          if (fbAgent)
            agentUpdates.push({
              idx,
              agent: fbAgent,
            });
        }
        const mats = combo || [];
        matIds = [
          mats[0]?.id ?? null,
          mats[1]?.id ?? null,
          mats[2]?.id ?? null,
          mats[3]?.id ?? null,
        ];
      }
      return {
        ...entry,
        savedMaterials: matIds,
      };
    });
    setSessionRecipes(newRecipes);
    if (agentUpdates.length > 0) {
      setSessionAgents((prev) => {
        const next = [...prev];
        agentUpdates.forEach(({ idx, agent }) => {
          while (next.length <= idx) next.push(null);
          next[idx] = agent;
        });
        return next;
      });
    }
    setSessionActiveIdx(0);
    const firstNewEntry = newRecipes[0];
    if (firstNewEntry) {
      setSessionCauldron(
        (firstNewEntry.savedMaterials || [null, null, null, null]).map((id) =>
          id != null ? MATERIALS.find((m) => m.id === id) || null : null,
        ),
      );
    }
    setSessionStep(2);
  };
  const sessionSelectRecipeSlot = (idx) => {
    // Erst aktuellen Kessel speichern
    if (rememberIngredients) {
      const currentMaterials = sessionCauldron.map((m) => m?.id ?? null);
      const currentRecipe = sessionRecipes[sessionActiveIdx];
      if (currentRecipe) {
        saveRecipeIngredientsPersist(
          currentRecipe.recipeId,
          currentMaterials,
          sessionAgents[sessionActiveIdx]?.id ?? null,
        );
      }
    }
    setSessionRecipes((prev) =>
      prev.map((e, i) =>
        i === sessionActiveIdx
          ? {
            ...e,
            savedMaterials: sessionCauldron.map((m) => m?.id ?? null),
          }
          : e,
      ),
    );
    // Dann neues Rezept laden
    setSessionActiveIdx(idx);
    const entry = sessionRecipes[idx];
    const sm = entry?.savedMaterials;
    if (sm && sm.some((id) => id != null)) {
      setSessionCauldron(
        sm.map((id) =>
          id != null ? MATERIALS.find((m) => m.id === id) || null : null,
        ),
      );
    } else {
      const recipe = [...RECIPES, ...customRecipes].find(
        (r) => r.id === entry?.recipeId,
      );
      if (recipe?.rank === "Custom" && recipe.savedMaterials) {
        setSessionCauldron(
          recipe.savedMaterials.map((id) =>
            id != null ? MATERIALS.find((m) => m.id === id) || null : null,
          ),
        );
      } else if (rememberIngredients) {
        const persisted = loadRecipeIngredientsPersist(entry?.recipeId);
        if (persisted) {
          setSessionCauldron(
            persisted.materialIds.map((id) =>
              id != null ? MATERIALS.find((m) => m.id === id) || null : null,
            ),
          );
          if (persisted.agentId != null) {
            const savedAgent =
              AGENTS.find((a) => a.id === persisted.agentId) || null;
            if (savedAgent) {
              setSessionAgents((prev) => {
                const next = [...prev];
                while (next.length <= idx) next.push(null);
                next[idx] = savedAgent;
                return next;
              });
            }
          }
        } else {
          setSessionCauldron([null, null, null, null]);
        }
      } else {
        const existingAgent = sessionAgents[idx] ?? null;
        let combo;
        if (existingAgent) {
          combo =
            findBestIngredients(
              recipe,
              0,
              parsedLager,
              disabledItems,
              ignoreEmptyItems,
              existingAgent,
            ) ||
            (ignoreEmptyItems
              ? findBestIngredients(
                recipe,
                0,
                parsedLager,
                disabledItems,
                false,
                existingAgent,
              )
              : null);
        }
        if (!combo && recipe) {
          const { combo: fb, agent: fbAgent } = findBestIngredientsWithFallback(
            recipe,
            parsedLager,
            disabledItems,
            ignoreEmptyItems,
          );
          combo = fb;
          if (fbAgent)
            setSessionAgents((prev) => {
              const next = [...prev];
              while (next.length <= idx) next.push(null);
              next[idx] = fbAgent;
              return next;
            });
        }
        setSessionCauldron(
          combo ? combo.map((m) => m) : [null, null, null, null],
        );
      }
    }
  };
  const sessionGoToStep3 = () => {
    // Aktuellen Kessel für aktives Rezept sichern
    const updatedRecipes = sessionRecipes.map((e, i) =>
      i === sessionActiveIdx
        ? { ...e, savedMaterials: sessionCauldron.map((m) => m?.id ?? null) }
        : e,
    );
    if (rememberIngredients) {
      updatedRecipes.forEach((entry, i) => {
        if (entry.savedMaterials?.some((id) => id != null)) {
          saveRecipeIngredientsPersist(
            entry.recipeId,
            entry.savedMaterials,
            sessionAgents[i]?.id ?? null,
          );
        }
      });
    }
    setSessionRecipes(updatedRecipes);
    setSessionStep(3);
  };

  const sessionGoToStep4 = () => {
    setSessionStep3ExpandedRecipes((prev) => {
      if (prev.size > 0) return prev;
      const knownIds = new Set(sessionRecipes.map((r) => r._id));
      const childrenOf = {};
      sessionRecipes.forEach((r, i) => {
        if (r.parentId && knownIds.has(r.parentId)) {
          if (!childrenOf[r.parentId]) childrenOf[r.parentId] = [];
          childrenOf[r.parentId].push(i);
        }
      });
      const craftOrder = [];
      const visit = (idx) => {
        (childrenOf[sessionRecipes[idx]._id] || []).forEach((ci) => visit(ci));
        craftOrder.push(idx);
      };
      sessionRecipes.forEach((r, i) => {
        if (!r.parentId || !knownIds.has(r.parentId)) visit(i);
      });
      if (craftOrder.length > 0)
        return new Set([sessionRecipes[craftOrder[0]].recipeId]);
      return prev;
    });
    setSessionStep4RecipeIdxPersist(0);
    setSessionStep(4);
  };

  // Berechnet den Tab-Index, der den gewählten NPC enthält (Fallback: 0)
  const tabForNpc = (npc) => {
    if (!npc) return 0;
    const idx = DELIVERY_LOCATIONS.findIndex((loc) =>
      loc.npcs.some((n) => n.key === npc.key),
    );
    return idx >= 0 ? idx : 0;
  };
  const sessionGoToStep5 = () => {
    setSessionDelivery((prev) => {
      const arr = [...prev];
      while (arr.length < sessionRecipes.length) arr.push(null);
      return arr.slice(0, sessionRecipes.length);
    });
    // Pro Rezept: Tab auf Location des gewï¿½hlten NPC setzen (oder 0)
    setSessionDeliveryTab(
      sessionRecipes.map((_, i) => tabForNpc(sessionDelivery[i] ?? null)),
    );
    setSessionStep(5);
  };
  const sessionConfirm = () => {
    if (Object.keys(sessionAllMaterials).length === 0) return;
    const newMap = {
      ...parsedLager,
    };
    Object.entries(sessionAllMaterials).forEach(([idStr, needed]) => {
      const id = parseInt(idStr);
      newMap[id] = Math.max(0, (newMap[id] || 0) - needed);
      if (newMap[id] === 0) delete newMap[id];
    });
    setParsedLager(newMap);
    try {
      localStorage.setItem("alchemyLagerData", JSON.stringify(newMap));
    } catch { }
    try {
      localStorage.removeItem("alchemySession");
    } catch { }
    // Session-State vollständig zurücksetzen
    setSessionRecipes([]);
    setSessionStep(1);
    setSessionMaxStep(1);
    setSessionSearch("");
    setSessionCauldron([null, null, null, null]);
    setSessionActiveIdx(0);
    setSessionDelivery([]);
    setSessionDeliveryTab([]);
    setSessionAgents([]);
    setSessionOpen(false);
  };
  useEffect(() => {
    writeStateCookie({
      recipeId: selectedRecipe?.id ?? null,
      cauldron: cauldron.map((m) => m?.id ?? null),
      agentId: selectedAgent?.id ?? null,
      catalystName: catalyst?.name ?? null,
      isCustomMode,
      customSlotTypes,
      customRank,
      cartOpen,
    });
  }, [
    selectedRecipe,
    cauldron,
    selectedAgent,
    catalyst,
    isCustomMode,
    customSlotTypes,
    customRank,
    cartOpen,
  ]);

  // Swap-Slot-Original zurücksetzen wenn Rezept oder Modus wechselt
  useEffect(() => {
    _swapOriginalRef.current = null;
    _swapLastSlot.current = null;
    setSwapOriginalItem(null);
  }, [selectedRecipe?.id, isCustomMode]);
  useEffect(() => {
    _sessionSwapOriginalRef.current = null;
    _sessionSwapLastSlot.current = null;
    setSessionSwapOriginalItem(null);
  }, [sessionActiveIdx]);
  const [lagerPasteToast, setLagerPasteToast] = useState(null);
  const lagerPasteToastTimer = React.useRef(null);
  const [saveSuccessToast, setSaveSuccessToast] = React.useState(null);
  const saveSuccessToastTimer = React.useRef(null);
  const showLagerToast = (map) => {
    const count = Object.keys(map).length;
    setLagerPasteToast(count);
    clearTimeout(lagerPasteToastTimer.current);
    lagerPasteToastTimer.current = setTimeout(
      () => setLagerPasteToast(null),
      3000,
    );
  };
  useEffect(() => {
    const handleLagerPaste = (e) => {
      if (!lagerHovered.current) return;
      const text = e.clipboardData && e.clipboardData.getData("text/plain");
      if (!text || !text.trim()) return;
      e.preventDefault();
      ReactDOM.flushSync(() => {
        const map = saveLager(text);
        showLagerToast(map);
      });
    };
    document.addEventListener("paste", handleLagerPaste);
    return () => document.removeEventListener("paste", handleLagerPaste);
  }, []);
  useEffect(() => {
    writeCart(cart);
  }, [cart]);
  const cartPerRecipe = useMemo(() => {
    return cart.map(({ recipeId, quantity, savedMaterials }) => {
      if (quantity <= 0) return {};
      const recipe = [...RECIPES, ...customRecipes].find(
        (r) => r.id === recipeId,
      );
      if (!recipe) return {};
      const matNeeded = {};
      let materials;
      if (savedMaterials && savedMaterials.some((id) => id != null)) {
        materials = savedMaterials
          .map((id) => (id != null ? MATERIALS.find((m) => m.id === id) : null))
          .filter(Boolean);
      } else if (recipe.rank === "Custom" && recipe.savedMaterials) {
        materials = recipe.savedMaterials
          .map((id) => (id != null ? MATERIALS.find((m) => m.id === id) : null))
          .filter(Boolean);
      } else {
        materials =
          findBestIngredients(recipe, 0, parsedLager, disabledItems) || [];
      }
      materials.forEach((mat) => {
        matNeeded[mat.id] = (matNeeded[mat.id] || 0) + quantity;
      });
      const effectiveRank =
        recipe.rank === "Custom" ? recipe.customRank : recipe.rank;
      const potionId = {
        Basic: 645,
        Intermediate: 656,
        Advanced: 657,
      }[effectiveRank];
      if (potionId)
        matNeeded[potionId] = (matNeeded[potionId] || 0) + 2 * quantity;
      return matNeeded;
    });
  }, [cart, customRecipes, parsedLager, disabledItems]);
  const cartTotal = useMemo(() => {
    const matNeeded = {};
    cart.forEach(({ recipeId, quantity, savedMaterials }) => {
      if (quantity <= 0) return;
      const recipe = [...RECIPES, ...customRecipes].find(
        (r) => r.id === recipeId,
      );
      if (!recipe) return;
      let materials;
      if (savedMaterials && savedMaterials.some((id) => id != null)) {
        // Gespeicherte (ggf. manuell geï¿½nderte) Rezeptur verwenden
        materials = savedMaterials
          .map((id) => (id != null ? MATERIALS.find((m) => m.id === id) : null))
          .filter(Boolean);
      } else if (recipe.rank === "Custom" && recipe.savedMaterials) {
        materials = recipe.savedMaterials
          .map((id) => (id != null ? MATERIALS.find((m) => m.id === id) : null))
          .filter(Boolean);
      } else {
        materials =
          findBestIngredients(recipe, 0, parsedLager, disabledItems) || [];
      }
      materials.forEach((mat) => {
        matNeeded[mat.id] = (matNeeded[mat.id] || 0) + quantity;
      });
      const effectiveRank =
        recipe.rank === "Custom" ? recipe.customRank : recipe.rank;
      const potionId = {
        Basic: 645,
        Intermediate: 656,
        Advanced: 657,
      }[effectiveRank];
      if (potionId)
        matNeeded[potionId] = (matNeeded[potionId] || 0) + 2 * quantity;
    });
    return matNeeded;
  }, [cart, customRecipes, parsedLager, disabledItems]);
  const getLagerAmount = (id) => parsedLager[id] || 0;
  const switchToCustomMode = () => {
    setIsCustomMode(true);
    setSelectedRecipe(null);
    setActiveCustomRecipeId(null);
    setCauldron([null, null, null, null]);
    setCustomSlotTypes([null, null, null, null]);
    setErrorMsg("");
    setSwapSlotIndex(null);
    setSwapElementFilter(null);
    setSwapQualityFilter(null);
    setCartOpen(false);
  };
  const handleAddToCart = (recipe, e) => {
    e.stopPropagation();
    const currentMaterials =
      selectedRecipe && selectedRecipe.id === recipe.id
        ? cauldron.map((m) => m?.id ?? null)
        : null;
    setCart((prev) => {
      const existing = prev.find((item) => item.recipeId === recipe.id);
      if (existing) {
        return prev.map((item) =>
          item.recipeId === recipe.id
            ? {
              ...item,
              quantity: item.quantity + 1,
            }
            : item,
        );
      }
      return [
        ...prev,
        {
          recipeId: recipe.id,
          quantity: 1,
          savedMaterials: currentMaterials,
        },
      ];
    });
  };
  const confirmProduction = () => {
    if (Object.keys(cartTotal).length === 0) return;
    const newMap = {
      ...parsedLager,
    };
    Object.entries(cartTotal).forEach(([idStr, needed]) => {
      const id = parseInt(idStr);
      newMap[id] = Math.max(0, (newMap[id] || 0) - needed);
      if (newMap[id] === 0) delete newMap[id];
    });
    setParsedLager(newMap);
    try {
      localStorage.setItem("alchemyLagerData", JSON.stringify(newMap));
    } catch { }
    setCart([]);
  };

  // Wenn der Kessel sich ï¿½ndert und das aktive Rezept im Korb ist, savedMaterials aktualisieren
  useEffect(() => {
    if (!selectedRecipe) return;
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.recipeId === selectedRecipe.id);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        savedMaterials: cauldron.map((m) => m?.id ?? null),
      };
      return updated;
    });
  }, [cauldron, selectedRecipe]);
  const findMatchingRecipe = (currentDominantElement) => {
    const ingTypes = customSlotTypes.map((t) => t || null);
    // CATALYSTS[0].name === 'none', RECIPES store catalyst as 'none'
    const catName = catalyst.name; // always the raw data value
    const el =
      currentDominantElement && currentDominantElement !== "None"
        ? currentDominantElement
        : null;
    return (
      RECIPES.find(
        (r) =>
          (el === null || r.element === el) &&
          r.catalyst === catName &&
          r.ingredients.length === 4 &&
          r.ingredients.every((ing, i) => ing === ingTypes[i]),
      ) || null
    );
  };
  const handleSaveCustomRecipe = () => {
    const name = saveRecipeName.trim();
    if (!name) return;
    const matched = findMatchingRecipe(dominantElement);
    const recipeData = {
      product: name,
      rank: "Custom",
      type: matched ? matched.type : customSlotTypes[0] || "Custom",
      minQuality: matched ? matched.minQuality : 0,
      ingredients: [...customSlotTypes],
      catalyst: catalyst.name,
      element: dominantElement || "None",
      savedMaterials: cauldron.map((m) => m?.id ?? null),
      savedAgentId: selectedAgent?.id ?? null,
      customRank,
      matchedRecipeId: matched?.id ?? null,
    };
    let updated;
    if (activeCustomRecipeId) {
      // Vorhandenes Rezept ï¿½berschreiben
      updated = customRecipes.map((r) =>
        r.id === activeCustomRecipeId
          ? {
            ...r,
            ...recipeData,
          }
          : r,
      );
    } else {
      // Neues Rezept anlegen
      const newId = "custom_" + Date.now();
      updated = [
        ...customRecipes,
        {
          id: newId,
          ...recipeData,
        },
      ];
      // Nicht auf das neue Rezept wechseln – stattdessen sofort für das nächste Rezept zurücksetzen
    }
    setCustomRecipes(updated);
    writeCustomRecipes(updated);
    setSaveModalOpen(false);
    setSaveRecipeName("");
    const wasNew = !activeCustomRecipeId;
    if (wasNew) {
      // War ein neues Rezept → Felder leeren für das nächste
      setActiveCustomRecipeId(null);
      setCauldron([null, null, null, null]);
      setCustomSlotTypes([null, null, null, null]);
      setCustomRank("Basic");
      setCatalyst(window.CATALYSTS[0]);
      setSelectedAgent(null);
      setErrorMsg("");
      setSwapSlotIndex(null);
      setSwapElementFilter(null);
      setSwapQualityFilter(null);
      // Kurzen Erfolgs-Toast anzeigen
      setSaveSuccessToast(recipeData.product);
      clearTimeout(saveSuccessToastTimer.current);
      saveSuccessToastTimer.current = setTimeout(
        () => setSaveSuccessToast(null),
        2500,
      );
    }
  };
  const handleEditCustomRecipe = (recipe, e) => {
    e.stopPropagation();
    setIsCustomMode(true);
    setSelectedRecipe(null);
    setActiveCustomRecipeId(recipe.id);
    setCustomSlotTypes(recipe.ingredients.map((i) => i || null));
    setCustomRank(recipe.customRank || "Basic");
    const restoredCauldron = (
      recipe.savedMaterials || [null, null, null, null]
    ).map((id) =>
      id != null ? MATERIALS.find((m) => m.id === id) || null : null,
    );
    setCauldron(restoredCauldron);
    const neededCatalyst =
      CATALYSTS.find((c) => c.name === recipe.catalyst) || CATALYSTS[0];
    setCatalyst(neededCatalyst);
    const restoredAgent =
      recipe.savedAgentId != null
        ? AGENTS.find((a) => a.id === recipe.savedAgentId) || null
        : null;
    setSelectedAgent(restoredAgent);
  };
  const handleCopyAsTemplate = (recipe, e) => {
    e.stopPropagation();
    setIsCustomMode(true);
    setSelectedRecipe(null);
    setActiveCustomRecipeId(null);
    setCustomSlotTypes(recipe.ingredients.map((i) => i || null));
    setCustomRank(
      recipe.rank === "Custom" ? recipe.customRank || "Basic" : recipe.rank,
    );
    const dominantEl = (m) => {
      const max = Math.max(m.fire, m.earth, m.air, m.water);
      return m.fire === max
        ? "Fire"
        : m.earth === max
          ? "Earth"
          : m.air === max
            ? "Air"
            : "Water";
    };
    const filledCauldron = recipe.ingredients.map((ingType) =>
      ingType
        ? MATERIALS.find(
          (m) => m.type === ingType && dominantEl(m) === recipe.element,
        ) || null
        : null,
    );
    setCauldron(filledCauldron);
    const neededCatalyst =
      CATALYSTS.find((c) => c.name === recipe.catalyst) || CATALYSTS[0];
    setCatalyst(neededCatalyst);
    setSelectedAgent(null);
    setSwapSlotIndex(null);
    setSwapElementFilter(null);
    setSwapQualityFilter(null);
    setCartOpen(false);
    setErrorMsg("");
  };
  const handleDeleteCustomRecipe = (id, e) => {
    e.stopPropagation();
    const updated = customRecipes.filter((r) => r.id !== id);
    setCustomRecipes(updated);
    writeCustomRecipes(updated);
  };
  const handleToggleFavorite = (recipeId, e) => {
    e.stopPropagation();
    const updated = new Set(favorites);
    if (updated.has(recipeId)) {
      updated.delete(recipeId);
    } else {
      updated.add(recipeId);
    }
    setFavorites(updated);
    writeFavorites(updated);
  };
  const displayedRecipes = useMemo(() => {
    const sortByFav = (list) => {
      const favs = list.filter((r) => favorites.has(r.id));
      const rest = list.filter((r) => !favorites.has(r.id));
      return [...favs, ...rest];
    };
    if (searchQuery.trim() !== "") {
      return sortByFav(
        [...RECIPES, ...customRecipes].filter(
          (r) =>
            r.product.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (r.element &&
              r.element.toLowerCase().includes(searchQuery.toLowerCase())) ||
            r.type.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
      );
    }
    if (filterRank === "Custom") return sortByFav(customRecipes);
    if (filterRank === "All") return sortByFav([...RECIPES, ...customRecipes]);
    return sortByFav([
      ...RECIPES.filter((r) => r.rank === filterRank),
      ...customRecipes.filter((r) => r.customRank === filterRank),
    ]);
  }, [searchQuery, filterRank, customRecipes, favorites]);
  const handleSelectRecipe = (recipe) => {
    setErrorMsg("");
    setSwapSlotIndex(null);
    setSwapElementFilter(null);
    setSwapQualityFilter(null);
    if (recipe.rank === "Custom") {
      setIsCustomMode(false);
      setSelectedRecipe(recipe);
      setCustomSlotTypes(recipe.ingredients.map((i) => i || null));
      setCustomRank(recipe.customRank || "Basic");
      setActiveCustomRecipeId(recipe.id);
      const restoredCauldron = (
        recipe.savedMaterials || [null, null, null, null]
      ).map((id) =>
        id != null ? MATERIALS.find((m) => m.id === id) || null : null,
      );
      setCauldron(restoredCauldron);
      const neededCatalyst =
        CATALYSTS.find((c) => c.name === recipe.catalyst) || CATALYSTS[0];
      setCatalyst(neededCatalyst);
      const restoredAgent =
        recipe.savedAgentId != null
          ? AGENTS.find((a) => a.id === recipe.savedAgentId) || null
          : null;
      setSelectedAgent(restoredAgent);
      return;
    }
    setIsCustomMode(false);

    // Wenn das Rezept im Korb ist und eine gespeicherte Rezeptur hat, diese laden
    const cartEntry = cart.find((i) => i.recipeId === recipe.id);
    if (
      cartEntry?.savedMaterials &&
      cartEntry.savedMaterials.some((id) => id != null)
    ) {
      const restoredCauldron = cartEntry.savedMaterials.map((id) =>
        id != null ? MATERIALS.find((m) => m.id === id) || null : null,
      );
      setCauldron(restoredCauldron);
      const neededCatalyst =
        CATALYSTS.find((c) => c.name === recipe.catalyst) || CATALYSTS[0];
      setCatalyst(neededCatalyst);
      setSelectedRecipe(recipe);
      return;
    }
    let bestCombo = findBestIngredients(
      recipe,
      0,
      parsedLager,
      disabledItems,
      ignoreEmptyItems,
    );
    let autoAgent = null;
    if (!bestCombo) {
      const { combo: fb, agent: fbAgent } = findBestIngredientsWithFallback(
        recipe,
        parsedLager,
        disabledItems,
        ignoreEmptyItems,
      );
      bestCombo = fb;
      autoAgent = fbAgent;
    }
    if (bestCombo) {
      setCauldron(bestCombo);
      const neededCatalyst =
        CATALYSTS.find((c) => c.name === recipe.catalyst) || CATALYSTS[0];
      setCatalyst(neededCatalyst);
      setSelectedRecipe(recipe);
      if (autoAgent) setSelectedAgent(autoAgent);
    } else {
      setCauldron([null, null, null, null]);
      setSelectedRecipe(null);
      setErrorMsg(
        t("noComboError")
          .replace("{product}", recipe.product)
          .replace("{element}", recipe.element)
          .replace("{minQuality}", recipe.minQuality),
      );
    }
  };
  const clearCauldron = () => {
    setCauldron([null, null, null, null]);
    setSelectedRecipe(null);
    setErrorMsg("");
    setSwapSlotIndex(null);
    setSwapElementFilter(null);
    setSwapQualityFilter(null);
  };
  const handleSwapIngredient = (materialItem) => {
    if (swapSlotIndex !== null) {
      setCauldron((prev) => {
        const newCauldron = [...prev];
        newCauldron[swapSlotIndex] = materialItem;
        return newCauldron;
      });
      setSwapSlotIndex(null);
      setSwapElementFilter(null);
      setSwapQualityFilter(null);
    }
  };
  const stats = useMemo(() => {
    let fire = 0,
      earth = 0,
      air = 0,
      water = 0;
    let qualitySum = 0;
    let weightSum = 0;
    let count = 0;
    cauldron.forEach((item, idx) => {
      if (item) {
        let weight = idx === 0 ? 2 : 1;
        fire += item.fire * weight;
        earth += item.earth * weight;
        air += item.air * weight;
        water += item.water * weight;
        qualitySum += item.quality * weight;
        weightSum += weight;
        count++;
      }
    });
    const calculatedQuality =
      weightSum > 0 ? Math.floor(qualitySum / weightSum) : 0;
    const agentFire = selectedAgent ? selectedAgent.fire : 0;
    const agentEarth = selectedAgent ? selectedAgent.earth : 0;
    const agentAir = selectedAgent ? selectedAgent.air : 0;
    const agentWater = selectedAgent ? selectedAgent.water : 0;
    const agentQuality = selectedAgent ? selectedAgent.quality : 0;
    return {
      fire: fire + agentFire,
      earth: earth + agentEarth,
      air: air + agentAir,
      water: water + agentWater,
      quality: calculatedQuality + agentQuality,
      count,
    };
  }, [cauldron, selectedAgent]);
  const dominantElement = useMemo(() => {
    if (stats.count === 0) return "None";
    const maxVal = Math.max(stats.fire, stats.earth, stats.air, stats.water);
    if (maxVal === 0) return "None";
    let domCount = 0;
    let dom = "None";
    if (stats.fire === maxVal) {
      domCount++;
      dom = "Fire";
    }
    if (stats.earth === maxVal) {
      domCount++;
      dom = "Earth";
    }
    if (stats.air === maxVal) {
      domCount++;
      dom = "Air";
    }
    if (stats.water === maxVal) {
      domCount++;
      dom = "Water";
    }
    if (domCount > 1) return "Tie";
    return dom;
  }, [stats]);
  const isRecipeValid = useMemo(() => {
    if (!selectedRecipe || stats.count < 4) return false;
    const isCorrectElement = dominantElement === selectedRecipe.element;
    const isSufficientQuality = stats.quality >= selectedRecipe.minQuality;
    return isCorrectElement && isSufficientQuality;
  }, [selectedRecipe, dominantElement, stats]);
  const customMatchedRecipe = useMemo(() => {
    if (!isCustomMode || stats.count < 4) return null;
    return findMatchingRecipe(dominantElement);
  }, [isCustomMode, dominantElement, customSlotTypes, catalyst, stats.count]);
  const effectiveRecipe =
    selectedRecipe || (isCustomMode ? customMatchedRecipe : null);
  const isEffectiveRecipeValid = useMemo(() => {
    if (!effectiveRecipe || stats.count < 4) return false;
    const isCorrectElement = dominantElement === effectiveRecipe.element;
    const isSufficientQuality = stats.quality >= effectiveRecipe.minQuality;
    const elKey = effectiveRecipe.element.toLowerCase();
    const isSufficientScore =
      !(effectiveRecipe.minScore > 0) ||
      stats[elKey] >= effectiveRecipe.minScore;
    return isCorrectElement && isSufficientQuality && isSufficientScore;
  }, [effectiveRecipe, dominantElement, stats]);
  const lagerWarnings = useMemo(() => {
    const missing = [];
    const low = [];
    if (Object.keys(parsedLager).length === 0)
      return {
        missing,
        low,
      };
    cauldron.forEach((slot, slotIdx) => {
      if (!slot) return;
      const amt = parsedLager[slot.id] || 0;
      if (amt === 0) {
        // Suche Alternative: gleicher Typ, im Lager vorhanden
        const alternative =
          MATERIALS.filter(
            (m) =>
              m.type === slot.type &&
              m.id !== slot.id &&
              (parsedLager[m.id] || 0) > 0,
          ).sort(
            (a, b) => (parsedLager[b.id] || 0) - (parsedLager[a.id] || 0),
          )[0] || null;
        missing.push({
          material: slot,
          slotIdx,
          alternative,
        });
      } else if (amt < lowStockThreshold) {
        low.push({
          material: slot,
          amount: amt,
          slotIdx,
        });
      }
    });
    return {
      missing,
      low,
    };
  }, [cauldron, parsedLager, lowStockThreshold]);
  const ocrCurrentMatch = ocrAmbiguous
    ? ocrAmbiguous.list[ocrAmbiguous.idx]
    : null;
  const ocrAdvance = (selectedRecipeId) => {
    if (!ocrAmbiguous) return;
    const newResolved =
      selectedRecipeId != null
        ? {
          ...ocrAmbiguous.resolvedIds,
          [ocrAmbiguous.idx]: selectedRecipeId,
        }
        : {
          ...ocrAmbiguous.resolvedIds,
        };
    let next = ocrAmbiguous.idx + 1;
    while (
      next < ocrAmbiguous.list.length &&
      ocrAmbiguous.list[next].type !== "ambiguous"
    )
      next++;
    if (next >= ocrAmbiguous.list.length) {
      // Build ordered list synchronously BEFORE any setState call
      const list = ocrAmbiguous.list;
      const toAdd = [];
      const seenIds = new Set();
      list.forEach((item, idx) => {
        const rid =
          newResolved[idx] ?? (item.type === "exact" ? item.recipeId : null);
        if (rid != null && !seenIds.has(rid)) {
          seenIds.add(rid);
          toAdd.push({
            recipeId: rid,
            savedMaterials: null,
          });
        }
      });
      console.log(
        "[OCR final order]",
        toAdd.map((x) => x.recipeId),
      );
      setOcrAmbiguous(null);
      setSessionRecipes((prev) => {
        const existingIds = new Set(prev.map((r) => r.recipeId));
        return [...prev, ...toAdd.filter((x) => !existingIds.has(x.recipeId))];
      });
    } else {
      setOcrAmbiguous({
        ...ocrAmbiguous,
        idx: next,
        resolvedIds: newResolved,
      });
    }
  };
  const getElementColor = (element) => {
    switch (element) {
      case "Fire":
        return "text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 border-red-500 dark:border-red-700/50";
      case "Earth":
        return "text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 border-green-600 dark:border-green-700/50";
      case "Air":
        return "text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 border-yellow-500 dark:border-yellow-700/50";
      case "Water":
        return "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 border-blue-500 dark:border-blue-700/50";
      default:
        return "text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border-gray-400 dark:border-gray-600";
    }
  };
  const getElementIcon = (element, className = "text-xl") => {
    switch (element) {
      case "Fire":
        return /*#__PURE__*/ React.createElement("i", {
          className: `fa-solid fa-fire ${className} text-red-500`,
        });
      case "Earth":
        return /*#__PURE__*/ React.createElement("i", {
          className: `fa-solid fa-mountain ${className} text-green-600`,
        });
      case "Air":
        return /*#__PURE__*/ React.createElement("i", {
          className: `fa-solid fa-wind ${className} text-yellow-500`,
        });
      case "Water":
        return /*#__PURE__*/ React.createElement("i", {
          className: `fa-solid fa-droplet ${className} text-blue-500`,
        });
      default:
        return null;
    }
  };
  return /*#__PURE__*/ React.createElement(
    "div",
    {
      className: isDarkMode ? "dark" : "",
    },
    /*#__PURE__*/ React.createElement(
      "div",
      {
        className:
          "h-screen overflow-hidden bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans p-4 md:p-8 relative transition-colors duration-300 flex flex-col",
      },
      saveModalOpen &&
      (() => {
        const matchedRecipe = findMatchingRecipe(dominantElement);
        return /*#__PURE__*/ React.createElement(
          "div",
          {
            className:
              "fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4",
          },
            /*#__PURE__*/ React.createElement(
            "div",
            {
              className:
                "bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col border border-slate-200 dark:border-slate-700 transition-colors",
            },
              /*#__PURE__*/ React.createElement(
              "div",
              {
                className:
                  "p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50",
              },
                /*#__PURE__*/ React.createElement(
                "h3",
                {
                  className:
                    "text-xl font-bold text-slate-800 dark:text-slate-100",
                },
                t("saveRecipe"),
              ),
                /*#__PURE__*/ React.createElement(
                "button",
                {
                  onClick: () => {
                    setSaveModalOpen(false);
                    setSaveRecipeName("");
                  },
                  className:
                    "p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 dark:text-slate-400",
                },
                  /*#__PURE__*/ React.createElement("i", {
                  className: "fa-solid fa-xmark text-xl",
                }),
              ),
            ),
              /*#__PURE__*/ React.createElement(
              "div",
              {
                className: "p-5 flex flex-col gap-4",
              },
                /*#__PURE__*/ React.createElement(
                "label",
                {
                  className:
                    "text-sm font-bold text-slate-600 dark:text-slate-300",
                },
                t("recipeName"),
              ),
                /*#__PURE__*/ React.createElement("input", {
                type: "text",
                autoFocus: true,
                value: saveRecipeName,
                onChange: (e) => setSaveRecipeName(e.target.value),
                onKeyDown: (e) =>
                  e.key === "Enter" && handleSaveCustomRecipe(),
                placeholder: "z.B. Mein Feuer-Mix...",
                className:
                  "w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-200 transition-colors",
              }),
                /*#__PURE__*/ React.createElement(
                "button",
                {
                  onClick: handleSaveCustomRecipe,
                  disabled: !saveRecipeName.trim(),
                  className:
                    "w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white font-bold rounded-xl transition-all",
                },
                  /*#__PURE__*/ React.createElement("i", {
                  className: "fa-solid fa-floppy-disk mr-2",
                }),
                t("saveBtn"),
              ),
            ),
          ),
        );
      })(),
      typePickerSlot !== null &&
        /*#__PURE__*/ React.createElement(
        "div",
        {
          className:
            "fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4",
        },
          /*#__PURE__*/ React.createElement(
          "div",
          {
            className:
              "bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[80vh] overflow-hidden border border-slate-200 dark:border-slate-700 transition-colors",
          },
            /*#__PURE__*/ React.createElement(
            "div",
            {
              className:
                "p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50",
            },
              /*#__PURE__*/ React.createElement(
              "h3",
              {
                className:
                  "text-xl font-bold text-slate-800 dark:text-slate-100",
              },
              t("typePicker"),
            ),
              /*#__PURE__*/ React.createElement(
              "button",
              {
                onClick: () => setTypePickerSlot(null),
                className:
                  "p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 dark:text-slate-400",
              },
                /*#__PURE__*/ React.createElement("i", {
                className: "fa-solid fa-xmark text-2xl",
              }),
            ),
          ),
            /*#__PURE__*/ React.createElement(
            "div",
            {
              className: "p-4 overflow-y-auto custom-scrollbar flex-1",
            },
              /*#__PURE__*/ React.createElement(
              "div",
              {
                className: "flex flex-col gap-2",
              },
                /*#__PURE__*/ React.createElement(
                "button",
                {
                  onClick: () => {
                    const t = [...customSlotTypes];
                    t[typePickerSlot] = null;
                    setCustomSlotTypes(t);
                    setCauldron((prev) => {
                      const c = [...prev];
                      c[typePickerSlot] = null;
                      return c;
                    });
                    setTypePickerSlot(null);
                  },
                  className: `p-3 border rounded-xl text-sm font-semibold text-left transition-all ${customSlotTypes[typePickerSlot] === null ? "bg-slate-200 dark:bg-slate-600 border-slate-400" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-400"}`,
                },
                t("noType"),
              ),
              [...new Set(MATERIALS.map((m) => m.type))]
                .sort()
                .map((type) => {
                  const isActive = customSlotTypes[typePickerSlot] === type;
                  return /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      key: type,
                      onClick: () => {
                        const t = [...customSlotTypes];
                        t[typePickerSlot] = type;
                        setCustomSlotTypes(t);
                        setCauldron((prev) => {
                          const c = [...prev];
                          c[typePickerSlot] = null;
                          return c;
                        });
                        setTypePickerSlot(null);
                      },
                      className: `flex items-center gap-3 p-3 border rounded-xl text-sm font-semibold text-left transition-all hover:shadow-sm ${isActive ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500 text-slate-700 dark:text-slate-200"}`,
                    },
                    TYPE_ICONS[type]
                      ? /*#__PURE__*/ React.createElement(ItemIcon, {
                        id: TYPE_ICONS[type],
                        name: type,
                        size: "w-6 h-6",
                      })
                      : /*#__PURE__*/ React.createElement("i", {
                        className: "fa-solid fa-flask text-base opacity-50",
                      }),
                      /*#__PURE__*/ React.createElement(
                        "span",
                        {
                          className: "flex-1",
                        },
                        type,
                      ),
                    isActive &&
                        /*#__PURE__*/ React.createElement("i", {
                      className:
                        "fa-regular fa-circle-check text-indigo-500",
                    }),
                  );
                }),
            ),
          ),
        ),
      ),
      agentModalOpen &&
        /*#__PURE__*/ React.createElement(
        "div",
        {
          className:
            "fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4",
        },
          /*#__PURE__*/ React.createElement(
          "div",
          {
            className:
              "bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden border border-slate-200 dark:border-slate-700 transition-colors",
          },
            /*#__PURE__*/ React.createElement(
            "div",
            {
              className:
                "p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50",
            },
              /*#__PURE__*/ React.createElement(
              "div",
              null,
                /*#__PURE__*/ React.createElement(
                "h3",
                {
                  className:
                    "text-xl font-bold text-slate-800 dark:text-slate-100",
                },
                t("agentModal"),
              ),
                /*#__PURE__*/ React.createElement(
                "p",
                {
                  className:
                    "text-sm text-slate-500 dark:text-slate-400 mt-1",
                },
                t("agentModalDesc"),
              ),
            ),
              /*#__PURE__*/ React.createElement(
              "button",
              {
                onClick: () => setAgentModalOpen(false),
                className:
                  "p-2 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200",
              },
                /*#__PURE__*/ React.createElement("i", {
                className: "fa-solid fa-xmark text-2xl",
              }),
            ),
          ),
            /*#__PURE__*/ React.createElement(
            "div",
            {
              className:
                "p-4 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-900 flex-1",
            },
              /*#__PURE__*/ React.createElement(
              "div",
              {
                className: "flex flex-col gap-2",
              },
                /*#__PURE__*/ React.createElement(
                "button",
                {
                  onClick: () => {
                    setSelectedAgent(null);
                    setAgentModalOpen(false);
                  },
                  className: `flex items-center gap-4 p-4 border rounded-xl transition-all text-left hover:shadow-md ${selectedAgent === null ? "bg-slate-200 dark:bg-slate-600 border-slate-400 dark:border-slate-500" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-400"}`,
                },
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "w-10 h-10 rounded-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center",
                  },
                    /*#__PURE__*/ React.createElement("i", {
                    className:
                      "fa-solid fa-ban text-slate-500 dark:text-slate-400 text-lg",
                  }),
                ),
                  /*#__PURE__*/ React.createElement(
                  "span",
                  {
                    className: "font-bold text-slate-700 dark:text-slate-200",
                  },
                  t("noAgent"),
                ),
              ),
              ["Fire", "Earth", "Air", "Water"].map((element) => {
                const elCfg = {
                  Fire: {
                    label: "Feuer",
                    icon: "fa-fire",
                    headerCls: "text-red-500",
                    activeCls:
                      "bg-red-100 dark:bg-red-900/30 border-red-400 dark:border-red-600",
                    hoverCls:
                      "hover:border-red-300 dark:hover:border-red-700",
                  },
                  Earth: {
                    label: "Erde",
                    icon: "fa-mountain",
                    headerCls: "text-green-600",
                    activeCls:
                      "bg-green-100 dark:bg-green-900/30 border-green-500 dark:border-green-600",
                    hoverCls:
                      "hover:border-green-300 dark:hover:border-green-700",
                  },
                  Air: {
                    label: "Luft",
                    icon: "fa-wind",
                    headerCls: "text-yellow-500",
                    activeCls:
                      "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-400 dark:border-yellow-600",
                    hoverCls:
                      "hover:border-yellow-300 dark:hover:border-yellow-700",
                  },
                  Water: {
                    label: "Wasser",
                    icon: "fa-droplet",
                    headerCls: "text-blue-500",
                    activeCls:
                      "bg-blue-100 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600",
                    hoverCls:
                      "hover:border-blue-300 dark:hover:border-blue-700",
                  },
                }[element];
                const groupAgents = AGENTS.filter(
                  (a) => a.element === element,
                );
                return /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    key: element,
                  },
                    /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className: `flex items-center gap-2 text-xs font-bold uppercase tracking-wider mt-3 mb-1 ${elCfg.headerCls}`,
                    },
                      /*#__PURE__*/ React.createElement("i", {
                      className: `fa-solid ${elCfg.icon}`,
                    }),
                    " ",
                    elCfg.label,
                  ),
                  groupAgents.map((agent) => {
                    const isActive =
                      selectedAgent && selectedAgent.id === agent.id;
                    const statKey = agent.element.toLowerCase();
                    const bonus = agent[statKey];
                    return /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        key: agent.id,
                        onClick: () => {
                          setSelectedAgent(isActive ? null : agent);
                          setAgentModalOpen(false);
                        },
                        className: `w-full flex items-center justify-between p-4 border rounded-xl transition-all text-left hover:shadow-md gap-4 group
                                                                        ${isActive ? `${elCfg.activeCls}` : `bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 ${elCfg.hoverCls}`}`,
                      },
                        /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className: "flex items-center gap-4",
                        },
                          /*#__PURE__*/ React.createElement(ItemIcon, {
                          id: agent.id,
                          name: agent.name,
                          size: "w-10 h-10",
                        }),
                          /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            className: "flex flex-col gap-1",
                          },
                            /*#__PURE__*/ React.createElement(
                            "span",
                            {
                              className:
                                "font-bold text-slate-800 dark:text-slate-200 text-base",
                            },
                            agent.name,
                          ),
                          agent.quality > 0 &&
                              /*#__PURE__*/ React.createElement(
                            "span",
                            {
                              className:
                                "text-xs text-indigo-500 dark:text-indigo-400 font-semibold",
                            },
                            "+",
                            agent.quality,
                            " ",
                            t("qualitySuffix"),
                          ),
                        ),
                      ),
                        /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className: "flex gap-2",
                        },
                          /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            className: `flex items-center gap-1.5 px-3 py-1.5 rounded-lg border min-w-[64px] justify-center text-sm font-bold
                                                                            ${agent.fire > 0 ? "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-100 dark:border-red-800/50" : "bg-slate-50 dark:bg-slate-900 text-slate-300 dark:text-slate-600 border-slate-100 dark:border-slate-800"}`,
                          },
                            /*#__PURE__*/ React.createElement("i", {
                            className: "fa-solid fa-fire text-base",
                          }),
                          " ",
                          agent.fire,
                        ),
                          /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            className: `flex items-center gap-1.5 px-3 py-1.5 rounded-lg border min-w-[64px] justify-center text-sm font-bold
                                                                            ${agent.earth > 0 ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-100 dark:border-green-800/50" : "bg-slate-50 dark:bg-slate-900 text-slate-300 dark:text-slate-600 border-slate-100 dark:border-slate-800"}`,
                          },
                            /*#__PURE__*/ React.createElement("i", {
                            className: "fa-solid fa-mountain text-base",
                          }),
                          " ",
                          agent.earth,
                        ),
                          /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            className: `flex items-center gap-1.5 px-3 py-1.5 rounded-lg border min-w-[64px] justify-center text-sm font-bold
                                                                            ${agent.air > 0 ? "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-100 dark:border-yellow-800/50" : "bg-slate-50 dark:bg-slate-900 text-slate-300 dark:text-slate-600 border-slate-100 dark:border-slate-800"}`,
                          },
                            /*#__PURE__*/ React.createElement("i", {
                            className: "fa-solid fa-wind text-base",
                          }),
                          " ",
                          agent.air,
                        ),
                          /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            className: `flex items-center gap-1.5 px-3 py-1.5 rounded-lg border min-w-[64px] justify-center text-sm font-bold
                                                                            ${agent.water > 0 ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-800/50" : "bg-slate-50 dark:bg-slate-900 text-slate-300 dark:text-slate-600 border-slate-100 dark:border-slate-800"}`,
                          },
                            /*#__PURE__*/ React.createElement("i", {
                            className: "fa-solid fa-droplet text-base",
                          }),
                          " ",
                          agent.water,
                        ),
                      ),
                    );
                  }),
                );
              }),
            ),
          ),
        ),
      ),
      catalystModalOpen &&
        /*#__PURE__*/ React.createElement(
        "div",
        {
          className:
            "fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4",
        },
          /*#__PURE__*/ React.createElement(
          "div",
          {
            className:
              "bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh] overflow-hidden border border-slate-200 dark:border-slate-700 transition-colors",
          },
            /*#__PURE__*/ React.createElement(
            "div",
            {
              className:
                "p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50",
            },
              /*#__PURE__*/ React.createElement(
              "div",
              null,
                /*#__PURE__*/ React.createElement(
                "h3",
                {
                  className:
                    "text-xl font-bold text-slate-800 dark:text-slate-100",
                },
                t("catalystModalTitle"),
              ),
                /*#__PURE__*/ React.createElement(
                "p",
                {
                  className:
                    "text-sm text-slate-500 dark:text-slate-400 mt-1",
                },
                t("catalystModalDesc"),
              ),
            ),
              /*#__PURE__*/ React.createElement(
              "button",
              {
                onClick: () => setCatalystModalOpen(false),
                className:
                  "p-2 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200",
              },
                /*#__PURE__*/ React.createElement("i", {
                className: "fa-solid fa-xmark text-2xl",
              }),
            ),
          ),
            /*#__PURE__*/ React.createElement(
            "div",
            {
              className:
                "p-4 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-900 flex-1",
            },
              /*#__PURE__*/ React.createElement(
              "div",
              {
                className: "flex flex-col gap-2",
              },
              CATALYSTS.map((cat) => {
                const isActive = catalyst.id === cat.id;
                return /*#__PURE__*/ React.createElement(
                  "button",
                  {
                    key: cat.id,
                    onClick: () => {
                      setCatalyst(cat);
                      setCatalystModalOpen(false);
                    },
                    className: `flex items-center gap-4 p-4 border rounded-xl transition-all text-left hover:shadow-md
                                                            ${isActive ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-600" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600"}`,
                  },
                  cat.id === "none"
                    ? /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className:
                          "w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0",
                      },
                          /*#__PURE__*/ React.createElement("i", {
                        className:
                          "fa-solid fa-ban text-slate-400 dark:text-slate-500 text-lg",
                      }),
                    )
                    : /*#__PURE__*/ React.createElement(ItemIcon, {
                      id: cat.id,
                      name: cat.name,
                      size: "w-10 h-10 flex-shrink-0",
                    }),
                    /*#__PURE__*/ React.createElement(
                      "span",
                      {
                        className: `font-bold text-base ${isActive ? "text-indigo-700 dark:text-indigo-300" : "text-slate-800 dark:text-slate-200"}`,
                      },
                      cat.id === "none" ? t("noneLabel") : cat.name,
                    ),
                  isActive &&
                      /*#__PURE__*/ React.createElement("i", {
                    className:
                      "fa-solid fa-circle-check text-indigo-500 dark:text-indigo-400 ml-auto text-xl",
                  }),
                );
              }),
            ),
          ),
        ),
      ),
      swapSlotIndex !== null &&
      (selectedRecipe || isCustomMode) &&
        /*#__PURE__*/ React.createElement(
        "div",
        {
          className:
            "fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4",
        },
          /*#__PURE__*/ React.createElement(
          "div",
          {
            className:
              "bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col h-[75vh] overflow-hidden border border-slate-200 dark:border-slate-700 transition-colors",
          },
            /*#__PURE__*/ React.createElement(
            "div",
            {
              className:
                "p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50",
            },
              /*#__PURE__*/ React.createElement(
              "div",
              null,
                /*#__PURE__*/ React.createElement(
                "h3",
                {
                  className:
                    "text-xl font-bold text-slate-800 dark:text-slate-100",
                },
                isCustomMode ? t("ingredientModal") : t("ingredientModalAlt"),
              ),
                /*#__PURE__*/ React.createElement(
                "p",
                {
                  className:
                    "text-sm text-slate-500 dark:text-slate-400 mt-1",
                },
                isCustomMode
                  ? t("ingredientFree")
                  : /*#__PURE__*/ React.createElement(
                    React.Fragment,
                    null,
                    t("ingredientRequired"),
                    " ",
                        /*#__PURE__*/ React.createElement(
                      "span",
                      {
                        className:
                          "font-bold text-indigo-600 dark:text-indigo-400 uppercase",
                      },
                      "[",
                      selectedRecipe.ingredients[swapSlotIndex],
                      "]",
                    ),
                  ),
              ),
            ),
              /*#__PURE__*/ React.createElement(
              "button",
              {
                onClick: () => {
                  setSwapSlotIndex(null);
                  setSwapElementFilter(null);
                  setSwapQualityFilter(null);
                },
                className:
                  "p-2 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200",
              },
                /*#__PURE__*/ React.createElement("i", {
                className: "fa-solid fa-xmark text-2xl",
              }),
            ),
          ),
            /*#__PURE__*/ React.createElement(
            "div",
            {
              className:
                "p-4 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-900 flex-1",
            },
              /*#__PURE__*/ React.createElement(
              "div",
              {
                className: "flex gap-2 mb-4 flex-wrap items-center",
              },
              [
                {
                  key: null,
                  label: t("all"),
                  icon: null,
                  cls: "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600",
                  activeCls:
                    "bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-800 border-slate-700 dark:border-slate-200",
                },
                {
                  key: "fire",
                  label: t("elemFire"),
                  icon: "fa-fire",
                  cls: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50 hover:border-red-400",
                  activeCls: "bg-red-500 text-white border-red-500",
                },
                {
                  key: "earth",
                  label: t("elemEarth"),
                  icon: "fa-mountain",
                  cls: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/50 hover:border-green-400",
                  activeCls: "bg-green-600 text-white border-green-600",
                },
                {
                  key: "air",
                  label: t("elemAir"),
                  icon: "fa-wind",
                  cls: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/50 hover:border-yellow-400",
                  activeCls: "bg-yellow-400 text-white border-yellow-400",
                },
                {
                  key: "water",
                  label: t("elemWater"),
                  icon: "fa-droplet",
                  cls: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50 hover:border-blue-400",
                  activeCls: "bg-blue-500 text-white border-blue-500",
                },
              ].map((f) => {
                const isActive =
                  f.key === null
                    ? swapElementFilter === null && swapQualityFilter === null
                    : swapElementFilter === f.key;
                return /*#__PURE__*/ React.createElement(
                  "button",
                  {
                    key: String(f.key),
                    onClick: () => {
                      setSwapElementFilter(isActive ? null : f.key);
                      setSwapQualityFilter(null);
                    },
                    className: `flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${isActive ? f.activeCls : f.cls}`,
                  },
                  f.icon &&
                      /*#__PURE__*/ React.createElement("i", {
                    className: `fa-solid ${f.icon} text-xs`,
                  }),
                  f.label,
                );
              }),
                /*#__PURE__*/ React.createElement(
                "div",
                {
                  className: "flex gap-2 items-center flex-shrink-0",
                },
                  /*#__PURE__*/ React.createElement("div", {
                  className: "w-px h-5 bg-slate-300 dark:bg-slate-600",
                }),
                [10, 30, 50, 70, 90].map((q) => {
                  const isActive = swapQualityFilter === q;
                  return /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      key: q,
                      onClick: () => {
                        setSwapQualityFilter(isActive ? null : q);
                        setSwapElementFilter(null);
                      },
                      className: `flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all
                                                                ${isActive ? "bg-slate-600 dark:bg-slate-300 text-white dark:text-slate-800 border-slate-600 dark:border-slate-300" : "bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-500 text-slate-600 dark:text-slate-300 hover:border-slate-400"}`,
                    },
                      /*#__PURE__*/ React.createElement("i", {
                      className:
                        "fa-solid fa-wand-magic-sparkles text-[10px]",
                    }),
                    q,
                  );
                }),
              ),
            ),
              /*#__PURE__*/ React.createElement(
              "div",
              {
                className: "flex flex-col gap-3",
              },
              MATERIALS.filter(
                (m) =>
                  !disabledItems.has(m.id) || swapOriginalItem?.id === m.id,
              )
                .filter((m) =>
                  isCustomMode
                    ? customSlotTypes[swapSlotIndex]
                      ? m.type === customSlotTypes[swapSlotIndex]
                      : true
                    : m.type === selectedRecipe.ingredients[swapSlotIndex],
                )
                .filter((m) => {
                  if (!swapElementFilter) return true;
                  const maxStat = Math.max(m.fire, m.earth, m.air, m.water);
                  return maxStat > 0 && m[swapElementFilter] === maxStat;
                })
                .filter(
                  (m) =>
                    swapQualityFilter === null ||
                    m.quality === swapQualityFilter,
                )
                .sort((a, b) => a.quality - b.quality)
                .map((material) => {
                  const maxStat = Math.max(
                    material.fire,
                    material.earth,
                    material.air,
                    material.water,
                  );
                  const lagerAmt = parsedLager[material.id] || 0;
                  let dynamicBg =
                    "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500";
                  if (maxStat > 0) {
                    if (maxStat === material.fire)
                      dynamicBg =
                        "bg-red-50/80 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 hover:border-red-400 dark:hover:border-red-500";
                    else if (maxStat === material.earth)
                      dynamicBg =
                        "bg-green-50/80 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 hover:border-green-400 dark:hover:border-green-500";
                    else if (maxStat === material.air)
                      dynamicBg =
                        "bg-yellow-50/80 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800/50 hover:border-yellow-400 dark:hover:border-yellow-500";
                    else
                      dynamicBg =
                        "bg-blue-50/80 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 hover:border-blue-400 dark:hover:border-blue-500";
                  }
                  return /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      key: material.id,
                      onClick: () => handleSwapIngredient(material),
                      className: `flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-xl hover:shadow-md transition-all text-left gap-4 group ${dynamicBg}`,
                    },
                      /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className: "flex items-center gap-4",
                      },
                        /*#__PURE__*/ React.createElement(ItemIcon, {
                        id: material.id,
                        name: material.name,
                        size: "w-10 h-10",
                      }),
                        /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className: "flex flex-col",
                        },
                          /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className:
                              "font-bold text-slate-800 dark:text-slate-200 text-lg group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors",
                          },
                          material.name,
                        ),
                        Object.keys(parsedLager).length > 0 &&
                            /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className:
                              "text-xs text-slate-500 dark:text-slate-400 font-mono mt-1",
                          },
                          t("lagerLabel"),
                          " ",
                              /*#__PURE__*/ React.createElement(
                            "span",
                            {
                              className:
                                lagerAmt > 0
                                  ? "font-bold text-green-600 dark:text-green-400"
                                  : "font-bold text-red-500",
                            },
                            lagerAmt,
                          ),
                        ),
                      ),
                    ),
                      /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className: "flex gap-2",
                      },
                        /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className:
                            "flex items-center gap-1.5 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-lg border border-red-100 dark:border-red-800/50 min-w-[70px] justify-center",
                        },
                          /*#__PURE__*/ React.createElement("i", {
                          className: "fa-solid fa-fire text-base",
                        }),
                        " ",
                          /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className: "font-bold text-sm",
                          },
                          material.fire,
                        ),
                      ),
                        /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className:
                            "flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-800/50 min-w-[70px] justify-center",
                        },
                          /*#__PURE__*/ React.createElement("i", {
                          className: "fa-solid fa-droplet text-base",
                        }),
                        " ",
                          /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className: "font-bold text-sm",
                          },
                          material.water,
                        ),
                      ),
                        /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className:
                            "flex items-center gap-1.5 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-3 py-1.5 rounded-lg border border-yellow-100 dark:border-yellow-800/50 min-w-[70px] justify-center",
                        },
                          /*#__PURE__*/ React.createElement("i", {
                          className: "fa-solid fa-wind text-base",
                        }),
                        " ",
                          /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className: "font-bold text-sm",
                          },
                          material.air,
                        ),
                      ),
                        /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className:
                            "flex items-center gap-1.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-1.5 rounded-lg border border-green-100 dark:border-green-800/50 min-w-[70px] justify-center",
                        },
                          /*#__PURE__*/ React.createElement("i", {
                          className: "fa-solid fa-mountain text-base",
                        }),
                        " ",
                          /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className: "font-bold text-sm",
                          },
                          material.earth,
                        ),
                      ),
                        /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className: `flex items-center gap-1.5 px-3 py-1.5 rounded-lg border min-w-[70px] justify-center font-bold text-sm
                                                                    ${material.quality > 0 ? "bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-500 text-indigo-500 dark:text-indigo-400" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600"}`,
                        },
                          /*#__PURE__*/ React.createElement("i", {
                          className:
                            "fa-solid fa-wand-magic-sparkles text-xs",
                        }),
                        " ",
                          /*#__PURE__*/ React.createElement(
                          "span",
                          null,
                          material.quality,
                        ),
                      ),
                    ),
                  );
                }),
            ),
          ),
        ),
      ),
      /*#__PURE__*/ React.createElement(
        "div",
        {
          className: "max-w-7xl mx-auto w-full flex-1 min-h-0 flex flex-col",
        },
        /*#__PURE__*/ React.createElement(
          "header",
          {
            className:
              "relative flex items-center justify-between mb-6 pb-4 border-b-2 border-slate-200 dark:border-slate-700 flex-shrink-0",
          },
          /*#__PURE__*/ React.createElement(
            "div",
            {
              className: "flex items-center gap-3",
            },
            /*#__PURE__*/ React.createElement(
              "div",
              {
                className:
                  "p-3 bg-indigo-600 dark:bg-indigo-500 rounded-xl shadow-lg",
              },
              /*#__PURE__*/ React.createElement("i", {
                className: "fa-solid fa-book text-3xl text-white",
              }),
            ),
            /*#__PURE__*/ React.createElement(
              "div",
              null,
              /*#__PURE__*/ React.createElement(
                "h1",
                {
                  className:
                    "text-3xl font-bold text-slate-800 dark:text-slate-100",
                },
                t("appTitle"),
              ),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            "button",
            {
              onClick: startSession,
              className: `absolute left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 font-bold rounded-xl shadow-sm transition-colors text-sm text-white ${sessionRecipes.length > 0 ? "bg-amber-400 hover:bg-amber-500" : "bg-green-500 hover:bg-green-600"}`,
            },
            /*#__PURE__*/ React.createElement("i", {
              className: `fa-solid ${sessionRecipes.length > 0 ? "fa-rotate-right" : "fa-play"} text-sm`,
            }),
            " ",
            sessionRecipes.length > 0
              ? t("sessionContinue")
              : t("sessionStart"),
          ),
          /*#__PURE__*/ React.createElement(
            "div",
            {
              className: "flex items-center gap-2",
            },
            /*#__PURE__*/ React.createElement(
              "div",
              {
                className:
                  "flex p-0.5 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700",
              },
              /*#__PURE__*/ React.createElement(
                "button",
                {
                  onClick: () => {
                    setLang("de");
                    document.cookie = "lang=de; path=/; max-age=31536000";
                  },
                  className: `px-2.5 py-1.5 text-xs font-black rounded-md transition-all ${lang === "de" ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`,
                },
                "\uD83C\uDDE9\uD83C\uDDEA DEU",
              ),
              /*#__PURE__*/ React.createElement(
                "button",
                {
                  onClick: () => {
                    setLang("en");
                    document.cookie = "lang=en; path=/; max-age=31536000";
                  },
                  className: `px-2.5 py-1.5 text-xs font-black rounded-md transition-all ${lang === "en" ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`,
                },
                "\uD83C\uDDEC\uD83C\uDDE7 ENG",
              ),
            ),
            /*#__PURE__*/ React.createElement(
              "button",
              {
                onClick: () => setSettingsOpen(true),
                className: `p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-500 transition-all w-[54px] flex items-center justify-center relative`,
                title: t("settingsTitle"),
              },
              /*#__PURE__*/ React.createElement("i", {
                className: "fa-solid fa-gear text-xl",
              }),
              disabledItems.size > 0 &&
                /*#__PURE__*/ React.createElement(
                "span",
                {
                  className:
                    "absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center",
                },
                disabledItems.size,
              ),
            ),
            /*#__PURE__*/ React.createElement(
              "button",
              {
                onClick: () => {
                  const next = !isDarkMode;
                  setIsDarkMode(next);
                  document.cookie =
                    "darkMode=" +
                    (next ? "1" : "0") +
                    "; path=/; max-age=31536000";
                },
                className:
                  "p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-500 transition-all w-[54px] flex items-center justify-center",
                title: isDarkMode ? t("lightMode") : t("darkMode2"),
              },
              isDarkMode
                ? /*#__PURE__*/ React.createElement("i", {
                  className: "fa-solid fa-sun text-2xl text-yellow-300",
                })
                : /*#__PURE__*/ React.createElement("i", {
                  className: "fa-solid fa-moon text-2xl",
                }),
            ),
          ),
        ),
        stockAlertOpen &&
        (() => {
          // 1. Alle Rezept-Output-IDs sammeln
          const recipeOutputIds = new Set(
            (window.RECIPES || []).map((r) => r.id),
          );
          // 2. Pool: MATERIALS + AGENTS + CATALYSTS (ohne none) + POTION_BASE, minus Rezept-Outputs
          const pool = [
            ...(window.MATERIALS || []),
            ...(window.AGENTS || []),
            ...(window.CATALYSTS || []).filter((c) => c.id !== "none"),
            ...(window.POTION_BASE || []),
          ].filter((item) => !recipeOutputIds.has(item.id));
          // 3. Vergleich mit parsedLager
          const knapp = [];
          const leer = [];
          pool.forEach((item) => {
            const amount = parsedLager[item.id];
            if (amount === undefined || amount === 0) {
              leer.push({
                id: item.id,
                mat: item,
                amount: amount ?? 0,
              });
            } else if (amount < lowStockThreshold) {
              knapp.push({
                id: item.id,
                mat: item,
                amount,
              });
            }
          });
          knapp.sort((a, b) => a.amount - b.amount);
          leer.sort((a, b) =>
            (a.mat?.name || "").localeCompare(b.mat?.name || ""),
          );
          const rows = [
            ...leer.map((x) => ({
              ...x,
              section: "leer",
            })),
            ...knapp.map((x) => ({
              ...x,
              section: "knapp",
            })),
          ];
          return /*#__PURE__*/ React.createElement(
            "div",
            {
              className:
                "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4",
              onClick: () => setStockAlertOpen(false),
            },
              /*#__PURE__*/ React.createElement(
              "div",
              {
                className:
                  "bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg flex flex-col",
                style: {
                  maxHeight: "80vh",
                },
                onClick: (e) => e.stopPropagation(),
              },
                /*#__PURE__*/ React.createElement(
                "div",
                {
                  className:
                    "flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0",
                },
                  /*#__PURE__*/ React.createElement(
                  "h2",
                  {
                    className:
                      "text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2",
                  },
                    /*#__PURE__*/ React.createElement("i", {
                    className:
                      "fa-solid fa-triangle-exclamation text-amber-500",
                  }),
                  " ",
                  t("stockAlertTitle"),
                ),
                  /*#__PURE__*/ React.createElement(
                  "button",
                  {
                    onClick: () => setStockAlertOpen(false),
                    className:
                      "p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 dark:text-slate-400",
                  },
                    /*#__PURE__*/ React.createElement("i", {
                    className: "fa-solid fa-xmark text-xl",
                  }),
                ),
              ),
                /*#__PURE__*/ React.createElement(
                "div",
                {
                  className: "overflow-y-auto custom-scrollbar p-4 flex-1",
                },
                rows.length === 0
                  ? /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className:
                        "flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500",
                    },
                        /*#__PURE__*/ React.createElement("i", {
                      className:
                        "fa-solid fa-circle-check text-4xl mb-3 text-green-400",
                    }),
                        /*#__PURE__*/ React.createElement(
                      "p",
                      {
                        className: "text-sm font-semibold",
                      },
                      t("stockAlertNone"),
                    ),
                  )
                  : /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className: "space-y-1",
                    },
                    rows.map(({ id, mat, amount, section }) =>
                          /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        key: id,
                        className:
                          "flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors",
                      },
                            /*#__PURE__*/ React.createElement(ItemIcon, {
                        id: id,
                        name: mat?.name || String(id),
                        size: "w-7 h-7 flex-shrink-0",
                      }),
                            /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className: "flex-1 min-w-0",
                        },
                              /*#__PURE__*/ React.createElement(
                          "p",
                          {
                            className:
                              "text-xs font-semibold text-slate-700 dark:text-slate-200 truncate",
                          },
                          mat?.name || `ID ${id}`,
                        ),
                        mat &&
                                /*#__PURE__*/ React.createElement(
                          "p",
                          {
                            className:
                              "text-[10px] text-slate-400 dark:text-slate-500",
                          },
                          mat.type,
                        ),
                      ),
                            /*#__PURE__*/ React.createElement(
                        "span",
                        {
                          className: `text-xs font-black flex-shrink-0 ${section === "leer" ? "text-red-500 dark:text-red-400" : "text-amber-500 dark:text-amber-400"}`,
                        },
                        section === "leer"
                          ? /*#__PURE__*/ React.createElement(
                            "span",
                            {
                              className:
                                "text-[10px] font-bold uppercase tracking-wide",
                            },
                            t("stockAlertEmpty"),
                          )
                          : /*#__PURE__*/ React.createElement(
                            React.Fragment,
                            null,
                            "\xD7",
                            amount,
                            " ",
                                    /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className:
                                  "text-[9px] font-bold uppercase tracking-wide opacity-75",
                              },
                              t("stockAlertLow"),
                            ),
                          ),
                      ),
                            /*#__PURE__*/ React.createElement(
                        "a",
                        {
                          href: `https://cp.arcadia-online.org/item/view/?id=${id}`,
                          target: "_blank",
                          rel: "noopener noreferrer",
                          className:
                            "flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors text-xs",
                          title: "Arcadia DB",
                        },
                              /*#__PURE__*/ React.createElement("i", {
                          className: "fa-solid fa-database",
                        }),
                      ),
                            /*#__PURE__*/ React.createElement(
                        "a",
                        {
                          href: `https://arcadia-market.de/sells/item_id/${id}`,
                          target: "_blank",
                          rel: "noopener noreferrer",
                          className:
                            "flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800/60 transition-colors text-xs",
                          title: "Arcadia Market",
                        },
                              /*#__PURE__*/ React.createElement("i", {
                          className: "fa-solid fa-cart-shopping",
                        }),
                      ),
                    ),
                    ),
                  ),
              ),
            ),
          );
        })(),
        saveSuccessToast !== null &&
          /*#__PURE__*/ React.createElement(
          "div",
          {
            className:
              "fixed bottom-6 right-6 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg bg-green-100 dark:bg-green-900/80 border border-green-300 dark:border-green-700 text-green-800 dark:text-green-300 text-sm font-bold pointer-events-none",
          },
            /*#__PURE__*/ React.createElement("i", {
            className: "fa-solid fa-circle-check text-green-500",
          }),
            /*#__PURE__*/ React.createElement(
            "span",
            null,
            "\xAB",
            saveSuccessToast,
            "\xBB gespeichert \u2013 neues Rezept bereit",
          ),
        ),
        settingsOpen &&
          /*#__PURE__*/ React.createElement(
          "div",
          {
            className:
              "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4",
            onClick: () => setSettingsOpen(false),
          },
            /*#__PURE__*/ React.createElement(
            "div",
            {
              className:
                "bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-[65vw] max-w-5xl flex flex-col h-[85vh]",
              onClick: (e) => e.stopPropagation(),
            },
              /*#__PURE__*/ React.createElement(
              "div",
              {
                className:
                  "flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0",
              },
                /*#__PURE__*/ React.createElement(
                "div",
                null,
                  /*#__PURE__*/ React.createElement(
                  "h2",
                  {
                    className:
                      "text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2",
                  },
                    /*#__PURE__*/ React.createElement("i", {
                    className: "fa-solid fa-gear text-indigo-500",
                  }),
                  " ",
                  t("settingsTitle"),
                ),
                  /*#__PURE__*/ React.createElement(
                  "p",
                  {
                    className:
                      "text-sm text-slate-500 dark:text-slate-400 mt-0.5",
                  },
                  t("settingsHint"),
                ),
              ),
                /*#__PURE__*/ React.createElement(
                "div",
                {
                  className: "flex items-center gap-2",
                },
                disabledItems.size > 0 &&
                    /*#__PURE__*/ React.createElement(
                  "button",
                  {
                    onClick: () => {
                      setDisabledItems(new Set());
                      try {
                        localStorage.setItem("alchemyDisabledItems", "[]");
                      } catch { }
                    },
                    className:
                      "px-3 py-1.5 text-xs font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors",
                  },
                  t("settingsReset"),
                  " (",
                  disabledItems.size,
                  ")",
                ),
                  /*#__PURE__*/ React.createElement(
                  "button",
                  {
                    onClick: () => setSettingsOpen(false),
                    className:
                      "p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 dark:text-slate-400",
                  },
                    /*#__PURE__*/ React.createElement("i", {
                    className: "fa-solid fa-xmark text-xl",
                  }),
                ),
              ),
            ),
              /*#__PURE__*/ React.createElement(
              "div",
              {
                className: "overflow-y-auto custom-scrollbar p-6 flex-1",
              },
                /*#__PURE__*/ React.createElement(
                "div",
                {
                  className: "grid grid-cols-2 gap-3 mb-6",
                },
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4",
                  },
                    /*#__PURE__*/ React.createElement(
                    "div",
                    null,
                      /*#__PURE__*/ React.createElement(
                      "p",
                      {
                        className:
                          "text-sm font-bold text-slate-700 dark:text-slate-200",
                      },
                      t("simplifiedDeliveryLabel"),
                    ),
                      /*#__PURE__*/ React.createElement(
                      "p",
                      {
                        className:
                          "text-xs text-slate-500 dark:text-slate-400 mt-0.5",
                      },
                      t("simplifiedDeliveryHint"),
                    ),
                  ),
                    /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: toggleSimplifiedDelivery,
                      className: `relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${simplifiedDelivery ? "bg-indigo-500" : "bg-slate-300 dark:bg-slate-600"}`,
                    },
                      /*#__PURE__*/ React.createElement("span", {
                      className: `inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${simplifiedDelivery ? "translate-x-5" : "translate-x-0"}`,
                    }),
                  ),
                ),
                /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4",
                  },
                  /*#__PURE__*/ React.createElement(
                    "div",
                    null,
                    /*#__PURE__*/ React.createElement(
                      "p",
                      {
                        className:
                          "text-sm font-bold text-slate-700 dark:text-slate-200",
                      },
                      t("simplifiedCraftLabel"),
                    ),
                    /*#__PURE__*/ React.createElement(
                      "p",
                      {
                        className:
                          "text-xs text-slate-500 dark:text-slate-400 mt-0.5",
                      },
                      t("simplifiedCraftHint"),
                    ),
                  ),
                  /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: toggleSimplifiedCraftView,
                      className: `relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${simplifiedCraftView ? "bg-indigo-500" : "bg-slate-300 dark:bg-slate-600"}`,
                    },
                    /*#__PURE__*/ React.createElement("span", {
                      className: `inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${simplifiedCraftView ? "translate-x-5" : "translate-x-0"}`,
                    }),
                  ),
                ),
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4",
                  },
                    /*#__PURE__*/ React.createElement(
                    "div",
                    null,
                      /*#__PURE__*/ React.createElement(
                      "p",
                      {
                        className:
                          "text-sm font-bold text-slate-700 dark:text-slate-200",
                      },
                      t("ignoreEmptyItemsLabel"),
                    ),
                      /*#__PURE__*/ React.createElement(
                      "p",
                      {
                        className:
                          "text-xs text-slate-500 dark:text-slate-400 mt-0.5",
                      },
                      t("ignoreEmptyItemsHint"),
                    ),
                  ),
                    /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: toggleIgnoreEmptyItems,
                      className: `relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${ignoreEmptyItems ? "bg-indigo-500" : "bg-slate-300 dark:bg-slate-600"}`,
                    },
                      /*#__PURE__*/ React.createElement("span", {
                      className: `inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${ignoreEmptyItems ? "translate-x-5" : "translate-x-0"}`,
                    }),
                  ),
                ),
                /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col gap-3",
                  },
                  /*#__PURE__*/ React.createElement(
                    "div",
                    { className: "flex items-center justify-between gap-4" },
                    /*#__PURE__*/ React.createElement(
                      "div",
                      null,
                      /*#__PURE__*/ React.createElement(
                        "p",
                        {
                          className:
                            "text-sm font-bold text-slate-700 dark:text-slate-200",
                        },
                        t("rememberIngredientsLabel"),
                      ),
                      /*#__PURE__*/ React.createElement(
                        "p",
                        {
                          className:
                            "text-xs text-slate-500 dark:text-slate-400 mt-0.5",
                        },
                        t("rememberIngredientsHint"),
                      ),
                    ),
                    /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        onClick: toggleRememberIngredients,
                        className: `relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${rememberIngredients ? "bg-indigo-500" : "bg-slate-300 dark:bg-slate-600"}`,
                      },
                      /*#__PURE__*/ React.createElement("span", {
                        className: `inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${rememberIngredients ? "translate-x-5" : "translate-x-0"}`,
                      }),
                    ),
                  ),
                  /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: () => {
                        if (window.confirm(t("rememberIngredientsResetConfirm"))) {
                          clearAllRecipeIngredientsPersist();
                        }
                      },
                      className:
                        "mx-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors",
                    },
                    /*#__PURE__*/ React.createElement("i", { className: "fa-solid fa-triangle-exclamation" }),
                    t("rememberIngredientsReset"),
                  ),
                ),
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4",
                  },
                    /*#__PURE__*/ React.createElement(
                    "div",
                    null,
                      /*#__PURE__*/ React.createElement(
                      "p",
                      {
                        className:
                          "text-sm font-bold text-slate-700 dark:text-slate-200",
                      },
                      t("splitByStockLabel"),
                    ),
                      /*#__PURE__*/ React.createElement(
                      "p",
                      {
                        className:
                          "text-xs text-slate-500 dark:text-slate-400 mt-0.5",
                      },
                      t("splitByStockHint"),
                    ),
                  ),
                    /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className:
                        "flex p-0.5 bg-slate-200 dark:bg-slate-700 rounded-lg flex-shrink-0",
                    },
                    [
                      ["none", t("splitModeNone")],
                      ["stock", t("splitModeStock")],
                      ["type", t("splitModeType")],
                    ].map(([mode, label]) =>
                        /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        key: mode,
                        onClick: () => setMatSplitModeAndSave(mode),
                        className: `px-3 py-1.5 text-xs font-bold rounded-md transition-all ${matSplitMode === mode ? "bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`,
                      },
                      label,
                    ),
                    ),
                  ),
                ),
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4",
                  },
                    /*#__PURE__*/ React.createElement(
                    "div",
                    null,
                      /*#__PURE__*/ React.createElement(
                      "p",
                      {
                        className:
                          "text-sm font-bold text-slate-700 dark:text-slate-200",
                      },
                      t("lowStockThresholdLabel"),
                    ),
                      /*#__PURE__*/ React.createElement(
                      "p",
                      {
                        className:
                          "text-xs text-slate-500 dark:text-slate-400 mt-0.5",
                      },
                      t("lowStockThresholdHint"),
                    ),
                  ),
                    /*#__PURE__*/ React.createElement("input", {
                    type: "number",
                    min: "1",
                    max: "9999",
                    value: lowStockThreshold,
                    onChange: (e) => saveLowStockThreshold(e.target.value),
                    className:
                      "w-20 text-center font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors",
                  }),
                ),
              ),
              ["Alloy", "Food", "Sand", "Wood", "Beast", "Magic"].map(
                (type) => {
                  const typeItems = MATERIALS.filter((m) => m.type === type);
                  if (!typeItems.length) return null;
                  const activeCount = typeItems.filter(
                    (m) => !disabledItems.has(m.id),
                  ).length;
                  return /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      key: type,
                      className: "mb-6",
                    },
                      /*#__PURE__*/ React.createElement(
                      "h3",
                      {
                        className:
                          "text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2",
                      },
                        /*#__PURE__*/ React.createElement(ItemIcon, {
                        id: TYPE_ICONS[type],
                        name: type,
                        size: "w-4 h-4",
                      }),
                      type,
                        /*#__PURE__*/ React.createElement(
                        "span",
                        {
                          className:
                            "text-slate-400 dark:text-slate-600 font-medium normal-case tracking-normal",
                        },
                        activeCount,
                        "/",
                        typeItems.length,
                      ),
                    ),
                      /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className: "grid grid-cols-10 gap-2",
                      },
                      typeItems.map((m) => {
                        const isOff = disabledItems.has(m.id);
                        const mx = Math.max(m.fire, m.earth, m.air, m.water);
                        const elBorder =
                          mx > 0
                            ? m.fire === mx
                              ? "border-red-300 dark:border-red-700"
                              : m.earth === mx
                                ? "border-green-300 dark:border-green-700"
                                : m.air === mx
                                  ? "border-yellow-300 dark:border-yellow-700"
                                  : "border-blue-300 dark:border-blue-700"
                            : "border-slate-200 dark:border-slate-700";
                        return /*#__PURE__*/ React.createElement(
                          "button",
                          {
                            key: m.id,
                            onClick: () => toggleDisabledItem(m.id),
                            title: m.name,
                            className: `flex flex-col items-center gap-1 p-2 rounded-xl border-2 text-center transition-all ${isOff ? "opacity-30 grayscale border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900" : `${elBorder} bg-white dark:bg-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500`}`,
                          },
                            /*#__PURE__*/ React.createElement(ItemIcon, {
                            id: m.id,
                            name: m.name,
                            size: "w-8 h-8",
                          }),
                            /*#__PURE__*/ React.createElement(
                            "span",
                            {
                              className:
                                "text-[10px] font-semibold leading-tight text-slate-700 dark:text-slate-300 truncate w-full",
                            },
                            m.name,
                          ),
                        );
                      }),
                    ),
                  );
                },
              ),
                /*#__PURE__*/ React.createElement(
                "div",
                {
                  className: "mb-2",
                },
                  /*#__PURE__*/ React.createElement(
                  "h3",
                  {
                    className:
                      "text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2",
                  },
                    /*#__PURE__*/ React.createElement("i", {
                    className: "fa-solid fa-flask-vial text-slate-400",
                  }),
                  t("agentLabel"),
                    /*#__PURE__*/ React.createElement(
                    "span",
                    {
                      className:
                        "text-slate-400 dark:text-slate-600 font-medium normal-case tracking-normal",
                    },
                    AGENTS.filter((a) => !disabledItems.has(a.id)).length,
                    "/",
                    AGENTS.length,
                  ),
                ),
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "grid grid-cols-10 gap-2",
                  },
                  AGENTS.map((a) => {
                    const isOff = disabledItems.has(a.id);
                    const mx = Math.max(a.fire, a.earth, a.air, a.water);
                    const elBorder =
                      mx > 0
                        ? a.fire === mx
                          ? "border-red-300 dark:border-red-700"
                          : a.earth === mx
                            ? "border-green-300 dark:border-green-700"
                            : a.air === mx
                              ? "border-yellow-300 dark:border-yellow-700"
                              : "border-blue-300 dark:border-blue-700"
                        : "border-slate-200 dark:border-slate-700";
                    return /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        key: a.id,
                        onClick: () => toggleDisabledItem(a.id),
                        title: a.name,
                        className: `flex flex-col items-center gap-1 p-2 rounded-xl border-2 text-center transition-all ${isOff ? "opacity-30 grayscale border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900" : `${elBorder} bg-white dark:bg-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500`}`,
                      },
                        /*#__PURE__*/ React.createElement(ItemIcon, {
                        id: a.id,
                        name: a.name,
                        size: "w-8 h-8",
                      }),
                        /*#__PURE__*/ React.createElement(
                        "span",
                        {
                          className:
                            "text-[10px] font-semibold leading-tight text-slate-700 dark:text-slate-300 truncate w-full",
                        },
                        a.name,
                      ),
                    );
                  }),
                ),
              ),
            ),
          ),
        ),
        /*#__PURE__*/ React.createElement(
          React.Fragment,
          null,
          sessionOpen &&
            /*#__PURE__*/ React.createElement(
            "div",
            {
              className:
                "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4",
              onClick: () => setSessionOpen(false),
            },
              /*#__PURE__*/ React.createElement(
              "div",
              {
                className:
                  "bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-[45vw] min-w-[620px] flex flex-col h-[85vh]",
                onClick: (e) => e.stopPropagation(),
              },
                /*#__PURE__*/ React.createElement(
                "div",
                {
                  className:
                    "flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0",
                },
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "flex items-center gap-3",
                  },
                  [1, 2, 3, 4, 5, 6].map((s, i) =>
                      /*#__PURE__*/ React.createElement(
                    React.Fragment,
                    {
                      key: s,
                    },
                    i > 0 &&
                          /*#__PURE__*/ React.createElement("div", {
                      className: `h-0.5 w-8 ${sessionStep >= s ? "bg-green-500" : "bg-slate-200 dark:bg-slate-700"}`,
                    }),
                        /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        onClick: () =>
                          s <= sessionMaxStep ? setSessionStep(s) : null,
                        disabled: s > sessionMaxStep,
                        title: [
                          t("step1Label"),
                          t("step2Label"),
                          t("step3Label"),
                          t("step4Label"),
                          t("step5Label"),
                          t("step6Label"),
                        ][i],
                        className: `w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all
                                                                    ${sessionStep === s ? "bg-indigo-500 text-white ring-2 ring-indigo-300 dark:ring-indigo-700" : s < sessionMaxStep ? "bg-green-500 text-white hover:bg-indigo-500 cursor-pointer" : s === sessionMaxStep ? "bg-green-500 text-white hover:bg-indigo-500 cursor-pointer" : "bg-slate-200 dark:bg-slate-700 text-slate-500 cursor-not-allowed opacity-50"}`,
                      },
                      s,
                    ),
                  ),
                  ),
                    /*#__PURE__*/ React.createElement(
                    "span",
                    {
                      className:
                        "ml-2 text-sm font-bold text-slate-600 dark:text-slate-300",
                    },
                    sessionStep === 1
                      ? t("step1Label")
                      : sessionStep === 2
                        ? t("step2Label")
                        : sessionStep === 3
                          ? t("step3Label")
                          : sessionStep === 4
                            ? t("step4Label")
                            : sessionStep === 5
                              ? t("step5Label")
                              : t("step6Label"),
                  ),
                ),
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "flex items-center gap-2",
                  },
                    /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: () => {
                        if (
                          !window.confirm(
                            lang === "de"
                              ? "Session wirklich verwerfen?"
                              : "Really discard session?",
                          )
                        )
                          return;
                        try {
                          localStorage.removeItem("alchemySession");
                        } catch { }
                        setSessionRecipes([]);
                        setSessionStep(1);
                        setSessionMaxStep(1);
                        setSessionSearch("");
                        setSessionCauldron([null, null, null, null]);
                        setSessionActiveIdx(0);
                        setSessionDelivery([]);
                        setSessionDeliveryTab([]);
                        setSessionAgents([]);
                      },
                      className:
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors",
                    },
                      /*#__PURE__*/ React.createElement("i", {
                      className: "fa-solid fa-trash text-xs",
                    }),
                    " ",
                    t("sessionDiscard"),
                  ),
                    /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: () => setSessionOpen(false),
                      className:
                        "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors",
                    },
                      /*#__PURE__*/ React.createElement("i", {
                      className: "fa-solid fa-xmark text-xl",
                    }),
                  ),
                ),
              ),
              sessionStep === 1 &&
                  /*#__PURE__*/ React.createElement(
                React.Fragment,
                null,
                    /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "px-6 pt-4 pb-2 flex-shrink-0",
                  },
                      /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className: "flex items-center justify-between mb-3",
                    },
                        /*#__PURE__*/ React.createElement(
                      "p",
                      {
                        className:
                          "text-sm text-slate-500 dark:text-slate-400",
                      },
                      t("step1Desc"),
                    ),
                        /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        onClick: scanScreenshot,
                        disabled:
                          ocrState === "loading" || ocrState === "paste",
                        className: `flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0 ml-3 transition-all ${ocrState === "loading" ? "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-wait" : ocrState === "paste" ? "bg-indigo-500 text-white animate-pulse cursor-default" : ocrState === "noimage" || ocrState === "error" ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" : ocrState?.found > 0 ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" : ocrState?.found === 0 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" : "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-800/60"}`,
                      },
                          /*#__PURE__*/ React.createElement("i", {
                        className: `fa-solid ${ocrState === "loading" ? "fa-spinner fa-spin" : ocrState === "paste" ? "fa-paste" : ocrState === "noimage" || ocrState === "error" ? "fa-triangle-exclamation" : ocrState?.found > 0 ? "fa-check" : ocrState?.found === 0 ? "fa-magnifying-glass" : "fa-camera"}`,
                      }),
                      ocrState === "loading"
                        ? t("ocrLoading")
                        : ocrState === "paste"
                          ? t("ocrPaste")
                          : ocrState === "noimage"
                            ? t("ocrNoImage")
                            : ocrState === "error"
                              ? t("ocrError")
                              : ocrState?.found > 0
                                ? t("ocrFound").replace(
                                  "{n}",
                                  ocrState.found,
                                )
                                : ocrState?.found === 0
                                  ? t("ocrNoMatch")
                                  : t("ocrScan"),
                    ),
                  ),
                      /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className: "relative mb-3",
                    },
                        /*#__PURE__*/ React.createElement("input", {
                      type: "text",
                      value: sessionSearch,
                      onChange: (e) => setSessionSearch(e.target.value),
                      placeholder: t("recipeSearch"),
                      className:
                        "w-full px-3 py-2 pr-8 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-green-400",
                    }),
                    sessionSearch &&
                          /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        onClick: () => setSessionSearch(""),
                        className:
                          "absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors",
                      },
                            /*#__PURE__*/ React.createElement("i", {
                        className: "fa-solid fa-xmark text-sm",
                      }),
                    ),
                  ),
                      /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className:
                        "flex gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl",
                    },
                    [
                      "All",
                      "Basic",
                      "Intermediate",
                      "Advanced",
                      "Custom",
                    ].map((rank) =>
                          /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        key: rank,
                        onClick: () => setSessionFilterRank(rank),
                        className: `flex-1 py-1 text-xs font-bold rounded-lg transition-all ${sessionFilterRank === rank ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`,
                      },
                      rank === "All" ? t("all") : rank,
                    ),
                    ),
                  ),
                ),
                    /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "flex-1 overflow-y-auto custom-scrollbar px-6 pb-4 min-h-0",
                  },
                      /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className: "space-y-1.5 mt-2",
                    },
                    (() => {
                      const filtered = [
                        ...RECIPES,
                        ...customRecipes,
                      ].filter((r) => {
                        if (sessionFilterRank !== "All") {
                          if (sessionFilterRank === "Custom") {
                            if (r.rank !== "Custom") return false;
                          } else {
                            const rank =
                              r.rank === "Custom"
                                ? r.customRank || "Basic"
                                : r.rank;
                            if (rank !== sessionFilterRank) return false;
                          }
                        }
                        if (sessionSearch)
                          return r.product
                            .toLowerCase()
                            .includes(sessionSearch.toLowerCase());
                        return true;
                      });
                      const selected = sessionRecipes
                        .map((e) =>
                          filtered.find((r) => r.id === e.recipeId),
                        )
                        .filter(Boolean);
                      const favs = filtered.filter(
                        (r) =>
                          favorites.has(r.id) &&
                          !sessionRecipes.some((e) => e.recipeId === r.id),
                      );
                      const rest = filtered.filter(
                        (r) =>
                          !favorites.has(r.id) &&
                          !sessionRecipes.some((e) => e.recipeId === r.id),
                      );
                      return [...selected, ...favs, ...rest].map(
                        (recipe) => {
                          const sel = sessionRecipes.some(
                            (e) => e.recipeId === recipe.id,
                          );
                          const isFav = favorites.has(recipe.id);
                          return /*#__PURE__*/ React.createElement(
                            "button",
                            {
                              key: recipe.id,
                              onClick: () => sessionToggleRecipe(recipe.id),
                              className: `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${sel ? "bg-green-50 dark:bg-green-900/30 border-green-400 dark:border-green-600" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300"}`,
                            },
                                /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className: `w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${sel ? "bg-green-500" : "border-2 border-slate-300 dark:border-slate-600"}`,
                              },
                              sel &&
                                    /*#__PURE__*/ React.createElement("i", {
                                className:
                                  "fa-solid fa-check text-white text-[10px]",
                              }),
                            ),
                                /*#__PURE__*/ React.createElement(ItemIcon, {
                              id: recipe.matchedRecipeId ?? recipe.id,
                              name: recipe.product,
                              size: "w-7 h-7 flex-shrink-0",
                            }),
                                /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className: "flex-1 min-w-0",
                              },
                                  /*#__PURE__*/ React.createElement(
                                "p",
                                {
                                  className:
                                    "font-bold text-sm text-slate-800 dark:text-slate-200 truncate",
                                },
                                recipe.product,
                              ),
                                  /*#__PURE__*/ React.createElement(
                                "p",
                                {
                                  className: "text-[10px] text-slate-400",
                                },
                                recipe.rank,
                                " \u2013 ",
                                recipe.type,
                              ),
                            ),
                            isFav &&
                                  /*#__PURE__*/ React.createElement("i", {
                              className:
                                "fa-solid fa-star text-amber-400 flex-shrink-0 text-xs",
                            }),
                            sel &&
                                  /*#__PURE__*/ React.createElement("i", {
                              className:
                                "fa-solid fa-circle-check text-green-500 flex-shrink-0",
                            }),
                          );
                        },
                      );
                    })(),
                  ),
                ),
                    /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0",
                  },
                      /*#__PURE__*/ React.createElement(
                    "span",
                    {
                      className: "text-sm text-slate-500",
                    },
                    sessionRecipes.length,
                    " ",
                    t("selected"),
                  ),
                      /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: sessionGoToStep2,
                      disabled: sessionRecipes.length === 0,
                      className: `flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-colors ${sessionRecipes.length > 0 ? "bg-green-500 hover:bg-green-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed"}`,
                    },
                    t("next"),
                    " ",
                        /*#__PURE__*/ React.createElement("i", {
                      className: "fa-solid fa-arrow-right",
                    }),
                  ),
                ),
              ),
              sessionStep === 2 &&
                  /*#__PURE__*/ React.createElement(
                React.Fragment,
                null,
                    /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "px-6 pt-4 pb-2 flex-shrink-0",
                  },
                      /*#__PURE__*/ React.createElement(
                    "p",
                    {
                      className:
                        "text-sm text-slate-500 dark:text-slate-400 mb-3",
                    },
                    t("step2Desc"),
                  ),
                      /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className: "flex flex-wrap gap-2 items-start",
                    },
                    (() => {
                      const childrenOf = {};
                      sessionRecipes.forEach((r, i) => {
                        if (r.parentId) {
                          if (!childrenOf[r.parentId]) childrenOf[r.parentId] = [];
                          childrenOf[r.parentId].push(i);
                        }
                      });
                      const knownIds = new Set(sessionRecipes.map((r) => r._id));
                      const renderTabBtn = (idx, depth) => {
                        const entry = sessionRecipes[idx];
                        const recipe = [...RECIPES, ...customRecipes].find((r) => r.id === entry.recipeId);
                        const slots =
                          idx === sessionActiveIdx
                            ? sessionCauldron
                            : (entry.savedMaterials || []).map((id) =>
                              id != null ? MATERIALS.find((m) => m.id === id) || null : null,
                            );
                        const tabAgent = sessionAgents[idx] ?? null;
                        let fire = 0, earth = 0, air = 0, water = 0, qualitySum = 0, weightSum = 0, count = 0;
                        slots.forEach((item, si) => {
                          if (item) {
                            const w = si === 0 ? 2 : 1;
                            fire += item.fire * w;
                            earth += item.earth * w;
                            air += item.air * w;
                            water += item.water * w;
                            qualitySum += item.quality * w;
                            weightSum += w;
                            count++;
                          }
                        });
                        const totals = {
                          fire: fire + (tabAgent?.fire ?? 0),
                          earth: earth + (tabAgent?.earth ?? 0),
                          air: air + (tabAgent?.air ?? 0),
                          water: water + (tabAgent?.water ?? 0),
                        };
                        const quality = (weightSum > 0 ? Math.floor(qualitySum / weightSum) : 0) + (tabAgent?.quality ?? 0);
                        const maxVal = Math.max(totals.fire, totals.earth, totals.air, totals.water);
                        let dom = "None";
                        if (maxVal > 0) {
                          const doms = [["Fire", totals.fire], ["Earth", totals.earth], ["Air", totals.air], ["Water", totals.water]].filter(([, v]) => v === maxVal);
                          dom = doms.length === 1 ? doms[0][0] : "Tie";
                        }
                        const elKey = recipe?.element?.toLowerCase();
                        const hasLager = Object.keys(parsedLager).length > 0;
                        const slotsNeeded = {};
                        slots.forEach((item) => {
                          if (item) slotsNeeded[item.id] = (slotsNeeded[item.id] || 0) + 1;
                        });
                        const effectiveRankS2 = recipe?.rank === "Custom" ? recipe.customRank : recipe.rank;
                        const potionIdS2 = { Basic: 645, Intermediate: 656, Advanced: 657 }[effectiveRankS2];
                        if (potionIdS2) slotsNeeded[potionIdS2] = (slotsNeeded[potionIdS2] || 0) + 2;
                        const lagerOk = !hasLager || Object.entries(slotsNeeded).every(([id, needed]) => (parsedLager[parseInt(id)] || 0) >= needed);
                        const recipeValid = recipe && count === 4 && dom === recipe.element && quality >= recipe.minQuality && (!(recipe.minScore > 0) || totals[elKey] >= recipe.minScore) && lagerOk;
                        const isActive = idx === sessionActiveIdx;
                        const isRoot = !entry.parentId || !knownIds.has(entry.parentId);
                        const sizeClass = depth === 0 ? "text-sm py-1.5 px-3" : "text-xs py-1 px-2.5";
                        return /*#__PURE__*/ React.createElement(
                          "button",
                          {
                            key: entry._id,
                            onClick: () => sessionSelectRecipeSlot(idx),
                            draggable: isRoot,
                            onDragStart: isRoot ? (e) => { setSessionDragIdx(idx); e.dataTransfer.effectAllowed = "move"; } : undefined,
                            onDragOver: isRoot ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setSessionDragOverIdx(idx); } : undefined,
                            onDragLeave: isRoot ? () => setSessionDragOverIdx(null) : undefined,
                            onDrop: isRoot ? (e) => { e.preventDefault(); if (sessionDragIdx !== null) sessionReorderRecipes(sessionDragIdx, idx); setSessionDragIdx(null); setSessionDragOverIdx(null); } : undefined,
                            onDragEnd: isRoot ? () => { setSessionDragIdx(null); setSessionDragOverIdx(null); } : undefined,
                            className: `flex items-center gap-2 ${sizeClass} rounded-xl border font-bold transition-all ${isRoot ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${sessionDragOverIdx === idx && sessionDragIdx !== idx ? "ring-2 ring-indigo-400 ring-offset-1 scale-105" : ""} ${isActive ? (recipeValid ? "bg-indigo-600 border-indigo-500 text-white" : "bg-red-600 border-red-500 text-white ring-2 ring-red-400 ring-offset-1") : recipeValid ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-400" : "bg-red-50 dark:bg-red-900/20 border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 hover:border-red-500"}`,
                          },
                          /*#__PURE__*/ React.createElement(ItemIcon, {
                            id: recipe?.matchedRecipeId ?? recipe?.id,
                            name: recipe?.product,
                            size: "w-5 h-5",
                          }),
                          recipe?.product,
                          !recipeValid && /*#__PURE__*/ React.createElement("i", { className: "fa-solid fa-circle-xmark text-xs" }),
                          recipeValid && !isActive && /*#__PURE__*/ React.createElement("i", { className: "fa-solid fa-circle-check text-green-500 text-xs" }),
                        );
                      };
                      const renderGroup = (idx, depth) => {
                        const entry = sessionRecipes[idx];
                        const children = childrenOf[entry._id] || [];
                        const btn = renderTabBtn(idx, depth);
                        if (children.length === 0) return btn;
                        return /*#__PURE__*/ React.createElement(
                          "div",
                          { key: entry._id + "_g", className: "flex flex-col gap-1" },
                          btn,
                          /*#__PURE__*/ React.createElement(
                            "div",
                            { className: "ml-3 pl-2 border-l-2 border-slate-300 dark:border-slate-600 flex flex-col gap-1" },
                            children.map((ci) => renderGroup(ci, depth + 1)),
                          ),
                        );
                      };
                      const roots = sessionRecipes.reduce((acc, r, i) => {
                        if (!r.parentId || !knownIds.has(r.parentId)) acc.push(i);
                        return acc;
                      }, []);
                      return roots.map((ri) => renderGroup(ri, 0));
                    })(),
                  ),
                ),
                (() => {
                  const entry = sessionRecipes[sessionActiveIdx];
                  const recipe = entry
                    ? [...RECIPES, ...customRecipes].find(
                      (r) => r.id === entry.recipeId,
                    )
                    : null;
                  return /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className:
                        "flex-1 overflow-y-auto custom-scrollbar px-6 pb-4 min-h-0",
                    },
                    recipe &&
                          /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className: "mt-3",
                      },
                            /*#__PURE__*/ React.createElement(
                        "p",
                        {
                          className:
                            "text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3",
                        },
                        t("ingredientsFor"),
                        " ",
                              /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className:
                              "text-indigo-600 dark:text-indigo-400",
                          },
                          recipe.product,
                        ),
                      ),
                            /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className: "grid grid-cols-2 gap-3",
                        },
                        sessionCauldron.map((slot, slotIdx) => {
                          const lagerAmt = slot
                            ? parsedLager[slot.id] || 0
                            : 0;
                          const reqType = recipe.ingredients?.[slotIdx];
                          const slotBg = (() => {
                            if (!slot)
                              return "border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900";
                            const maxStat = Math.max(
                              slot.fire,
                              slot.earth,
                              slot.air,
                              slot.water,
                            );
                            if (maxStat === 0)
                              return "border-indigo-200 dark:border-indigo-700/50 bg-indigo-50 dark:bg-indigo-900/30";
                            if (slot.fire === maxStat)
                              return "border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/25";
                            if (slot.earth === maxStat)
                              return "border-green-300 dark:border-green-700/60 bg-green-50 dark:bg-green-900/25";
                            if (slot.air === maxStat)
                              return "border-yellow-300 dark:border-yellow-700/60 bg-yellow-50 dark:bg-yellow-900/25";
                            return "border-blue-300 dark:border-blue-700/60 bg-blue-50 dark:bg-blue-900/25";
                          })();
                          const craftableRecipes = slot
                            ? [...RECIPES, ...customRecipes].filter(
                              (r) => r.product === slot.name,
                            )
                            : [];
                          const showCraftPlus =
                            slot &&
                            lagerAmt === 0 &&
                            craftableRecipes.length > 0;
                          return /*#__PURE__*/ React.createElement(
                            "div",
                            { key: slotIdx, className: "relative" },
                            /*#__PURE__*/ React.createElement(
                              "button",
                              {
                                onClick: () => {
                                  if (
                                    _sessionSwapLastSlot.current !== slotIdx
                                  ) {
                                    _sessionSwapOriginalRef.current =
                                      slot ?? null;
                                    _sessionSwapLastSlot.current = slotIdx;
                                  }
                                  setSessionSwapOriginalItem(
                                    _sessionSwapOriginalRef.current,
                                  );
                                  setSessionSwapSlotIndex(slotIdx);
                                  const _ms = slot
                                    ? Math.max(
                                      slot.fire,
                                      slot.earth,
                                      slot.air,
                                      slot.water,
                                    )
                                    : 0;
                                  setSessionSwapElementFilter(
                                    _ms > 0
                                      ? slot.fire === _ms
                                        ? "fire"
                                        : slot.earth === _ms
                                          ? "earth"
                                          : slot.air === _ms
                                            ? "air"
                                            : "water"
                                      : null,
                                  );
                                },
                                className: `w-full relative rounded-xl border-2 p-2.5 flex flex-col gap-1.5 text-left transition-all hover:ring-2 hover:ring-indigo-400 hover:ring-offset-1 group ${slotBg}`,
                              },
                                  /*#__PURE__*/ React.createElement(
                                "div",
                                {
                                  className:
                                    "flex items-center justify-between",
                                },
                                    /*#__PURE__*/ React.createElement(
                                  "span",
                                  {
                                    className:
                                      "text-[10px] font-bold text-slate-400 uppercase",
                                  },
                                  slotIdx === 0
                                    ? `${t("ingredientShort")} 1 ×2`
                                    : `${t("ingredientShort")} ${slotIdx + 1}`,
                                ),
                                    /*#__PURE__*/ React.createElement(
                                  "div",
                                  {
                                    className: "flex items-center gap-1",
                                  },
                                  reqType &&
                                        /*#__PURE__*/ React.createElement(
                                    "span",
                                    {
                                      className:
                                        "text-[9px] font-bold text-indigo-500 dark:text-indigo-400 uppercase bg-indigo-50 dark:bg-indigo-900/40 px-1.5 py-0.5 rounded",
                                    },
                                    reqType,
                                  ),
                                      /*#__PURE__*/ React.createElement("i", {
                                    className:
                                      "fa-solid fa-shuffle text-[9px] text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity",
                                  }),
                                ),
                              ),
                              slot
                                ? /*#__PURE__*/ React.createElement(
                                  React.Fragment,
                                  null,
                                        /*#__PURE__*/ React.createElement(
                                    "div",
                                    {
                                      className:
                                        "flex flex-col items-center gap-1 py-1",
                                    },
                                          /*#__PURE__*/ React.createElement(
                                      ItemIcon,
                                      {
                                        id: slot.id,
                                        name: slot.name,
                                        size: "w-8 h-8 flex-shrink-0",
                                      },
                                    ),
                                          /*#__PURE__*/ React.createElement(
                                      "p",
                                      {
                                        className:
                                          "text-xs font-bold text-slate-800 dark:text-slate-200 text-center truncate w-full",
                                      },
                                      slot.name,
                                    ),
                                    Object.keys(parsedLager).length > 0 &&
                                            /*#__PURE__*/ React.createElement(
                                      "p",
                                      {
                                        className: `text-[10px] font-semibold ${lagerAmt > 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`,
                                      },
                                      "Lager: ",
                                      lagerAmt,
                                    ),
                                  ),
                                        /*#__PURE__*/ React.createElement(
                                    "div",
                                    {
                                      className:
                                        "flex gap-0.5 flex-wrap justify-center",
                                    },
                                    [
                                      [
                                        "fa-fire",
                                        "text-red-500",
                                        slot.fire,
                                      ],
                                      [
                                        "fa-droplet",
                                        "text-blue-500",
                                        slot.water,
                                      ],
                                      [
                                        "fa-wind",
                                        "text-yellow-500",
                                        slot.air,
                                      ],
                                      [
                                        "fa-mountain",
                                        "text-green-600",
                                        slot.earth,
                                      ],
                                    ].map(([icon, color, val]) =>
                                            /*#__PURE__*/ React.createElement(
                                      "div",
                                      {
                                        key: icon,
                                        className: `flex items-center gap-0.5 py-0.5 px-1 rounded bg-white/70 dark:bg-slate-700/60 text-[10px] font-bold ${color}`,
                                      },
                                              /*#__PURE__*/ React.createElement(
                                        "i",
                                        {
                                          className: `fa-solid ${icon} text-[9px]`,
                                        },
                                      ),
                                      val,
                                    ),
                                    ),
                                          /*#__PURE__*/ React.createElement(
                                      "div",
                                      {
                                        className: `flex items-center gap-0.5 py-0.5 px-1 rounded border text-[10px] font-bold ${slot.quality > 0 ? "bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-500 text-indigo-500 dark:text-indigo-400" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600"}`,
                                      },
                                            /*#__PURE__*/ React.createElement(
                                        "i",
                                        {
                                          className:
                                            "fa-solid fa-wand-magic-sparkles text-[9px]",
                                        },
                                      ),
                                      slot.quality,
                                    ),
                                  ),
                                )
                                : /*#__PURE__*/ React.createElement(
                                  "div",
                                  {
                                    className:
                                      "flex flex-col items-center gap-1 py-2 text-slate-400",
                                  },
                                        /*#__PURE__*/ React.createElement("i", {
                                    className:
                                      "fa-solid fa-plus text-base",
                                  }),
                                        /*#__PURE__*/ React.createElement(
                                    "span",
                                    {
                                      className: "text-[10px]",
                                    },
                                    t("ingredientModal"),
                                  ),
                                ),
                            ),
                            showCraftPlus &&
                              /*#__PURE__*/ React.createElement(
                              "button",
                              {
                                type: "button",
                                onClick: (e) => {
                                  e.stopPropagation();
                                  if (craftableRecipes.length === 1) {
                                    setSessionRecipes((prev) => [
                                      ...prev,
                                      {
                                        recipeId: craftableRecipes[0].id,
                                        savedMaterials: null,
                                        _id: Math.random().toString(36).slice(2, 10),
                                        parentId: sessionRecipes[sessionActiveIdx]?._id ?? null,
                                      },
                                    ]);
                                  } else {
                                    setSessionCraftPicker({
                                      slotIdx,
                                      recipes: craftableRecipes,
                                      parentId: sessionRecipes[sessionActiveIdx]?._id ?? null,
                                    });
                                  }
                                },
                                className:
                                  "absolute bottom-1 right-1 z-10 w-5 h-5 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center shadow-md",
                                title: "Als Extra-Craft hinzufügen",
                              },
                                /*#__PURE__*/ React.createElement("i", {
                                className: "fa-solid fa-plus text-[9px]",
                              }),
                            ),
                          );
                        }),
                      ),
                      (() => {
                        let fire = 0,
                          earth = 0,
                          air = 0,
                          water = 0,
                          qualitySum = 0,
                          weightSum = 0,
                          count = 0;
                        sessionCauldron.forEach((item, idx) => {
                          if (item) {
                            const w = idx === 0 ? 2 : 1;
                            fire += item.fire * w;
                            earth += item.earth * w;
                            air += item.air * w;
                            water += item.water * w;
                            qualitySum += item.quality * w;
                            weightSum += w;
                            count++;
                          }
                        });
                        const quality =
                          (weightSum > 0
                            ? Math.floor(qualitySum / weightSum)
                            : 0) + (sessionAgent?.quality ?? 0);
                        const totals = {
                          fire: fire + (sessionAgent?.fire ?? 0),
                          earth: earth + (sessionAgent?.earth ?? 0),
                          air: air + (sessionAgent?.air ?? 0),
                          water: water + (sessionAgent?.water ?? 0),
                        };
                        const maxVal = Math.max(
                          totals.fire,
                          totals.earth,
                          totals.air,
                          totals.water,
                        );
                        let dom = "None";
                        if (maxVal > 0) {
                          const doms = [
                            ["Fire", totals.fire],
                            ["Earth", totals.earth],
                            ["Air", totals.air],
                            ["Water", totals.water],
                          ].filter(([, v]) => v === maxVal);
                          dom = doms.length === 1 ? doms[0][0] : "Tie";
                        }
                        const isValid =
                          count === 4 &&
                          dom === recipe.element &&
                          quality >= recipe.minQuality;
                        return /*#__PURE__*/ React.createElement(
                          React.Fragment,
                          null,
                                /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "mb-3 mt-3",
                            },
                                  /*#__PURE__*/ React.createElement(
                              "button",
                              {
                                onClick: () =>
                                  setSessionAgentModalOpen(true),
                                className: `w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all hover:shadow-md
                                                                                            ${sessionAgent ? "border-indigo-200 dark:border-indigo-700/50 bg-indigo-50 dark:bg-indigo-900/30 hover:border-indigo-400" : "border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 hover:border-indigo-300"}`,
                              },
                              sessionAgent
                                ? /*#__PURE__*/ React.createElement(
                                  React.Fragment,
                                  null,
                                          /*#__PURE__*/ React.createElement(
                                    ItemIcon,
                                    {
                                      id: sessionAgent.id,
                                      name: sessionAgent.name,
                                      size: "w-8 h-8 flex-shrink-0",
                                    },
                                  ),
                                          /*#__PURE__*/ React.createElement(
                                    "div",
                                    {
                                      className:
                                        "flex-1 min-w-0 text-left",
                                    },
                                            /*#__PURE__*/ React.createElement(
                                      "p",
                                      {
                                        className:
                                          "text-sm font-bold text-slate-800 dark:text-slate-200 truncate",
                                      },
                                      sessionAgent.name,
                                    ),
                                            /*#__PURE__*/ React.createElement(
                                      "div",
                                      {
                                        className:
                                          "flex gap-1 mt-0.5 flex-wrap",
                                      },
                                      [
                                        [
                                          "fa-fire",
                                          "text-red-500",
                                          sessionAgent.fire,
                                        ],
                                        [
                                          "fa-droplet",
                                          "text-blue-500",
                                          sessionAgent.water,
                                        ],
                                        [
                                          "fa-wind",
                                          "text-yellow-500",
                                          sessionAgent.air,
                                        ],
                                        [
                                          "fa-mountain",
                                          "text-green-600",
                                          sessionAgent.earth,
                                        ],
                                      ].map(
                                        ([icon, color, val]) =>
                                          val > 0 &&
                                                  /*#__PURE__*/ React.createElement(
                                            "div",
                                            {
                                              key: icon,
                                              className: `flex items-center gap-0.5 py-0.5 px-1 rounded bg-white/70 dark:bg-slate-700/60 text-[10px] font-bold ${color}`,
                                            },
                                                    /*#__PURE__*/ React.createElement(
                                              "i",
                                              {
                                                className: `fa-solid ${icon} text-[9px]`,
                                              },
                                            ),
                                            val,
                                          ),
                                      ),
                                      sessionAgent.quality > 0 &&
                                                /*#__PURE__*/ React.createElement(
                                        "div",
                                        {
                                          className:
                                            "flex items-center gap-0.5 py-0.5 px-1 rounded border bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-500 text-[10px] font-bold text-indigo-500 dark:text-indigo-400",
                                        },
                                                  /*#__PURE__*/ React.createElement(
                                          "i",
                                          {
                                            className:
                                              "fa-solid fa-wand-magic-sparkles text-[9px]",
                                          },
                                        ),
                                        sessionAgent.quality,
                                      ),
                                    ),
                                  ),
                                          /*#__PURE__*/ React.createElement(
                                    "i",
                                    {
                                      className:
                                        "fa-solid fa-rotate text-indigo-400 flex-shrink-0",
                                    },
                                  ),
                                )
                                : /*#__PURE__*/ React.createElement(
                                  React.Fragment,
                                  null,
                                          /*#__PURE__*/ React.createElement(
                                    "div",
                                    {
                                      className:
                                        "w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0",
                                    },
                                            /*#__PURE__*/ React.createElement(
                                      "i",
                                      {
                                        className:
                                          "fa-solid fa-plus text-slate-400 text-sm",
                                      },
                                    ),
                                  ),
                                          /*#__PURE__*/ React.createElement(
                                    "span",
                                    {
                                      className:
                                        "text-sm text-slate-400 font-semibold",
                                    },
                                    t("noAgentSelected"),
                                  ),
                                ),
                            ),
                            sessionAgent &&
                                    /*#__PURE__*/ React.createElement(
                              "button",
                              {
                                onClick: () => setSessionAgent(null),
                                className:
                                  "mt-1 text-xs text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1",
                              },
                                      /*#__PURE__*/ React.createElement("i", {
                                className:
                                  "fa-solid fa-xmark text-[10px]",
                              }),
                              " ",
                              t("agentRemove"),
                            ),
                          ),
                                /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "grid grid-cols-2 gap-3 mb-3",
                            },
                                  /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className: `bg-slate-50 dark:bg-slate-900 rounded-xl p-3 flex flex-col justify-center ${quality > 0 && quality < recipe.minQuality ? "border-4 border-red-400 dark:border-red-600" : "border border-slate-200 dark:border-slate-700"}`,
                              },
                                    /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className:
                                    "text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1",
                                },
                                t("achievedQuality"),
                              ),
                                    /*#__PURE__*/ React.createElement(
                                "div",
                                {
                                  className:
                                    "flex items-center justify-between",
                                },
                                      /*#__PURE__*/ React.createElement(
                                  "span",
                                  {
                                    className: `text-lg font-black flex items-center gap-1 ${quality > 0 ? (quality < recipe.minQuality ? "text-red-500" : "text-indigo-600 dark:text-indigo-400") : "text-slate-400"}`,
                                  },
                                        /*#__PURE__*/ React.createElement("i", {
                                    className:
                                      "fa-solid fa-wand-magic-sparkles text-sm",
                                  }),
                                  quality > 0 ? quality : "-",
                                ),
                                      /*#__PURE__*/ React.createElement(
                                  "span",
                                  {
                                    className:
                                      "text-xs font-bold text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700",
                                  },
                                  t("goalLabel"),
                                  " ",
                                  recipe.minQuality,
                                ),
                              ),
                            ),
                                  /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className:
                                  "bg-slate-50 dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-700 flex flex-col justify-center",
                              },
                                    /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className:
                                    "text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1",
                                },
                                t("catalystLabel"),
                              ),
                              (() => {
                                const catName =
                                  recipe.catalyst === "none"
                                    ? t("noCatalyst")
                                    : recipe.catalyst;
                                const catObj = CATALYSTS.find(
                                  (c) =>
                                    c.name === catName ||
                                    c.name === recipe.catalyst,
                                );
                                return /*#__PURE__*/ React.createElement(
                                  "div",
                                  {
                                    className: "flex items-center gap-2",
                                  },
                                  catObj &&
                                  catObj.id !== "none" &&
                                          /*#__PURE__*/ React.createElement(
                                    ItemIcon,
                                    {
                                      id: catObj.id,
                                      name: catObj.name,
                                      size: "w-6 h-6 flex-shrink-0",
                                    },
                                  ),
                                        /*#__PURE__*/ React.createElement(
                                    "span",
                                    {
                                      className:
                                        "text-sm font-bold text-slate-800 dark:text-slate-200 truncate",
                                    },
                                    catName,
                                  ),
                                );
                              })(),
                            ),
                          ),
                                /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "mb-3 space-y-2",
                            },
                            [
                              {
                                name: "Feuer",
                                key: "fire",
                                color: "bg-red-500",
                                icon: /*#__PURE__*/ React.createElement(
                                  "i",
                                  {
                                    className: "fa-solid fa-fire text-sm",
                                  },
                                ),
                              },
                              {
                                name: "Erde",
                                key: "earth",
                                color: "bg-green-500",
                                icon: /*#__PURE__*/ React.createElement(
                                  "i",
                                  {
                                    className:
                                      "fa-solid fa-mountain text-sm",
                                  },
                                ),
                              },
                              {
                                name: "Luft",
                                key: "air",
                                color: "bg-yellow-400",
                                icon: /*#__PURE__*/ React.createElement(
                                  "i",
                                  {
                                    className: "fa-solid fa-wind text-sm",
                                  },
                                ),
                              },
                              {
                                name: "Wasser",
                                key: "water",
                                color: "bg-blue-500",
                                icon: /*#__PURE__*/ React.createElement(
                                  "i",
                                  {
                                    className:
                                      "fa-solid fa-droplet text-sm",
                                  },
                                ),
                              },
                            ].map((el) => {
                              const val = totals[el.key];
                              const percent = Math.min(
                                100,
                                (val / 400) * 100,
                              );
                              const isDominant =
                                dom ===
                                el.name
                                  .replace("Feuer", "Fire")
                                  .replace("Erde", "Earth")
                                  .replace("Luft", "Air")
                                  .replace("Wasser", "Water") &&
                                val > 0;
                              const minScore = recipe?.minScore || 0;
                              const minScorePct =
                                minScore > 0
                                  ? Math.min(100, (minScore / 400) * 100)
                                  : 0;
                              const isRequired =
                                recipe?.element?.toLowerCase() === el.key;
                              return /*#__PURE__*/ React.createElement(
                                "div",
                                {
                                  key: el.key,
                                  className: "flex items-center gap-2",
                                },
                                      /*#__PURE__*/ React.createElement(
                                  "div",
                                  {
                                    className: `w-7 h-7 rounded-full flex items-center justify-center text-white flex-shrink-0 ${el.color} ${isDominant ? "ring-4 ring-indigo-200 dark:ring-indigo-500/30 shadow-md scale-110" : "opacity-75"}`,
                                  },
                                  el.icon,
                                ),
                                      /*#__PURE__*/ React.createElement(
                                  "div",
                                  {
                                    className:
                                      "flex-1 h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden relative",
                                  },
                                  minScore > 0 &&
                                  isRequired &&
                                          /*#__PURE__*/ React.createElement(
                                    "div",
                                    {
                                      className:
                                        "absolute inset-y-0 left-0 rounded-full opacity-20 bg-violet-500",
                                      style: {
                                        width: `${minScorePct}%`,
                                      },
                                    },
                                  ),
                                        /*#__PURE__*/ React.createElement(
                                    "div",
                                    {
                                      className: `h-full ${el.color} transition-all duration-500 ease-out`,
                                      style: {
                                        width: `${percent}%`,
                                      },
                                    },
                                  ),
                                  minScore > 0 &&
                                  isRequired &&
                                          /*#__PURE__*/ React.createElement(
                                    "div",
                                    {
                                      className:
                                        "absolute inset-y-0 w-0.5 bg-violet-600 dark:bg-violet-400",
                                      style: {
                                        left: `${minScorePct}%`,
                                      },
                                    },
                                  ),
                                ),
                                      /*#__PURE__*/ React.createElement(
                                  "div",
                                  {
                                    className:
                                      "w-8 text-right text-xs font-bold text-slate-600 dark:text-slate-300",
                                  },
                                  val,
                                ),
                              );
                            }),
                          ),
                                /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: `rounded-2xl border-2 p-4 transition-all duration-500 relative overflow-hidden
                                                                                ${isValid ? "bg-gradient-to-br from-indigo-600 to-violet-700 border-indigo-400 text-white" : "bg-gradient-to-br from-red-600 to-orange-600 border-red-400 text-white"}`,
                            },
                                  /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className: "relative z-10",
                              },
                                    /*#__PURE__*/ React.createElement(
                                "h3",
                                {
                                  className:
                                    "text-[10px] font-bold uppercase tracking-wider mb-2 text-white/70",
                                },
                                t("resultTitle"),
                              ),
                                    /*#__PURE__*/ React.createElement(
                                "div",
                                {
                                  className:
                                    "flex items-center gap-3 mb-2",
                                },
                                      /*#__PURE__*/ React.createElement(
                                  "div",
                                  {
                                    className:
                                      "bg-white/20 p-1.5 rounded-xl backdrop-blur-sm",
                                  },
                                        /*#__PURE__*/ React.createElement(
                                    ItemIcon,
                                    {
                                      id:
                                        recipe.matchedRecipeId ??
                                        recipe.id,
                                      name: recipe.product,
                                      size: "w-9 h-9",
                                    },
                                  ),
                                ),
                                      /*#__PURE__*/ React.createElement(
                                  "span",
                                  {
                                    className:
                                      "text-xl font-black drop-shadow-md",
                                  },
                                  recipe.product,
                                ),
                              ),
                              isValid
                                ? /*#__PURE__*/ React.createElement(
                                  "p",
                                  {
                                    className:
                                      "text-indigo-200 font-medium flex items-center gap-2",
                                  },
                                  getElementIcon(
                                    recipe.element,
                                    "text-lg text-indigo-300",
                                  ),
                                  t("elementReached"),
                                  " ",
                                  recipe.element,
                                )
                                : /*#__PURE__*/ React.createElement(
                                  "div",
                                  {
                                    className:
                                      "bg-red-900/40 p-3 rounded-xl border border-red-300/30 backdrop-blur-sm",
                                  },
                                          /*#__PURE__*/ React.createElement(
                                    "p",
                                    {
                                      className:
                                        "text-red-100 font-semibold flex items-start gap-2 text-xs leading-snug",
                                    },
                                            /*#__PURE__*/ React.createElement(
                                      "i",
                                      {
                                        className:
                                          "fa-solid fa-circle-exclamation text-lg flex-shrink-0 mt-0.5 text-red-300",
                                      },
                                    ),
                                            /*#__PURE__*/ React.createElement(
                                      "span",
                                      {
                                        className:
                                          "flex flex-col gap-1",
                                      },
                                              /*#__PURE__*/ React.createElement(
                                        "span",
                                        {
                                          className:
                                            "text-white font-bold",
                                        },
                                        "Synthese wird fehlschlagen!",
                                      ),
                                      count < 4 &&
                                                /*#__PURE__*/ React.createElement(
                                        "span",
                                        null,
                                        "\u2022 Nur ",
                                        count,
                                        "/4 Slots besetzt.",
                                      ),
                                      dom === "Tie" &&
                                                /*#__PURE__*/ React.createElement(
                                        "span",
                                        null,
                                        "\u2022 ",
                                                  /*#__PURE__*/ React.createElement(
                                          "strong",
                                          {
                                            className: "text-white",
                                          },
                                          "Gleichstand",
                                        ),
                                        " bei den h\xF6chsten Elementen \u2013 eines muss dominieren.",
                                      ),
                                      dom !== "Tie" &&
                                      dom !== recipe.element &&
                                                /*#__PURE__*/ React.createElement(
                                        "span",
                                        null,
                                        "\u2022 Dominierendes Element: ",
                                                  /*#__PURE__*/ React.createElement(
                                          "strong",
                                          {
                                            className: "text-white",
                                          },
                                          dom === "None" ? "–" : dom,
                                        ),
                                        ", ben\xF6tigt: ",
                                                  /*#__PURE__*/ React.createElement(
                                          "strong",
                                          {
                                            className: "text-white",
                                          },
                                          recipe.element,
                                        ),
                                        ".",
                                      ),
                                      quality < recipe.minQuality &&
                                                /*#__PURE__*/ React.createElement(
                                        "span",
                                        null,
                                        "\u2022 Qualit\xE4t ",
                                                  /*#__PURE__*/ React.createElement(
                                          "strong",
                                          {
                                            className: "text-white",
                                          },
                                          quality,
                                        ),
                                        " zu niedrig, ben\xF6tigt: ",
                                                  /*#__PURE__*/ React.createElement(
                                          "strong",
                                          {
                                            className: "text-white",
                                          },
                                          recipe.minQuality,
                                        ),
                                        ".",
                                      ),
                                      recipe.minScore > 0 &&
                                      totals[
                                      recipe.element.toLowerCase()
                                      ] < recipe.minScore &&
                                                /*#__PURE__*/ React.createElement(
                                        "span",
                                        null,
                                        "\u2022 ",
                                        recipe.element,
                                        "-Wert ",
                                                  /*#__PURE__*/ React.createElement(
                                          "strong",
                                          {
                                            className: "text-white",
                                          },
                                          totals[
                                          recipe.element.toLowerCase()
                                          ],
                                        ),
                                        " zu niedrig, ben\xF6tigt: ",
                                                  /*#__PURE__*/ React.createElement(
                                          "strong",
                                          {
                                            className: "text-white",
                                          },
                                          recipe.minScore,
                                        ),
                                        ".",
                                      ),
                                    ),
                                  ),
                                ),
                            ),
                            isValid &&
                                    /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className:
                                  "absolute -bottom-8 -right-8 opacity-20 rotate-12 scale-125 pointer-events-none",
                              },
                                      /*#__PURE__*/ React.createElement("i", {
                                className:
                                  "fa-solid fa-vial text-[8rem] text-white",
                              }),
                            ),
                          ),
                        );
                      })(),
                    ),
                  );
                })(),
                    /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0",
                  },
                      /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: () => setSessionStep(1),
                      className:
                        "flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors",
                    },
                        /*#__PURE__*/ React.createElement("i", {
                      className: "fa-solid fa-arrow-left",
                    }),
                    " ",
                    t("back"),
                  ),
                  (() => {
                    const allValid = sessionRecipes.every((entry, i) => {
                      const recipe = [...RECIPES, ...customRecipes].find(
                        (r) => r.id === entry.recipeId,
                      );
                      if (!recipe) return false;
                      const slots =
                        i === sessionActiveIdx
                          ? sessionCauldron
                          : (entry.savedMaterials || []).map((id) =>
                            id != null
                              ? MATERIALS.find((m) => m.id === id) || null
                              : null,
                          );
                      const entryAgent = sessionAgents[i] ?? null;
                      let fire = 0,
                        earth = 0,
                        air = 0,
                        water = 0,
                        qualitySum = 0,
                        weightSum = 0,
                        count = 0;
                      slots.forEach((item, idx) => {
                        if (item) {
                          const w = idx === 0 ? 2 : 1;
                          fire += item.fire * w;
                          earth += item.earth * w;
                          air += item.air * w;
                          water += item.water * w;
                          qualitySum += item.quality * w;
                          weightSum += w;
                          count++;
                        }
                      });
                      const totals = {
                        fire: fire + (entryAgent?.fire ?? 0),
                        earth: earth + (entryAgent?.earth ?? 0),
                        air: air + (entryAgent?.air ?? 0),
                        water: water + (entryAgent?.water ?? 0),
                      };
                      const quality =
                        (weightSum > 0
                          ? Math.floor(qualitySum / weightSum)
                          : 0) + (entryAgent?.quality ?? 0);
                      const maxVal = Math.max(
                        totals.fire,
                        totals.earth,
                        totals.air,
                        totals.water,
                      );
                      let dom = "None";
                      if (maxVal > 0) {
                        const doms = [
                          ["Fire", totals.fire],
                          ["Earth", totals.earth],
                          ["Air", totals.air],
                          ["Water", totals.water],
                        ].filter(([, v]) => v === maxVal);
                        dom = doms.length === 1 ? doms[0][0] : "Tie";
                      }
                      const elKey = recipe.element.toLowerCase();
                      return (
                        count === 4 &&
                        dom === recipe.element &&
                        quality >= recipe.minQuality &&
                        (!(recipe.minScore > 0) ||
                          totals[elKey] >= recipe.minScore)
                      );
                    });
                    return /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        onClick: sessionGoToStep3,
                        disabled: !allValid,
                        title: !allValid
                          ? "Nicht alle Rezepte erfï¿½llen die Anforderungen"
                          : "",
                        className: `flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-colors ${allValid ? "bg-green-500 hover:bg-green-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"}`,
                      },
                      t("next"),
                      " ",
                          /*#__PURE__*/ React.createElement("i", {
                        className: "fa-solid fa-arrow-right",
                      }),
                    );
                  })(),
                ),
              ),
              sessionCraftPicker &&
                /*#__PURE__*/ React.createElement(
                "div",
                {
                  className:
                    "fixed inset-0 z-[70] flex items-center justify-center bg-black/40",
                  onClick: () => setSessionCraftPicker(null),
                },
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-5 min-w-[280px] max-w-sm",
                    onClick: (e) => e.stopPropagation(),
                  },
                    /*#__PURE__*/ React.createElement(
                    "p",
                    {
                      className:
                        "text-sm font-bold text-slate-700 dark:text-slate-200 mb-3",
                    },
                    "Rezept wählen für \u201E",
                    sessionCraftPicker.recipes[0]?.product,
                    "\u201C:",
                  ),
                  sessionCraftPicker.recipes.map((r) =>
                      /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      key: r.id,
                      onClick: () => {
                        setSessionRecipes((prev) => [
                          ...prev,
                          {
                            recipeId: r.id,
                            savedMaterials: null,
                            _id: Math.random().toString(36).slice(2, 10),
                            parentId: sessionCraftPicker.parentId ?? null,
                          },
                        ]);
                        setSessionCraftPicker(null);
                      },
                      className:
                        "w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 last:mb-0",
                    },
                        /*#__PURE__*/ React.createElement(ItemIcon, {
                      id: r.matchedRecipeId ?? r.id,
                      name: r.product,
                      size: "w-5 h-5",
                    }),
                    r.product,
                        /*#__PURE__*/ React.createElement(
                      "span",
                      {
                        className:
                          "ml-auto text-xs text-slate-400 font-normal",
                      },
                      r.rank,
                    ),
                  ),
                  ),
                    /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: () => setSessionCraftPicker(null),
                      className:
                        "mt-2 w-full text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-center py-1",
                    },
                    "Abbrechen",
                  ),
                ),
              ),
              sessionStep === 3 &&
                  /*#__PURE__*/ React.createElement(
                React.Fragment,
                null,
                    /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "px-6 pt-4 pb-2 flex-shrink-0",
                  },
                      /*#__PURE__*/ React.createElement(
                    "p",
                    {
                      className:
                        "text-sm text-slate-500 dark:text-slate-400",
                    },
                    t("step3Desc"),
                  ),
                ),
                    /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "flex-1 overflow-y-auto custom-scrollbar px-6 pb-4 min-h-0",
                  },
                      /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className: "mb-4",
                    },
                        /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className: "flex items-center justify-between mb-2",
                      },
                          /*#__PURE__*/ React.createElement(
                        "p",
                        {
                          className:
                            "text-xs font-bold uppercase tracking-wider text-slate-400",
                        },
                        t("reqMaterials"),
                      ),
                          /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className:
                            "flex p-0.5 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700",
                        },
                        [
                          ["none", t("splitModeNone")],
                          ["stock", t("splitModeStock")],
                          ["type", t("splitModeType")],
                        ].map(([mode, label]) =>
                              /*#__PURE__*/ React.createElement(
                          "button",
                          {
                            key: mode,
                            onClick: () => setMatSplitModeAndSave(mode),
                            className: `px-2 py-1 text-[10px] font-bold rounded-md transition-all ${matSplitMode === mode ? "bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`,
                          },
                          label,
                        ),
                        ),
                      ),
                    ),
                    Object.keys(sessionAllMaterials).length === 0
                      ? /*#__PURE__*/ React.createElement(
                        "p",
                        {
                          className: "text-sm text-slate-400 italic",
                        },
                        t("noMaterials"),
                      )
                      : (() => {
                        const noLager2 =
                          Object.keys(parsedLager).length === 0;
                        const allEntries = Object.entries(
                          sessionAllMaterials,
                        ).sort(
                          ([aId], [bId]) => parseInt(aId) - parseInt(bId),
                        );
                        const renderEntry = ([idStr, needed]) => {
                          const id = parseInt(idStr);
                          const mat = findItem(id);
                          const inLager = parsedLager[id] || 0;
                          const ok = noLager2 || inLager >= needed;
                          return /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              key: id,
                              className: `flex items-center gap-2 px-3 py-2 rounded-xl border ${noLager2 ? "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700" : ok ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"}`,
                            },
                                  /*#__PURE__*/ React.createElement(ItemIcon, {
                              id: id,
                              name: mat?.name || idStr,
                              size: "w-6 h-6 flex-shrink-0",
                            }),
                                  /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className:
                                  "flex-1 text-sm font-semibold text-slate-700 dark:text-slate-200 truncate",
                              },
                              mat?.name || `ID ${id}`,
                            ),
                                  /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className: `text-xs font-black flex-shrink-0 ${noLager2 ? "text-slate-500 dark:text-slate-400" : ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`,
                              },
                              !noLager2 && inLager > 0
                                ? `${inLager} / `
                                : "",
                              needed,
                            ),
                            !noLager2 &&
                                    /*#__PURE__*/ React.createElement("i", {
                              className: `fa-solid ${ok ? "fa-circle-check text-green-500" : "fa-circle-xmark text-red-400"} text-sm flex-shrink-0`,
                            }),
                                  /*#__PURE__*/ React.createElement(
                              "a",
                              {
                                href: `https://cp.arcadia-online.org/item/view/?id=${id}`,
                                target: "_blank",
                                rel: "noopener noreferrer",
                                onClick: (e) => e.stopPropagation(),
                                className:
                                  "flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors text-xs",
                                title: "Arcadia DB",
                              },
                                    /*#__PURE__*/ React.createElement("i", {
                                className: "fa-solid fa-database",
                              }),
                            ),
                                  /*#__PURE__*/ React.createElement(
                              "a",
                              {
                                href: `https://arcadia-market.de/sells/item_id/${id}`,
                                target: "_blank",
                                rel: "noopener noreferrer",
                                onClick: (e) => e.stopPropagation(),
                                className:
                                  "flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800/60 transition-colors text-xs",
                                title: "Arcadia Market",
                              },
                                    /*#__PURE__*/ React.createElement("i", {
                                className: "fa-solid fa-cart-shopping",
                              }),
                            ),
                          );
                        };
                        if (
                          matSplitMode === "none" ||
                          (matSplitMode === "stock" && noLager2)
                        ) {
                          return /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "space-y-1.5",
                            },
                            allEntries.map(renderEntry),
                          );
                        }
                        if (matSplitMode === "stock") {
                          const available = allEntries.filter(
                            ([idStr, needed]) =>
                              (parsedLager[parseInt(idStr)] || 0) >=
                              needed,
                          );
                          const missing = allEntries.filter(
                            ([idStr, needed]) =>
                              (parsedLager[parseInt(idStr)] || 0) <
                              needed,
                          );
                          return /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "space-y-3",
                            },
                            missing.length > 0 &&
                                    /*#__PURE__*/ React.createElement(
                              "div",
                              null,
                                      /*#__PURE__*/ React.createElement(
                                "p",
                                {
                                  className:
                                    "text-[10px] font-black uppercase tracking-wider text-red-500 dark:text-red-400 mb-1.5 flex items-center gap-1",
                                },
                                        /*#__PURE__*/ React.createElement("i", {
                                  className: "fa-solid fa-circle-xmark",
                                }),
                                " ",
                                t("stockMissing"),
                                " (",
                                missing.length,
                                ")",
                              ),
                                      /*#__PURE__*/ React.createElement(
                                "div",
                                {
                                  className: "space-y-1.5",
                                },
                                missing.map(renderEntry),
                              ),
                            ),
                            available.length > 0 &&
                                    /*#__PURE__*/ React.createElement(
                              "div",
                              null,
                                      /*#__PURE__*/ React.createElement(
                                "p",
                                {
                                  className:
                                    "text-[10px] font-black uppercase tracking-wider text-green-600 dark:text-green-400 mb-1.5 flex items-center gap-1",
                                },
                                        /*#__PURE__*/ React.createElement("i", {
                                  className: "fa-solid fa-circle-check",
                                }),
                                " ",
                                t("stockAvailable"),
                                " (",
                                available.length,
                                ")",
                              ),
                                      /*#__PURE__*/ React.createElement(
                                "div",
                                {
                                  className: "space-y-1.5",
                                },
                                available.map(renderEntry),
                              ),
                            ),
                          );
                        }
                        // mode === 'type'
                        const usable = allEntries.filter(
                          ([idStr]) =>
                            getStorageType(parseInt(idStr)) === "usable",
                        );
                        const etc = allEntries.filter(
                          ([idStr]) =>
                            getStorageType(parseInt(idStr)) === "etc",
                        );
                        return /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            className: "space-y-3",
                          },
                          usable.length > 0 &&
                                  /*#__PURE__*/ React.createElement(
                            "div",
                            null,
                                    /*#__PURE__*/ React.createElement(
                              "p",
                              {
                                className:
                                  "text-[10px] font-black uppercase tracking-wider text-indigo-500 dark:text-indigo-400 mb-1.5 flex items-center gap-1",
                              },
                                      /*#__PURE__*/ React.createElement("i", {
                                className:
                                  "fa-solid fa-hand-holding-heart",
                              }),
                              " ",
                              t("stockUsable"),
                              " (",
                              usable.length,
                              ")",
                            ),
                                    /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className: "space-y-1.5",
                              },
                              usable.map(renderEntry),
                            ),
                          ),
                          etc.length > 0 &&
                                  /*#__PURE__*/ React.createElement(
                            "div",
                            null,
                                    /*#__PURE__*/ React.createElement(
                              "p",
                              {
                                className:
                                  "text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1",
                              },
                                      /*#__PURE__*/ React.createElement("i", {
                                className: "fa-solid fa-box-archive",
                              }),
                              " ",
                              t("stockEtc"),
                              " (",
                              etc.length,
                              ")",
                            ),
                                    /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className: "space-y-1.5",
                              },
                              etc.map(renderEntry),
                            ),
                          ),
                        );
                      })(),
                  ),
                ),
                    /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0",
                  },
                      /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: () => setSessionStep(2),
                      className:
                        "flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors",
                    },
                        /*#__PURE__*/ React.createElement("i", {
                      className: "fa-solid fa-arrow-left",
                    }),
                    " ",
                    t("back"),
                  ),
                  (() => {
                    const allOk =
                      Object.keys(parsedLager).length === 0 ||
                      Object.entries(sessionAllMaterials).every(
                        ([idStr, needed]) =>
                          (parsedLager[parseInt(idStr)] || 0) >= needed,
                      );
                    const has = Object.keys(sessionAllMaterials).length > 0;
                    return /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        onClick: sessionGoToStep4,
                        disabled: !has,
                        className: `flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-colors ${has ? (allOk ? "bg-green-500 hover:bg-green-600 text-white" : "bg-amber-500 hover:bg-amber-600 text-white") : "bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed"}`,
                      },
                          /*#__PURE__*/ React.createElement("i", {
                        className: "fa-solid fa-hammer",
                      }),
                      allOk ? t("craftButton") : t("craftAnyway"),
                    );
                  })(),
                ),
              ),
              sessionStep === 4 &&
                  /*#__PURE__*/ React.createElement(
                React.Fragment,
                null,
                /*#__PURE__*/ React.createElement(
                  "div",
                  { className: "px-6 pt-4 pb-2 flex-shrink-0" },
                  /*#__PURE__*/ React.createElement(
                    "p",
                    { className: "text-sm text-slate-500 dark:text-slate-400" },
                    t("step4Desc"),
                  ),
                ),
                simplifiedCraftView
                  ? (() => {
                    const knownIds2 = new Set(
                      sessionRecipes.map((r) => r._id),
                    );
                    const childrenOf2 = {};
                    sessionRecipes.forEach((r, i) => {
                      if (r.parentId && knownIds2.has(r.parentId)) {
                        if (!childrenOf2[r.parentId])
                          childrenOf2[r.parentId] = [];
                        childrenOf2[r.parentId].push(i);
                      }
                    });
                    const craftOrder2 = [];
                    const visit2 = (idx) => {
                      (
                        childrenOf2[sessionRecipes[idx]._id] || []
                      ).forEach((ci) => visit2(ci));
                      craftOrder2.push(idx);
                    };
                    sessionRecipes.forEach((r, i) => {
                      if (!r.parentId || !knownIds2.has(r.parentId))
                        visit2(i);
                    });
                    const total = craftOrder2.length;
                    const safeIdx = Math.max(
                      0,
                      Math.min(sessionStep4RecipeIdx, total - 1),
                    );
                    const recipeIdx = craftOrder2[safeIdx] ?? 0;
                    const entry = sessionRecipes[recipeIdx];
                    const recipe = [
                      ...RECIPES,
                      ...customRecipes,
                    ].find((r) => r.id === entry?.recipeId);
                    const perMats =
                      sessionPerRecipeMaterials[recipeIdx] || {};
                    const hasLager =
                      Object.keys(parsedLager).length > 0;
                    const recipeOk =
                      !hasLager ||
                      Object.entries(perMats).every(
                        ([idStr, needed]) =>
                          (parsedLager[parseInt(idStr)] || 0) >= needed,
                      );
                    const renderSlots = (ent, rec, ri) => {
                      const pm = sessionPerRecipeMaterials[ri] || {};
                      const effectiveRank =
                        rec.rank === "Custom"
                          ? rec.customRank
                          : rec.rank;
                      const potionId = {
                        Basic: 645,
                        Intermediate: 656,
                        Advanced: 657,
                      }[effectiveRank];
                      const potionBase = potionId
                        ? POTION_BASE.find((p) => p.id === potionId)
                        : null;
                      const catObj = CATALYSTS.find(
                        (c) => c.name === rec.catalyst,
                      );
                      const slots = [];
                      if (potionBase)
                        slots.push({
                          type: t("potionBaseShort"),
                          id: potionBase.id,
                          name: potionBase.name,
                          needed: 2,
                        });
                      (ent.savedMaterials || []).forEach(
                        (matId, slotIdx) => {
                          const mat =
                            matId != null
                              ? MATERIALS.find((m) => m.id === matId)
                              : null;
                          slots.push({
                            type: `${t("ingredientShort")} ${slotIdx + 1}`,
                            id: matId,
                            name:
                              mat?.name ||
                              (matId != null ? `ID ${matId}` : "—"),
                            needed:
                              matId != null ? pm[matId] || 1 : 0,
                          });
                        },
                      );
                      if (catObj && catObj.id !== "none")
                        slots.push({
                          type: t("catalystShort"),
                          id: catObj.id,
                          name: catObj.name,
                          needed: pm[catObj.id] || 1,
                        });
                      const ra = sessionAgents[ri] ?? null;
                      if (ra)
                        slots.push({
                          type: t("agentLabel"),
                          id: ra.id,
                          name: ra.name,
                          needed: pm[ra.id] || 1,
                        });
                      return slots.map((slot, i) => {
                        const inLager =
                          slot.id != null
                            ? parsedLager[slot.id] || 0
                            : 0;
                        const noLag = !hasLager;
                        const ok =
                          noLag ||
                          slot.id == null ||
                          inLager >= slot.needed;
                        const isEmpty = slot.id == null;
                        const matType =
                          slot.id != null
                            ? MATERIALS.find((m) => m.id === slot.id)
                              ?.type
                            : null;
                        return /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            key: i,
                            className: `flex items-center gap-1.5 px-2 py-1.5 rounded-lg border ${isEmpty ? "bg-slate-50 dark:bg-slate-800 border-dashed border-slate-200 dark:border-slate-700 text-slate-400" : noLag ? "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400" : ok ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400"}`,
                          },
                          /*#__PURE__*/ React.createElement(
                            "span",
                            {
                              className:
                                "text-[9px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500 w-16 flex-shrink-0",
                            },
                            slot.type,
                          ),
                          matType &&
                            /*#__PURE__*/ React.createElement(
                            "span",
                            {
                              className:
                                "text-[9px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1 rounded flex-shrink-0 w-10 text-center",
                            },
                            matType,
                          ),
                          !isEmpty &&
                            /*#__PURE__*/ React.createElement(ItemIcon, {
                            id: slot.id,
                            name: slot.name,
                            size: "w-5 h-5 flex-shrink-0",
                          }),
                          /*#__PURE__*/ React.createElement(
                            "span",
                            {
                              className:
                                "flex-1 text-sm font-semibold truncate",
                            },
                            slot.name,
                          ),
                          !isEmpty &&
                            /*#__PURE__*/ React.createElement(
                            "span",
                            { className: "text-sm font-black flex-shrink-0" },
                            !noLag && inLager > 0
                              ? `${inLager} / `
                              : "",
                            slot.needed,
                          ),
                          !isEmpty &&
                          !noLag &&
                            /*#__PURE__*/ React.createElement("i", {
                            className: `fa-solid ${ok ? "fa-circle-check" : "fa-circle-xmark"} text-sm flex-shrink-0`,
                          }),
                        );
                      });
                    };
                    return /*#__PURE__*/ React.createElement(
                      React.Fragment,
                      null,
                      /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className:
                            "px-6 pb-2 flex-shrink-0 flex items-center justify-between",
                        },
                        /*#__PURE__*/ React.createElement(
                          "p",
                          {
                            className:
                              "text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500",
                          },
                          t("simplifiedCraftCount")
                            .replace("{current}", safeIdx + 1)
                            .replace("{total}", total),
                        ),
                      ),
                      /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className:
                            "flex-1 overflow-y-auto custom-scrollbar px-6 pb-4 min-h-0",
                        },
                        recipe &&
                          /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            className:
                              "rounded-xl border border-indigo-400 dark:border-indigo-500 overflow-hidden",
                          },
                            /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className:
                                "flex items-center gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/30",
                            },
                              /*#__PURE__*/ React.createElement(ItemIcon, {
                              id:
                                recipe?.matchedRecipeId ?? recipe?.id,
                              name: recipe?.product,
                              size: "w-7 h-7 flex-shrink-0",
                            }),
                              /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className:
                                  "flex-1 text-lg font-bold text-indigo-700 dark:text-indigo-300",
                              },
                              recipe?.product,
                            ),
                            hasLager &&
                                /*#__PURE__*/ React.createElement(
                              "i",
                              {
                                className: `fa-solid ${recipeOk ? "fa-circle-check text-green-500" : "fa-circle-xmark text-red-400"} text-base flex-shrink-0`,
                              },
                            ),
                          ),
                          Object.keys(perMats).length > 0 &&
                              /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className:
                                "border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 space-y-1.5",
                            },
                            renderSlots(entry, recipe, recipeIdx),
                          ),
                        ),
                      ),
                      /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className:
                            "px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0",
                        },
                        /*#__PURE__*/ React.createElement(
                          "button",
                          {
                            onClick: () =>
                              safeIdx > 0
                                ? setSessionStep4RecipeIdxPersist(safeIdx - 1)
                                : setSessionStep(3),
                            className:
                              "flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors",
                          },
                          /*#__PURE__*/ React.createElement("i", {
                            className: "fa-solid fa-arrow-left",
                          }),
                          " ",
                          t("back"),
                        ),
                        /*#__PURE__*/ React.createElement(
                          "button",
                          {
                            onClick: () =>
                              safeIdx < total - 1
                                ? setSessionStep4RecipeIdxPersist(safeIdx + 1)
                                : sessionGoToStep5(),
                            className:
                              "relative overflow-hidden flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-colors",
                            style: { backgroundColor: "#4338ca" },
                          },
                          /*#__PURE__*/ React.createElement("div", {
                            className: "absolute inset-0 transition-all duration-300",
                            style: {
                              backgroundColor: "#818cf8",
                              width: `${Math.round(((safeIdx + 1) / total) * 100)}%`,
                            },
                          }),
                          /*#__PURE__*/ React.createElement(
                            "span",
                            { className: "relative flex items-center gap-2" },
                            /*#__PURE__*/ React.createElement(
                              "span",
                              { className: "text-indigo-200 text-xs font-bold tabular-nums" },
                              `${safeIdx + 1}/${total}`,
                            ),
                            safeIdx < total - 1 ? t("next") : t("step5Label"),
                            " ",
                            /*#__PURE__*/ React.createElement("i", {
                              className: "fa-solid fa-arrow-right",
                            }),
                          ),
                        ),
                      ),
                    );
                  })()
                  : /*#__PURE__*/ React.createElement(
                    React.Fragment,
                    null,
                    /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className:
                          "flex-1 overflow-y-auto custom-scrollbar px-6 pb-4 min-h-0",
                      },
                      /*#__PURE__*/ React.createElement(
                        "div",
                        { className: "space-y-1.5" },
                        (() => {
                          const knownIds = new Set(
                            sessionRecipes.map((r) => r._id),
                          );
                          const childrenOf = {};
                          sessionRecipes.forEach((r, i) => {
                            if (r.parentId && knownIds.has(r.parentId)) {
                              if (!childrenOf[r.parentId])
                                childrenOf[r.parentId] = [];
                              childrenOf[r.parentId].push(i);
                            }
                          });
                          const craftOrder = [];
                          const visit = (idx) => {
                            (
                              childrenOf[sessionRecipes[idx]._id] || []
                            ).forEach((ci) => visit(ci));
                            craftOrder.push(idx);
                          };
                          sessionRecipes.forEach((r, i) => {
                            if (!r.parentId || !knownIds.has(r.parentId))
                              visit(i);
                          });
                          const getDepth = (r) => {
                            let d = 0,
                              pid = r.parentId;
                            while (pid && knownIds.has(pid)) {
                              d++;
                              pid = sessionRecipes.find(
                                (pr) => pr._id === pid,
                              )?.parentId;
                            }
                            return d;
                          };
                          const maxDepth = sessionRecipes.reduce(
                            (m, r) => Math.max(m, getDepth(r)),
                            0,
                          );
                          return craftOrder.map((recipeIdx) => {
                            const entry = sessionRecipes[recipeIdx];
                            const recipe = [
                              ...RECIPES,
                              ...customRecipes,
                            ].find((r) => r.id === entry.recipeId);
                            if (!recipe) return null;
                            const isExpanded =
                              sessionStep3ExpandedRecipes.has(
                                entry.recipeId,
                              );
                            const perMats =
                              sessionPerRecipeMaterials[recipeIdx] || {};
                            const hasLager =
                              Object.keys(parsedLager).length > 0;
                            const recipeOk =
                              !hasLager ||
                              Object.entries(perMats).every(
                                ([idStr, needed]) =>
                                  (parsedLager[parseInt(idStr)] || 0) >=
                                  needed,
                              );
                            const depth = getDepth(entry);
                            const hasChildren =
                              (childrenOf[entry._id] || []).length > 0;
                            const indent = hasChildren
                              ? (maxDepth - depth) * 16
                              : 0;
                            return /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                key: entry._id,
                                style:
                                  indent > 0
                                    ? { marginLeft: `${indent}px` }
                                    : undefined,
                                className: `rounded-xl border transition-all ${hasChildren ? "border-l-4 border-l-indigo-200 dark:border-l-indigo-700 " : ""}${isExpanded ? "border-indigo-400 dark:border-indigo-500" : "border-slate-200 dark:border-slate-700"}`,
                              },
                              /*#__PURE__*/ React.createElement(
                                "button",
                                {
                                  onClick: () =>
                                    setSessionStep3ExpandedRecipes(
                                      (prev) => {
                                        const s = new Set(prev);
                                        isExpanded
                                          ? s.delete(entry.recipeId)
                                          : s.add(entry.recipeId);
                                        return s;
                                      },
                                    ),
                                  className: `w-full flex items-center gap-2 px-3 py-2 rounded-t-xl transition-all ${isExpanded ? "bg-indigo-50 dark:bg-indigo-900/30" : "bg-slate-50 dark:bg-slate-900/30 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"}`,
                                },
                                hasChildren &&
                                  /*#__PURE__*/ React.createElement(
                                  "i",
                                  {
                                    className:
                                      "fa-solid fa-turn-up fa-rotate-90 text-[9px] text-indigo-400 flex-shrink-0",
                                  },
                                ),
                                /*#__PURE__*/ React.createElement(
                                  ItemIcon,
                                  {
                                    id:
                                      recipe?.matchedRecipeId ?? recipe?.id,
                                    name: recipe?.product,
                                    size: "w-5 h-5 flex-shrink-0",
                                  },
                                ),
                                /*#__PURE__*/ React.createElement(
                                  "span",
                                  {
                                    className: `flex-1 text-base font-bold text-left ${isExpanded ? "text-indigo-700 dark:text-indigo-300" : "text-slate-700 dark:text-slate-200"}`,
                                  },
                                  recipe?.product,
                                ),
                                hasLager &&
                                  /*#__PURE__*/ React.createElement("i", {
                                  className: `fa-solid ${recipeOk ? "fa-circle-check text-green-500" : "fa-circle-xmark text-red-400"} text-xs flex-shrink-0`,
                                }),
                                /*#__PURE__*/ React.createElement("i", {
                                  className: `fa-solid fa-chevron-${isExpanded ? "up" : "down"} text-xs text-slate-400 flex-shrink-0`,
                                }),
                              ),
                              isExpanded &&
                              Object.keys(perMats).length > 0 &&
                                /*#__PURE__*/ React.createElement(
                                "div",
                                {
                                  className:
                                    "border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 rounded-b-xl space-y-1",
                                },
                                (() => {
                                  const effectiveRank =
                                    recipe.rank === "Custom"
                                      ? recipe.customRank
                                      : recipe.rank;
                                  const potionId = {
                                    Basic: 645,
                                    Intermediate: 656,
                                    Advanced: 657,
                                  }[effectiveRank];
                                  const potionBase = potionId
                                    ? POTION_BASE.find(
                                      (p) => p.id === potionId,
                                    )
                                    : null;
                                  const catObj = CATALYSTS.find(
                                    (c) => c.name === recipe.catalyst,
                                  );
                                  const orderedSlots = [];
                                  if (potionBase)
                                    orderedSlots.push({
                                      type: t("potionBaseShort"),
                                      id: potionBase.id,
                                      name: potionBase.name,
                                      needed: 2,
                                    });
                                  (entry.savedMaterials || []).forEach(
                                    (matId, slotIdx) => {
                                      const mat =
                                        matId != null
                                          ? MATERIALS.find(
                                            (m) => m.id === matId,
                                          )
                                          : null;
                                      orderedSlots.push({
                                        type: `${t("ingredientShort")} ${slotIdx + 1}`,
                                        id: matId,
                                        name:
                                          mat?.name ||
                                          (matId != null
                                            ? `ID ${matId}`
                                            : "—"),
                                        needed:
                                          matId != null
                                            ? perMats[matId] || 1
                                            : 0,
                                      });
                                    },
                                  );
                                  if (catObj && catObj.id !== "none")
                                    orderedSlots.push({
                                      type: t("catalystShort"),
                                      id: catObj.id,
                                      name: catObj.name,
                                      needed: perMats[catObj.id] || 1,
                                    });
                                  const recipeAgent =
                                    sessionAgents[recipeIdx] ?? null;
                                  if (recipeAgent)
                                    orderedSlots.push({
                                      type: t("agentLabel"),
                                      id: recipeAgent.id,
                                      name: recipeAgent.name,
                                      needed:
                                        perMats[recipeAgent.id] || 1,
                                    });
                                  return orderedSlots.map((slot, i) => {
                                    const inLager =
                                      slot.id != null
                                        ? parsedLager[slot.id] || 0
                                        : 0;
                                    const noLag = !hasLager;
                                    const ok =
                                      noLag ||
                                      slot.id == null ||
                                      inLager >= slot.needed;
                                    const isEmpty = slot.id == null;
                                    const matType =
                                      slot.id != null
                                        ? MATERIALS.find(
                                          (m) => m.id === slot.id,
                                        )?.type
                                        : null;
                                    return /*#__PURE__*/ React.createElement(
                                      "div",
                                      {
                                        key: i,
                                        className: `flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs ${isEmpty ? "bg-slate-50 dark:bg-slate-800 border-dashed border-slate-200 dark:border-slate-700 text-slate-400" : noLag ? "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400" : ok ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400"}`,
                                      },
                                        /*#__PURE__*/ React.createElement(
                                        "span",
                                        {
                                          className:
                                            "text-[9px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500 w-16 flex-shrink-0",
                                        },
                                        slot.type,
                                      ),
                                      matType &&
                                          /*#__PURE__*/ React.createElement(
                                        "span",
                                        {
                                          className:
                                            "text-[9px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1 rounded flex-shrink-0 w-10 text-center",
                                        },
                                        matType,
                                      ),
                                      !isEmpty &&
                                          /*#__PURE__*/ React.createElement(
                                        ItemIcon,
                                        {
                                          id: slot.id,
                                          name: slot.name,
                                          size: "w-4 h-4 flex-shrink-0",
                                        },
                                      ),
                                        /*#__PURE__*/ React.createElement(
                                        "span",
                                        {
                                          className:
                                            "flex-1 font-semibold truncate",
                                        },
                                        slot.name,
                                      ),
                                      !isEmpty &&
                                          /*#__PURE__*/ React.createElement(
                                        "span",
                                        {
                                          className:
                                            "font-black flex-shrink-0",
                                        },
                                        !noLag && inLager > 0
                                          ? `${inLager} / `
                                          : "",
                                        slot.needed,
                                      ),
                                      !isEmpty &&
                                      !noLag &&
                                          /*#__PURE__*/ React.createElement(
                                        "i",
                                        {
                                          className: `fa-solid ${ok ? "fa-circle-check" : "fa-circle-xmark"} text-xs flex-shrink-0`,
                                        },
                                      ),
                                    );
                                  });
                                })(),
                              ),
                            );
                          });
                        })(),
                      ),
                    ),
                    /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className:
                          "px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0",
                      },
                      /*#__PURE__*/ React.createElement(
                        "button",
                        {
                          onClick: () => setSessionStep(3),
                          className:
                            "flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors",
                        },
                        /*#__PURE__*/ React.createElement("i", {
                          className: "fa-solid fa-arrow-left",
                        }),
                        " ",
                        t("back"),
                      ),
                      /*#__PURE__*/ React.createElement(
                        "button",
                        {
                          onClick: sessionGoToStep5,
                          className:
                            "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-indigo-500 hover:bg-indigo-600 text-white transition-colors",
                        },
                        t("next"),
                        " ",
                        /*#__PURE__*/ React.createElement("i", {
                          className: "fa-solid fa-arrow-right",
                        }),
                      ),
                    ),
                  ),
              ),
              sessionStep === 5 &&
                  /*#__PURE__*/ React.createElement(
                React.Fragment,
                null,
                    /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "px-6 pt-4 pb-2 flex-shrink-0",
                  },
                      /*#__PURE__*/ React.createElement(
                    "p",
                    {
                      className:
                        "text-sm text-slate-500 dark:text-slate-400",
                    },
                    t("step5Desc"),
                  ),
                ),
                simplifiedDelivery
                  ? (() => {
                    // Vereinfachte Ansicht: 2x2 Karten füllen die verfügbare Fläche
                    const selectedCount =
                      sessionDelivery.filter(Boolean).length;
                    const maxSelect = sessionRecipes.filter((r) => !r.parentId).length;
                    const selectedKeys = sessionDelivery
                      .filter(Boolean)
                      .map((n) => n.key);
                    const simplifiedOnSelect = (npc) => {
                      setSessionDelivery((prev) => {
                        const next = [...prev];
                        while (next.length < maxSelect) next.push(null);
                        const existingIdx = next.findIndex(
                          (n) => n?.key === npc.key,
                        );
                        if (existingIdx !== -1) {
                          next[existingIdx] = null;
                        } else if (selectedCount < maxSelect) {
                          const emptyIdx = next.findIndex(
                            (n) => n == null,
                          );
                          if (emptyIdx !== -1) next[emptyIdx] = npc;
                        }
                        return next;
                      });
                    };
                    return /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className:
                          "flex-1 flex flex-col min-h-0 px-3 pb-3 pt-2",
                      },
                            /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className:
                            "flex items-center justify-between mb-2 flex-shrink-0",
                        },
                              /*#__PURE__*/ React.createElement(
                          "p",
                          {
                            className:
                              "text-sm font-bold text-slate-700 dark:text-slate-200",
                          },
                          t("simplifiedDeliveryCount")
                            .replace("{n}", selectedCount)
                            .replace("{max}", maxSelect),
                        ),
                        selectedCount > 0 &&
                                /*#__PURE__*/ React.createElement(
                          "button",
                          {
                            onClick: () => setSessionDelivery([]),
                            className:
                              "text-xs text-red-500 dark:text-red-400 hover:underline",
                          },
                          lang === "de"
                            ? "Auswahl zurücksetzen"
                            : "Reset selection",
                        ),
                      ),
                            /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className:
                            "flex-1 grid grid-cols-2 min-h-0 gap-2",
                          style: {
                            gridTemplateRows: "1fr 1fr",
                          },
                        },
                        DELIVERY_LOCATIONS.map((loc) =>
                                /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            key: loc.key,
                            className: "flex flex-col min-h-0",
                          },
                                  /*#__PURE__*/ React.createElement(
                            "p",
                            {
                              className:
                                "text-[10px] font-bold text-center text-slate-500 dark:text-slate-400 flex-shrink-0 pb-0.5",
                            },
                            loc.label,
                          ),
                                  /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "relative flex-1 min-h-0",
                            },
                                    /*#__PURE__*/ React.createElement(MapView, {
                              fill: true,
                              loc: loc,
                              chosen: null,
                              highlightedKeys: selectedKeys,
                              onlyHighlighted: false,
                              onSelect: simplifiedOnSelect,
                            }),
                          ),
                        ),
                        ),
                      ),
                    );
                  })()
                  : /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className:
                        "flex-1 overflow-y-auto custom-scrollbar px-6 pb-4 min-h-0",
                    },
                          /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className: "space-y-5",
                      },
                      sessionRecipes.map((entry, recipeIdx) => {
                        if (entry.parentId) return null;
                        const recipe = [
                          ...RECIPES,
                          ...customRecipes,
                        ].find((r) => r.id === entry.recipeId);
                        const chosen = sessionDelivery[recipeIdx] ?? null;
                        const activeTab =
                          sessionDeliveryTab[recipeIdx] ?? 0;
                        return /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            key: entry.recipeId,
                            ref: (el) =>
                            (sessionDeliveryCardRefs.current[
                              recipeIdx
                            ] = el),
                            className:
                              "bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden",
                          },
                                /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className:
                                "flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800",
                            },
                                  /*#__PURE__*/ React.createElement(ItemIcon, {
                              id: recipe?.matchedRecipeId ?? recipe?.id,
                              name: recipe?.product,
                              size: "w-6 h-6 flex-shrink-0",
                            }),
                                  /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className:
                                  "font-bold text-sm text-slate-800 dark:text-slate-200 flex-1",
                              },
                              recipe?.product,
                            ),
                            chosen &&
                                    /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className:
                                  "text-xs font-bold text-green-600 dark:text-green-400 flex items-center gap-1",
                              },
                                      /*#__PURE__*/ React.createElement("i", {
                                className: "fa-solid fa-circle-check",
                              }),
                              " ",
                              chosen.name,
                              chosen.delivery_text
                                ? /*#__PURE__*/ React.createElement(
                                  "span",
                                  {
                                    className:
                                      "font-normal italic ml-1 opacity-75",
                                  },
                                  "\u2014 ",
                                  chosen.delivery_text,
                                )
                                : null,
                            ),
                          ),
                                /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "overflow-x-auto",
                            },
                                  /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className:
                                  "grid grid-cols-4 gap-2 px-3 pt-3 min-w-[420px]",
                              },
                              DELIVERY_LOCATIONS.map((loc, li) =>
                                      /*#__PURE__*/ React.createElement(
                                "div",
                                {
                                  key: loc.key,
                                  className:
                                    "flex flex-col gap-1 min-w-0",
                                },
                                        /*#__PURE__*/ React.createElement(
                                  "p",
                                  {
                                    className:
                                      "text-[10px] font-bold text-center text-slate-500 dark:text-slate-400 truncate",
                                  },
                                  loc.label,
                                ),
                                        /*#__PURE__*/ React.createElement(
                                  MapView,
                                  {
                                    loc: loc,
                                    chosen:
                                      chosen &&
                                        loc.npcs.some(
                                          (n) => n.key === chosen.key,
                                        )
                                        ? chosen
                                        : null,
                                    maxSize: 256,
                                    onSelect: (npc) => {
                                      setSessionDeliveryTab((prev) => {
                                        const next = [...prev];
                                        next[recipeIdx] = li;
                                        return next;
                                      });
                                      setSessionDelivery((prev) => {
                                        const isSelecting =
                                          prev[recipeIdx]?.key !==
                                          npc.key;
                                        const next = [...prev];
                                        next[recipeIdx] = isSelecting
                                          ? npc
                                          : null;
                                        if (isSelecting)
                                          scrollToNextDeliveryCard(
                                            recipeIdx,
                                          );
                                        return next;
                                      });
                                    },
                                  },
                                ),
                              ),
                              ),
                            ),
                          ),
                                /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className:
                                "flex border-b border-slate-200 dark:border-slate-700 mt-3",
                            },
                            DELIVERY_LOCATIONS.map((loc, li) =>
                                    /*#__PURE__*/ React.createElement(
                              "button",
                              {
                                key: loc.key,
                                onClick: () =>
                                  setSessionDeliveryTab((prev) => {
                                    const next = [...prev];
                                    next[recipeIdx] = li;
                                    return next;
                                  }),
                                className: `flex-1 py-2 text-xs font-bold transition-colors ${activeTab === li ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`,
                              },
                              loc.label,
                            ),
                            ),
                          ),
                                /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "p-3",
                            },
                                  /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className: "grid grid-cols-3 gap-2",
                              },
                              DELIVERY_LOCATIONS[activeTab].npcs.map(
                                (npc) => {
                                  const isChosen =
                                    chosen?.key === npc.key;
                                  return /*#__PURE__*/ React.createElement(
                                    "button",
                                    {
                                      key: npc.key,
                                      onClick: () => {
                                        if (!isChosen)
                                          scrollToNextDeliveryCard(
                                            recipeIdx,
                                          );
                                        setSessionDelivery((prev) => {
                                          const next = [...prev];
                                          next[recipeIdx] = isChosen
                                            ? null
                                            : npc;
                                          return next;
                                        });
                                      },
                                      className: `flex flex-row items-center gap-2 p-2 min-h-[4rem] rounded-xl border-2 text-xs font-semibold transition-all ${isChosen ? "bg-green-50 dark:bg-green-900/30 border-green-400 dark:border-green-600 text-green-700 dark:text-green-300" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-500"}`,
                                    },
                                          /*#__PURE__*/ React.createElement(
                                      NpcIcon,
                                      {
                                        npc: npc,
                                        size: "w-12 h-12",
                                        chosen: isChosen,
                                      },
                                    ),
                                          /*#__PURE__*/ React.createElement(
                                      "div",
                                      {
                                        className:
                                          "flex flex-col min-w-0",
                                      },
                                            /*#__PURE__*/ React.createElement(
                                        "span",
                                        {
                                          className:
                                            "leading-tight truncate",
                                        },
                                        npc.name,
                                      ),
                                      npc.delivery_text
                                        ? /*#__PURE__*/ React.createElement(
                                          "span",
                                          {
                                            className:
                                              "text-[10px] text-slate-500 dark:text-slate-400 italic leading-tight truncate",
                                          },
                                          npc.delivery_text,
                                        )
                                        : null,
                                            /*#__PURE__*/ React.createElement(
                                          "span",
                                          {
                                            className:
                                              "text-[10px] text-slate-400 dark:text-slate-500 font-mono leading-tight truncate",
                                          },
                                          npc.navi,
                                        ),
                                    ),
                                  );
                                },
                              ),
                            ),
                          ),
                        );
                      }),
                    ),
                  ),
                    /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className:
                        "px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0",
                    },
                      /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        onClick: () => setSessionStep(4),
                        className:
                          "flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors",
                      },
                        /*#__PURE__*/ React.createElement("i", {
                        className: "fa-solid fa-arrow-left",
                      }),
                      " ",
                      t("back"),
                    ),
                      /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        onClick: () => setSessionStep(6),
                        className:
                          "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-indigo-500 hover:bg-indigo-600 text-white transition-colors",
                      },
                      t("next"),
                      " ",
                        /*#__PURE__*/ React.createElement("i", {
                        className: "fa-solid fa-arrow-right",
                      }),
                    ),
                  ),
              ),
              sessionStep === 6 &&
                  /*#__PURE__*/ React.createElement(
                React.Fragment,
                null,
                    /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "px-6 pt-4 pb-2 flex-shrink-0",
                  },
                      /*#__PURE__*/ React.createElement(
                    "p",
                    {
                      className:
                        "text-sm text-slate-500 dark:text-slate-400",
                    },
                    t("navDesc"),
                  ),
                ),
                    /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "flex-1 overflow-y-auto custom-scrollbar px-6 pb-4 min-h-0",
                  },
                  (() => {
                    const activeLocData = DELIVERY_LOCATIONS.map((loc) => {
                      const entries = sessionRecipes
                        .map((entry, recipeIdx) => {
                          const chosen = sessionDelivery[recipeIdx] ?? null;
                          if (!chosen) return null;
                          const locMatch = loc.npcs.find(
                            (n) => n.key === chosen.key,
                          );
                          if (!locMatch) return null;
                          const recipe = [
                            ...RECIPES,
                            ...customRecipes,
                          ].find((r) => r.id === entry.recipeId);
                          const parts = chosen.navi.split(" ");
                          const naviCmd = `/navi ${parts[0]} ${parts[1]}/${parts[2]}`;
                          const copyKey = `${recipeIdx}-${chosen.key}`;
                          return {
                            recipe,
                            chosen,
                            locMatch,
                            naviCmd,
                            copyKey,
                          };
                        })
                        .filter(Boolean);
                      return {
                        loc,
                        entries,
                      };
                    }).filter(({ entries }) => entries.length > 0);
                    if (activeLocData.length === 0)
                      return /*#__PURE__*/ React.createElement(
                        "p",
                        {
                          className:
                            "text-sm text-slate-400 dark:text-slate-500 text-center py-4",
                        },
                        t("noNpcSelected"),
                      );
                    const count = activeLocData.length;
                    const gridCols =
                      count === 1 ? "grid-cols-1" : "grid-cols-2";
                    return /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className: `grid ${gridCols} gap-3`,
                      },
                      activeLocData.map(({ loc, entries }) =>
                            /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          key: loc.key,
                          className:
                            "bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden",
                        },
                              /*#__PURE__*/ React.createElement(
                          "p",
                          {
                            className:
                              "text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-3 pt-2 pb-1",
                          },
                          loc.label,
                        ),
                              /*#__PURE__*/ React.createElement(MapView, {
                          loc: loc,
                          chosen:
                            entries.length === 1
                              ? entries[0].chosen
                              : null,
                          highlightedKeys: entries.map(
                            (e) => e.chosen.key,
                          ),
                          onlyHighlighted: true,
                          onSelect: () => { },
                        }),
                              /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            className: "p-2 space-y-1.5",
                          },
                          entries.map(
                            ({
                              recipe,
                              chosen,
                              locMatch,
                              naviCmd,
                              copyKey,
                            }) => {
                              const wasCopied = copiedNaviKey === copyKey;
                              return /*#__PURE__*/ React.createElement(
                                "div",
                                {
                                  key: copyKey,
                                  className:
                                    "flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-2 py-1.5",
                                },
                                      /*#__PURE__*/ React.createElement(
                                  NpcIcon,
                                  {
                                    npc: locMatch,
                                    size: "w-8 h-8",
                                    chosen: true,
                                  },
                                ),
                                      /*#__PURE__*/ React.createElement(
                                  "div",
                                  {
                                    className: "flex-1 min-w-0",
                                  },
                                        /*#__PURE__*/ React.createElement(
                                    "div",
                                    {
                                      className:
                                        "flex items-baseline gap-1 min-w-0",
                                    },
                                          /*#__PURE__*/ React.createElement(
                                      "p",
                                      {
                                        className:
                                          "text-xs font-bold text-slate-700 dark:text-slate-200 truncate flex-shrink-0",
                                      },
                                      chosen.name,
                                    ),
                                    chosen.delivery_text
                                      ? /*#__PURE__*/ React.createElement(
                                        "p",
                                        {
                                          className:
                                            "text-[10px] text-slate-400 dark:text-slate-500 italic truncate",
                                        },
                                        chosen.delivery_text,
                                      )
                                      : null,
                                  ),
                                        /*#__PURE__*/ React.createElement(
                                    "p",
                                    {
                                      className:
                                        "text-[10px] text-slate-500 dark:text-slate-400 truncate",
                                    },
                                    recipe?.product,
                                  ),
                                        /*#__PURE__*/ React.createElement(
                                    "p",
                                    {
                                      className:
                                        "text-[10px] font-mono text-indigo-600 dark:text-indigo-400 truncate",
                                    },
                                    naviCmd,
                                  ),
                                ),
                                      /*#__PURE__*/ React.createElement(
                                  "button",
                                  {
                                    onClick: () =>
                                      copyNavi(chosen, copyKey),
                                    className: `flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex-shrink-0 ${wasCopied ? "bg-green-500 text-white" : "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-800/60"}`,
                                  },
                                        /*#__PURE__*/ React.createElement("i", {
                                    className: `fa-solid ${wasCopied ? "fa-check" : "fa-location-dot"}`,
                                  }),
                                  wasCopied
                                    ? t("copiedBtn")
                                    : t("navigateBtn"),
                                ),
                              );
                            },
                          ),
                        ),
                      ),
                      ),
                    );
                  })(),
                ),
                    /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0",
                  },
                      /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: () => {
                        setSessionDeliveryTab(
                          sessionRecipes.map((_, i) =>
                            tabForNpc(sessionDelivery[i] ?? null),
                          ),
                        );
                        setSessionStep(5);
                      },
                      className:
                        "flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors",
                    },
                        /*#__PURE__*/ React.createElement("i", {
                      className: "fa-solid fa-arrow-left",
                    }),
                    " ",
                    t("back"),
                  ),
                      /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className: "flex items-center gap-2",
                    },
                        /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        onClick: sessionConfirm,
                        className:
                          "flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/60 transition-colors",
                      },
                          /*#__PURE__*/ React.createElement("i", {
                        className: "fa-solid fa-truck-fast",
                      }),
                      " ",
                      t("deliveryDone"),
                    ),
                        /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        onClick: () => {
                          // Lager abbuchen falls vorhanden
                          if (
                            Object.keys(parsedLager).length > 0 &&
                            Object.keys(sessionAllMaterials).length > 0
                          ) {
                            const newMap = {
                              ...parsedLager,
                            };
                            Object.entries(sessionAllMaterials).forEach(
                              ([idStr, needed]) => {
                                const id = parseInt(idStr);
                                newMap[id] = Math.max(
                                  0,
                                  (newMap[id] || 0) - needed,
                                );
                                if (newMap[id] === 0) delete newMap[id];
                              },
                            );
                            setParsedLager(newMap);
                            try {
                              localStorage.setItem(
                                "alchemyLagerData",
                                JSON.stringify(newMap),
                              );
                            } catch { }
                          }
                          // Session zurücksetzen, Modal bleibt offen
                          try {
                            localStorage.removeItem("alchemySession");
                          } catch { }
                          setSessionRecipes([]);
                          setSessionStep(1);
                          setSessionMaxStep(1);
                          setSessionSearch("");
                          setSessionCauldron([null, null, null, null]);
                          setSessionActiveIdx(0);
                          setSessionDelivery([]);
                          setSessionDeliveryTab([]);
                          setSessionAgents([]);
                        },
                        className:
                          "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-green-500 hover:bg-green-600 text-white transition-colors",
                      },
                          /*#__PURE__*/ React.createElement("i", {
                        className: "fa-solid fa-rotate-right",
                      }),
                      " ",
                      t("newSession"),
                    ),
                  ),
                ),
              ),
            ),
          ),
          sessionOpen &&
          sessionSwapSlotIndex !== null &&
          (() => {
            const entry = sessionRecipes[sessionActiveIdx];
            const recipe = entry
              ? [...RECIPES, ...customRecipes].find(
                (r) => r.id === entry.recipeId,
              )
              : null;
            const reqType = recipe?.ingredients?.[sessionSwapSlotIndex];
            const reqElement = recipe?.element;
            return /*#__PURE__*/ React.createElement(
              "div",
              {
                className:
                  "fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4",
              },
                /*#__PURE__*/ React.createElement(
                "div",
                {
                  className:
                    "bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[30vw] flex flex-col h-[75vh] border border-slate-200 dark:border-slate-700",
                },
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 flex-shrink-0 rounded-t-2xl",
                  },
                    /*#__PURE__*/ React.createElement(
                    "div",
                    null,
                      /*#__PURE__*/ React.createElement(
                      "h3",
                      {
                        className:
                          "text-lg font-bold text-slate-800 dark:text-slate-100",
                      },
                      t("ingredientModalAlt"),
                    ),
                      /*#__PURE__*/ React.createElement(
                      "p",
                      {
                        className:
                          "text-sm text-slate-500 dark:text-slate-400 mt-0.5",
                      },
                      reqType
                        ? /*#__PURE__*/ React.createElement(
                          React.Fragment,
                          null,
                          t("ingredientRequired"),
                          " ",
                              /*#__PURE__*/ React.createElement(
                            "span",
                            {
                              className:
                                "font-bold text-indigo-600 dark:text-indigo-400 uppercase",
                            },
                            "[",
                            reqType,
                            "]",
                          ),
                        )
                        : t("ingredientFree"),
                      reqElement &&
                          /*#__PURE__*/ React.createElement(
                        "span",
                        {
                          className: "ml-2 font-bold uppercase",
                        },
                            /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className:
                              "text-slate-400 dark:text-slate-500 font-normal",
                          },
                          lang === "de"
                            ? "Benötigtes Element:"
                            : "Required Element:",
                        ),
                        " ",
                            /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className: `${{
                              fire: "text-red-500",
                              earth: "text-green-600",
                              air: "text-yellow-500",
                              water: "text-blue-500",
                            }[reqElement] ?? "text-slate-500"
                              }`,
                          },
                          "[",
                          reqElement,
                          "]",
                        ),
                      ),
                    ),
                  ),
                    /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: () => {
                        setSessionSwapSlotIndex(null);
                        setSessionSwapElementFilter(null);
                        setSessionSwapQualityFilter(null);
                      },
                      className:
                        "p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 dark:text-slate-400",
                    },
                      /*#__PURE__*/ React.createElement("i", {
                      className: "fa-solid fa-xmark text-xl",
                    }),
                  ),
                ),
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "p-4 flex-shrink-0",
                  },
                    /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className: "flex gap-2 flex-wrap items-center",
                    },
                    [
                      {
                        key: null,
                        label: t("all"),
                        icon: null,
                        cls: "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600",
                        activeCls:
                          "bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-800 border-slate-700",
                      },
                      {
                        key: "fire",
                        label: t("elemFire"),
                        icon: "fa-fire",
                        cls: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50",
                        activeCls: "bg-red-500 text-white border-red-500",
                      },
                      {
                        key: "earth",
                        label: t("elemEarth"),
                        icon: "fa-mountain",
                        cls: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/50",
                        activeCls: "bg-green-600 text-white border-green-600",
                      },
                      {
                        key: "air",
                        label: t("elemAir"),
                        icon: "fa-wind",
                        cls: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/50",
                        activeCls:
                          "bg-yellow-400 text-white border-yellow-400",
                      },
                      {
                        key: "water",
                        label: t("elemWater"),
                        icon: "fa-droplet",
                        cls: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50",
                        activeCls: "bg-blue-500 text-white border-blue-500",
                      },
                    ].map((f) => {
                      const isActive =
                        f.key === null
                          ? sessionSwapElementFilter === null &&
                          sessionSwapQualityFilter === null
                          : sessionSwapElementFilter === f.key;
                      return /*#__PURE__*/ React.createElement(
                        "button",
                        {
                          key: String(f.key),
                          onClick: () => {
                            setSessionSwapElementFilter(
                              isActive ? null : f.key,
                            );
                            setSessionSwapQualityFilter(null);
                          },
                          className: `flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${isActive ? f.activeCls : f.cls}`,
                        },
                        f.icon &&
                            /*#__PURE__*/ React.createElement("i", {
                          className: `fa-solid ${f.icon} text-xs`,
                        }),
                        f.label,
                      );
                    }),
                      /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className: "flex gap-2 items-center flex-shrink-0",
                      },
                        /*#__PURE__*/ React.createElement("div", {
                        className: "w-px h-5 bg-slate-300 dark:bg-slate-600",
                      }),
                      [10, 30, 50, 70, 90].map((q) => {
                        const isActive = sessionSwapQualityFilter === q;
                        return /*#__PURE__*/ React.createElement(
                          "button",
                          {
                            key: q,
                            onClick: () => {
                              setSessionSwapQualityFilter(
                                isActive ? null : q,
                              );
                              setSessionSwapElementFilter(null);
                            },
                            className: `flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all
                                                                            ${isActive ? "bg-slate-600 dark:bg-slate-300 text-white dark:text-slate-800 border-slate-600 dark:border-slate-300" : "bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-500 text-slate-600 dark:text-slate-300 hover:border-slate-400"}`,
                          },
                            /*#__PURE__*/ React.createElement("i", {
                            className:
                              "fa-solid fa-wand-magic-sparkles text-[10px]",
                          }),
                          q,
                        );
                      }),
                    ),
                  ),
                ),
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "flex-1 overflow-y-auto custom-scrollbar p-4 pt-0 min-h-0",
                  },
                    /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className: "flex flex-col gap-3",
                    },
                    MATERIALS.filter(
                      (m) =>
                        !disabledItems.has(m.id) ||
                        sessionSwapOriginalItem?.id === m.id,
                    )
                      .filter((m) => (reqType ? m.type === reqType : true))
                      .filter((m) => {
                        if (!sessionSwapElementFilter) return true;
                        const maxStat = Math.max(
                          m.fire,
                          m.earth,
                          m.air,
                          m.water,
                        );
                        return (
                          maxStat > 0 &&
                          m[sessionSwapElementFilter] === maxStat
                        );
                      })
                      .filter(
                        (m) =>
                          sessionSwapQualityFilter === null ||
                          m.quality === sessionSwapQualityFilter,
                      )
                      .sort((a, b) => a.quality - b.quality)
                      .map((material) => {
                        const maxStat = Math.max(
                          material.fire,
                          material.earth,
                          material.air,
                          material.water,
                        );
                        const lagerAmt = parsedLager[material.id] || 0;
                        let dynamicBg =
                          "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-400";
                        if (maxStat > 0) {
                          if (material.fire === maxStat)
                            dynamicBg =
                              "bg-red-50/80 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 hover:border-red-400";
                          else if (material.earth === maxStat)
                            dynamicBg =
                              "bg-green-50/80 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 hover:border-green-400";
                          else if (material.air === maxStat)
                            dynamicBg =
                              "bg-yellow-50/80 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800/50 hover:border-yellow-400";
                          else
                            dynamicBg =
                              "bg-blue-50/80 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 hover:border-blue-400";
                        }
                        return /*#__PURE__*/ React.createElement(
                          "button",
                          {
                            key: material.id,
                            onClick: () => {
                              setSessionCauldron((prev) => {
                                const c = [...prev];
                                c[sessionSwapSlotIndex] = material;
                                return c;
                              });
                              setSessionSwapSlotIndex(null);
                              setSessionSwapElementFilter(null);
                              setSessionSwapQualityFilter(null);
                            },
                            className: `flex items-center justify-between p-3 border rounded-xl hover:shadow-md transition-all text-left gap-3 group ${dynamicBg}`,
                          },
                            /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "flex items-center gap-3",
                            },
                              /*#__PURE__*/ React.createElement(ItemIcon, {
                              id: material.id,
                              name: material.name,
                              size: "w-9 h-9 flex-shrink-0",
                            }),
                              /*#__PURE__*/ React.createElement(
                              "div",
                              null,
                                /*#__PURE__*/ React.createElement(
                                "p",
                                {
                                  className:
                                    "font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-indigo-700 dark:group-hover:text-indigo-400",
                                },
                                material.name,
                              ),
                              Object.keys(parsedLager).length > 0 &&
                                  /*#__PURE__*/ React.createElement(
                                "p",
                                {
                                  className: "text-[10px] text-slate-400",
                                },
                                t("lagerLabel"),
                                " ",
                                    /*#__PURE__*/ React.createElement(
                                  "span",
                                  {
                                    className:
                                      lagerAmt > 0
                                        ? "text-green-600 dark:text-green-400 font-bold"
                                        : "text-red-500 font-bold",
                                  },
                                  lagerAmt,
                                ),
                              ),
                            ),
                          ),
                            /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "flex gap-1.5 flex-shrink-0",
                            },
                            [
                              ["fa-fire", "text-red-500", material.fire],
                              ["fa-droplet", "text-blue-500", material.water],
                              ["fa-wind", "text-yellow-500", material.air],
                              [
                                "fa-mountain",
                                "text-green-600",
                                material.earth,
                              ],
                            ].map(([icon, color, val]) =>
                                /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                key: icon,
                                className: `flex items-center gap-1 py-1 rounded-lg bg-white/60 dark:bg-slate-700/60 text-xs font-bold w-12 justify-center ${color}`,
                              },
                                  /*#__PURE__*/ React.createElement("i", {
                                className: `fa-solid ${icon} text-[10px]`,
                              }),
                              val,
                            ),
                            ),
                              /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className: `flex items-center gap-1 py-1 rounded-lg border text-xs font-bold w-12 justify-center
                                                                                ${material.quality > 0 ? "bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-500 text-indigo-500 dark:text-indigo-400" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600"}`,
                              },
                                /*#__PURE__*/ React.createElement("i", {
                                className:
                                  "fa-solid fa-wand-magic-sparkles text-[10px]",
                              }),
                              material.quality,
                            ),
                          ),
                        );
                      }),
                  ),
                ),
              ),
            );
          })(),
          sessionOpen &&
          sessionAgentModalOpen &&
            /*#__PURE__*/ React.createElement(
            "div",
            {
              className:
                "fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4",
            },
              /*#__PURE__*/ React.createElement(
              "div",
              {
                className:
                  "bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] border border-slate-200 dark:border-slate-700",
              },
                /*#__PURE__*/ React.createElement(
                "div",
                {
                  className:
                    "p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 flex-shrink-0 rounded-t-2xl",
                },
                  /*#__PURE__*/ React.createElement(
                  "div",
                  null,
                    /*#__PURE__*/ React.createElement(
                    "h3",
                    {
                      className:
                        "text-lg font-bold text-slate-800 dark:text-slate-100",
                    },
                    t("agentModal"),
                  ),
                    /*#__PURE__*/ React.createElement(
                    "p",
                    {
                      className:
                        "text-sm text-slate-500 dark:text-slate-400 mt-0.5",
                    },
                    t("agentModalDesc"),
                  ),
                ),
                  /*#__PURE__*/ React.createElement(
                  "button",
                  {
                    onClick: () => setSessionAgentModalOpen(false),
                    className:
                      "p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 dark:text-slate-400",
                  },
                    /*#__PURE__*/ React.createElement("i", {
                    className: "fa-solid fa-xmark text-xl",
                  }),
                ),
              ),
                /*#__PURE__*/ React.createElement(
                "div",
                {
                  className:
                    "flex-1 overflow-y-auto custom-scrollbar p-4 min-h-0",
                },
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "flex flex-col gap-2",
                  },
                    /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: () => {
                        setSessionAgent(null);
                        setSessionAgentModalOpen(false);
                      },
                      className: `flex items-center gap-4 p-4 border rounded-xl transition-all text-left hover:shadow-md ${sessionAgent === null ? "bg-slate-200 dark:bg-slate-600 border-slate-400 dark:border-slate-500" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-400"}`,
                    },
                      /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className:
                          "w-10 h-10 rounded-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center",
                      },
                        /*#__PURE__*/ React.createElement("i", {
                        className:
                          "fa-solid fa-ban text-slate-500 dark:text-slate-400 text-lg",
                      }),
                    ),
                      /*#__PURE__*/ React.createElement(
                      "span",
                      {
                        className:
                          "font-bold text-slate-700 dark:text-slate-200",
                      },
                      t("noAgent"),
                    ),
                  ),
                  ["Fire", "Earth", "Air", "Water"].map((element) => {
                    const elCfg = {
                      Fire: {
                        label: t("elemFire"),
                        icon: "fa-fire",
                        headerCls: "text-red-500",
                        activeCls:
                          "bg-red-100 dark:bg-red-900/30 border-red-400 dark:border-red-600",
                        hoverCls: "hover:border-red-300",
                      },
                      Earth: {
                        label: t("elemEarth"),
                        icon: "fa-mountain",
                        headerCls: "text-green-600",
                        activeCls:
                          "bg-green-100 dark:bg-green-900/30 border-green-500 dark:border-green-600",
                        hoverCls: "hover:border-green-300",
                      },
                      Air: {
                        label: t("elemAir"),
                        icon: "fa-wind",
                        headerCls: "text-yellow-500",
                        activeCls:
                          "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-400 dark:border-yellow-600",
                        hoverCls: "hover:border-yellow-300",
                      },
                      Water: {
                        label: t("elemWater"),
                        icon: "fa-droplet",
                        headerCls: "text-blue-500",
                        activeCls:
                          "bg-blue-100 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600",
                        hoverCls: "hover:border-blue-300",
                      },
                    }[element];
                    return /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        key: element,
                      },
                        /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className: `flex items-center gap-2 text-xs font-bold uppercase tracking-wider mt-3 mb-1 ${elCfg.headerCls}`,
                        },
                          /*#__PURE__*/ React.createElement("i", {
                          className: `fa-solid ${elCfg.icon}`,
                        }),
                        " ",
                        elCfg.label,
                      ),
                      AGENTS.filter(
                        (a) =>
                          a.element === element && !disabledItems.has(a.id),
                      ).map((agent) => {
                        const isActive = sessionAgent?.id === agent.id;
                        return /*#__PURE__*/ React.createElement(
                          "button",
                          {
                            key: agent.id,
                            onClick: () => {
                              setSessionAgent(agent);
                              setSessionAgentModalOpen(false);
                            },
                            className: `w-full flex items-center justify-between p-3 border rounded-xl transition-all text-left hover:shadow-md gap-3 mb-1
                                                                        ${isActive ? elCfg.activeCls : `bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 ${elCfg.hoverCls}`}`,
                          },
                            /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "flex items-center gap-3",
                            },
                              /*#__PURE__*/ React.createElement(ItemIcon, {
                              id: agent.id,
                              name: agent.name,
                              size: "w-9 h-9 flex-shrink-0",
                            }),
                              /*#__PURE__*/ React.createElement(
                              "div",
                              null,
                                /*#__PURE__*/ React.createElement(
                                "p",
                                {
                                  className:
                                    "font-bold text-sm text-slate-800 dark:text-slate-200",
                                },
                                agent.name,
                              ),
                            ),
                          ),
                            /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "flex gap-1.5 flex-shrink-0",
                            },
                            [
                              ["fa-fire", "text-red-500", agent.fire],
                              ["fa-droplet", "text-blue-500", agent.water],
                              ["fa-wind", "text-yellow-500", agent.air],
                              ["fa-mountain", "text-green-600", agent.earth],
                            ].map(([icon, color, val]) =>
                                /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                key: icon,
                                className: `flex items-center gap-1 py-1 rounded-lg bg-white/60 dark:bg-slate-700/60 text-xs font-bold w-12 justify-center ${val > 0 ? color : "text-slate-300 dark:text-slate-600"}`,
                              },
                                  /*#__PURE__*/ React.createElement("i", {
                                className: `fa-solid ${icon} text-[10px]`,
                              }),
                              val,
                            ),
                            ),
                              /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className: `flex items-center gap-1 py-1 rounded-lg border text-xs font-bold w-12 justify-center
                                                                                    ${agent.quality > 0 ? "bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-500 text-indigo-500 dark:text-indigo-400" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600"}`,
                              },
                                /*#__PURE__*/ React.createElement("i", {
                                className:
                                  "fa-solid fa-wand-magic-sparkles text-[10px]",
                              }),
                              agent.quality,
                            ),
                          ),
                        );
                      }),
                    );
                  }),
                ),
              ),
            ),
          ),
        ),
        /*#__PURE__*/ React.createElement(
          "div",
          {
            className:
              "grid grid-cols-1 lg:grid-cols-[3fr_7fr_5fr] gap-8 lg:items-stretch flex-1 min-h-0",
          },
          /*#__PURE__*/ React.createElement(
            "div",
            {
              className: "lg:col-span-1 flex flex-col gap-4 min-h-0 relative",
              style: {
                gridColumn: "1",
              },
              onMouseEnter: () => {
                lagerHovered.current = true;
              },
              onMouseLeave: () => {
                lagerHovered.current = false;
              },
            },
            /*#__PURE__*/ React.createElement(
              "div",
              {
                className:
                  "bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 flex flex-col transition-colors flex-1 min-h-0 relative",
              },
              lagerPasteToast !== null &&
                /*#__PURE__*/ React.createElement(
                "div",
                {
                  className: `absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg border text-sm font-bold pointer-events-none whitespace-nowrap
                                                ${lagerPasteToast > 0 ? "bg-green-50 dark:bg-green-900/80 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300" : "bg-amber-50 dark:bg-amber-900/80 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300"}`,
                },
                  /*#__PURE__*/ React.createElement("i", {
                  className: `fa-solid ${lagerPasteToast > 0 ? "fa-circle-check" : "fa-triangle-exclamation"}`,
                }),
                lagerPasteToast > 0
                  ? t("lagerPasteSuccess").replace("{n}", lagerPasteToast)
                  : t("lagerPasteNone"),
              ),
              /*#__PURE__*/ React.createElement(
                "div",
                {
                  className: "flex items-center justify-between mb-3",
                },
                /*#__PURE__*/ React.createElement(
                  "h2",
                  {
                    className:
                      "text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2",
                  },
                  /*#__PURE__*/ React.createElement("i", {
                    className:
                      "fa-solid fa-box-archive text-indigo-500 dark:text-indigo-400",
                  }),
                  " ",
                  t("lagerTab"),
                ),
                /*#__PURE__*/ React.createElement(
                  "button",
                  {
                    onClick: () => setLagerOpen((o) => !o),
                    className:
                      "text-xs font-bold text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors flex items-center gap-1",
                    title: lagerOpen ? t("lagerClose") : t("lagerEdit"),
                  },
                  /*#__PURE__*/ React.createElement("i", {
                    className: `fa-solid ${lagerOpen ? "fa-eye" : "fa-pen"} text-sm`,
                  }),
                  lagerOpen ? t("lagerPreview") : t("lagerEditBtn"),
                ),
              ),
              lagerOpen
                ? /*#__PURE__*/ React.createElement(
                  React.Fragment,
                  null,
                    /*#__PURE__*/ React.createElement(
                    "p",
                    {
                      className:
                        "text-xs text-slate-400 dark:text-slate-500 mb-2",
                    },
                    "Format: ",
                      /*#__PURE__*/ React.createElement(
                      "code",
                      {
                        className:
                          "bg-slate-100 dark:bg-slate-700 px-1 rounded",
                      },
                      "ID\\tName\\tMenge\\t...",
                    ),
                  ),
                    /*#__PURE__*/ React.createElement("textarea", {
                    className:
                      "flex-1 w-full text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-300 resize-none custom-scrollbar",
                    value: lagerText,
                    onChange: (e) => saveLager(e.target.value),
                    placeholder: `501\tRed Potion\t340\t[None]\tNone\tMaster Storage`,
                  }),
                )
                : /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-1 min-h-0",
                  },
                  Object.keys(parsedLager).length === 0
                    ? /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className:
                          "flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-600",
                      },
                          /*#__PURE__*/ React.createElement("i", {
                        className:
                          "fa-solid fa-box-open text-4xl mb-2 opacity-20",
                      }),
                          /*#__PURE__*/ React.createElement(
                        "p",
                        {
                          className: "text-sm",
                        },
                        t("lagerEmpty"),
                      ),
                          /*#__PURE__*/ React.createElement(
                        "button",
                        {
                          onClick: () => setLagerOpen(true),
                          className:
                            "mt-2 text-xs text-indigo-400 hover:text-indigo-600 font-semibold",
                        },
                        t("enterItems"),
                      ),
                    )
                    : Object.entries(parsedLager)
                      .sort(([a], [b]) => {
                        const PINNED = [645, 656, 657];
                        const ia = PINNED.indexOf(parseInt(a));
                        const ib = PINNED.indexOf(parseInt(b));
                        if (ia !== -1 && ib !== -1) return ia - ib;
                        if (ia !== -1) return -1;
                        if (ib !== -1) return 1;
                        const na = findItem(parseInt(a))?.name || "";
                        const nb = findItem(parseInt(b))?.name || "";
                        return na.localeCompare(nb);
                      })
                      .map(([idStr, amount]) => {
                        const id = parseInt(idStr);
                        const mat = findItem(id);
                        return /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            key: id,
                            className:
                              "flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors",
                          },
                              /*#__PURE__*/ React.createElement(ItemIcon, {
                            id: id,
                            name: mat?.name || idStr,
                            size: "w-7 h-7 flex-shrink-0",
                          }),
                              /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "flex-1 min-w-0",
                            },
                                /*#__PURE__*/ React.createElement(
                              "p",
                              {
                                className:
                                  "text-xs font-semibold text-slate-700 dark:text-slate-200 truncate",
                              },
                              mat?.name || `ID ${id}`,
                            ),
                            mat &&
                                  /*#__PURE__*/ React.createElement(
                              "p",
                              {
                                className:
                                  "text-[10px] text-slate-400 dark:text-slate-500",
                              },
                              mat.type,
                            ),
                          ),
                              /*#__PURE__*/ React.createElement(
                            "span",
                            {
                              className:
                                "text-xs font-black text-indigo-600 dark:text-indigo-400 flex-shrink-0",
                            },
                            "\xD7",
                            amount,
                          ),
                        );
                      }),
                ),
              Object.keys(parsedLager).length > 0 &&
              !lagerOpen &&
                /*#__PURE__*/ React.createElement(
                "button",
                {
                  onClick: () => setStockAlertOpen(true),
                  className:
                    "mt-2 flex-shrink-0 w-full flex items-center justify-center gap-2 py-1.5 rounded-xl text-xs font-bold border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors",
                },
                  /*#__PURE__*/ React.createElement("i", {
                  className: "fa-solid fa-triangle-exclamation",
                }),
                t("stockAlertBtn"),
              ),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            "div",
            {
              className:
                "lg:col-span-1 flex flex-col gap-4 min-h-0 overflow-hidden",
              style: {
                gridColumn: "2",
              },
            },
            /*#__PURE__*/ React.createElement(
              "div",
              {
                className:
                  "bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex-1 flex flex-col transition-colors min-h-0",
              },
              /*#__PURE__*/ React.createElement(
                "div",
                {
                  className:
                    "flex gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl mb-5 transition-colors",
                },
                /*#__PURE__*/ React.createElement(
                  "button",
                  {
                    onClick: () => {
                      setIsCustomMode(false);
                      setCartOpen(false);
                    },
                    className: `flex-1 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${!isCustomMode && !cartOpen ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`,
                  },
                  /*#__PURE__*/ React.createElement("i", {
                    className: "fa-solid fa-book-open text-sm",
                  }),
                  " ",
                  t("recipes"),
                ),
                /*#__PURE__*/ React.createElement(
                  "button",
                  {
                    onClick: () => {
                      setCartOpen(true);
                      setIsCustomMode(false);
                    },
                    className: `flex-1 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${cartOpen ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`,
                  },
                  /*#__PURE__*/ React.createElement("i", {
                    className: "fa-solid fa-cart-shopping text-sm",
                  }),
                  " ",
                  t("productionPlan"),
                  cart.length > 0 &&
                    /*#__PURE__*/ React.createElement(
                    "span",
                    {
                      className:
                        "bg-indigo-500 text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center leading-none",
                    },
                    cart.length,
                  ),
                ),
                /*#__PURE__*/ React.createElement(
                  "button",
                  {
                    onClick: switchToCustomMode,
                    className: `flex-1 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${isCustomMode ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`,
                  },
                  /*#__PURE__*/ React.createElement("i", {
                    className: "fa-solid fa-flask text-sm",
                  }),
                  " ",
                  t("ownRecipe"),
                ),
              ),
              !isCustomMode &&
              !cartOpen &&
                /*#__PURE__*/ React.createElement(
                React.Fragment,
                null,
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "mb-5",
                  },
                    /*#__PURE__*/ React.createElement(
                    "h2",
                    {
                      className:
                        "text-xl font-bold text-slate-800 dark:text-slate-100",
                    },
                    t("selectRecipeTitle"),
                  ),
                    /*#__PURE__*/ React.createElement(
                    "p",
                    {
                      className:
                        "text-sm text-slate-500 dark:text-slate-400 mt-1",
                    },
                    t("selectRecipeDescPre"),
                      /*#__PURE__*/ React.createElement(
                      "strong",
                      null,
                      t("selectRecipeDescBold"),
                    ),
                    ".",
                  ),
                ),
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "mb-4 space-y-3",
                  },
                    /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className: "relative",
                    },
                      /*#__PURE__*/ React.createElement("i", {
                      className:
                        "fa-solid fa-magnifying-glass text-xl absolute left-4 top-1/2 -translate-y-1/2 text-slate-400",
                    }),
                      /*#__PURE__*/ React.createElement("input", {
                      type: "text",
                      placeholder: t("recipeSearchPlaceholder"),
                      value: searchQuery,
                      onChange: (e) => setSearchQuery(e.target.value),
                      className:
                        "w-full pl-12 pr-10 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 text-slate-800 dark:text-slate-200 transition-colors",
                    }),
                    searchQuery &&
                        /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        onClick: () => setSearchQuery(""),
                        className:
                          "absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200",
                      },
                          /*#__PURE__*/ React.createElement("i", {
                        className: "fa-solid fa-xmark text-xl",
                      }),
                    ),
                  ),
                    /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className:
                        "flex gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl overflow-hidden transition-colors",
                    },
                    [
                      "All",
                      "Basic",
                      "Intermediate",
                      "Advanced",
                      "Custom",
                    ].map((rank) =>
                        /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        key: rank,
                        onClick: () => setFilterRank(rank),
                        className: `flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${filterRank === rank ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`,
                      },
                      rank === "All" ? t("all") : rank,
                    ),
                    ),
                  ),
                ),
                errorMsg &&
                    /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "mb-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-4 rounded-xl flex gap-3 text-sm border border-red-200 dark:border-red-800/50 transition-colors",
                  },
                      /*#__PURE__*/ React.createElement("i", {
                    className:
                      "fa-solid fa-circle-exclamation text-xl flex-shrink-0 mt-0.5 text-red-300",
                  }),
                      /*#__PURE__*/ React.createElement("p", null, errorMsg),
                ),
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "overflow-y-auto pr-2 space-y-3 flex-1 custom-scrollbar min-h-0",
                  },
                  displayedRecipes.length > 0
                    ? displayedRecipes.map((recipe, idx) => {
                      const isSelected =
                        selectedRecipe && selectedRecipe.id === recipe.id;
                      const isCustom = recipe.rank === "Custom";
                      const isFav = favorites.has(recipe.id);
                      const inCart = cart.some(
                        (i) => i.recipeId === recipe.id,
                      );
                      const cartQty = inCart
                        ? cart.find((i) => i.recipeId === recipe.id)
                          .quantity
                        : 0;
                      return /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          key: recipe.id ?? idx,
                          className: "relative",
                        },
                            /*#__PURE__*/ React.createElement(
                          "button",
                          {
                            onClick: (e) =>
                              handleToggleFavorite(recipe.id, e),
                            className: `absolute top-2 left-2 z-10 p-1 rounded-full transition-colors ${isFav ? "text-amber-400 hover:text-amber-500" : "text-slate-300 dark:text-slate-600 hover:text-amber-400"}`,
                            title: isFav
                              ? t("removeFromFav")
                              : t("addToFav"),
                          },
                              /*#__PURE__*/ React.createElement("i", {
                            className: `${isFav ? "fa-solid" : "fa-regular"} fa-star text-base`,
                          }),
                        ),
                            /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            className: `absolute bottom-2 right-2 z-10 flex items-center gap-0.5 ${isCustom ? "hidden" : ""}`,
                          },
                              /*#__PURE__*/ React.createElement(
                            "button",
                            {
                              onClick: (e) =>
                                handleCopyAsTemplate(recipe, e),
                              className:
                                "inline-flex items-center justify-center px-1.5 py-1 rounded-full text-violet-400 dark:text-violet-400 hover:text-violet-600 dark:hover:text-violet-300 transition-colors",
                              title: t("copyAsTemplate"),
                            },
                                /*#__PURE__*/ React.createElement("i", {
                              className: "fa-solid fa-copy text-sm",
                            }),
                          ),
                              /*#__PURE__*/ React.createElement(
                            "button",
                            {
                              onClick: (e) => handleAddToCart(recipe, e),
                              className: `flex items-center gap-1 px-1.5 py-1 rounded-full transition-colors ${inCart ? "bg-indigo-500 text-white hover:bg-indigo-600" : "text-slate-600 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400"}`,
                              title: t("addToCart"),
                            },
                                /*#__PURE__*/ React.createElement("i", {
                              className: "fa-solid fa-cart-plus text-sm",
                            }),
                            inCart &&
                                  /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className:
                                  "text-[10px] font-black leading-none",
                              },
                              cartQty,
                            ),
                          ),
                          inCart &&
                                /*#__PURE__*/ React.createElement(
                            "button",
                            {
                              onClick: (e) => {
                                e.stopPropagation();
                                setCart((prev) =>
                                  cartQty <= 1
                                    ? prev.filter(
                                      (i) => i.recipeId !== recipe.id,
                                    )
                                    : prev.map((i) =>
                                      i.recipeId === recipe.id
                                        ? {
                                          ...i,
                                          quantity: i.quantity - 1,
                                        }
                                        : i,
                                    ),
                                );
                              },
                              className:
                                "flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500 hover:bg-red-500 text-white font-black text-sm transition-colors",
                              title: t("decreaseRemove"),
                            },
                            "-",
                          ),
                        ),
                            /*#__PURE__*/ React.createElement(
                          "button",
                          {
                            onClick: () => handleSelectRecipe(recipe),
                            className: `w-full text-left pl-8 pr-20 py-4 border rounded-xl flex flex-col transition-all duration-200
                                        ${isSelected ? "bg-indigo-50 dark:bg-indigo-900/40 border-indigo-500 dark:border-indigo-400 shadow-md" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-sm"}`,
                          },
                              /*#__PURE__*/ React.createElement(
                            "div",
                            null,
                                /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className: "flex items-center gap-2 mb-1",
                              },
                                  /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className: `text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full ${isCustom ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300" : recipe.rank === "Basic" ? "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300" : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"}`,
                                },
                                recipe.rank,
                              ),
                              isCustom &&
                              recipe.customRank &&
                                    /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className: `text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full ${recipe.customRank === "Basic" ? "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300" : recipe.customRank === "Advanced" ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300" : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"}`,
                                },
                                recipe.customRank,
                              ),
                                  /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className: `text-[10px] font-bold px-2 py-0.5 rounded-full ${recipe.minQuality > 0 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`,
                                },
                                "Min Q: ",
                                recipe.minQuality,
                              ),
                              recipe.minScore > 0 &&
                                    /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className:
                                    "text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
                                },
                                "Min El: ",
                                recipe.minScore,
                              ),
                                  /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className:
                                    "text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400",
                                },
                                "Typ: ",
                                recipe.type,
                              ),
                            ),
                                /*#__PURE__*/ React.createElement(
                              "h4",
                              {
                                className: `font-bold text-lg flex items-center gap-3 ${isSelected ? "text-indigo-800 dark:text-indigo-300" : "text-slate-800 dark:text-slate-200"}`,
                              },
                                  /*#__PURE__*/ React.createElement(ItemIcon, {
                                id: recipe.matchedRecipeId ?? recipe.id,
                                name: recipe.product,
                                size: "w-7 h-7",
                              }),
                                  /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className: "flex items-center gap-2",
                                },
                                recipe.product,
                                isSelected &&
                                      /*#__PURE__*/ React.createElement("i", {
                                  className:
                                    "fa-regular fa-circle-check text-xl text-indigo-500 dark:text-indigo-400",
                                }),
                              ),
                            ),
                                /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className:
                                  "flex flex-wrap gap-1 mt-2 pl-10",
                              },
                              recipe.ingredients.map((ing, i) =>
                                    /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  key: i,
                                  className: `text-xs px-2 py-1 rounded-md font-medium ${isSelected ? "bg-indigo-100 dark:bg-indigo-800/60 text-indigo-700 dark:text-indigo-300" : "bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400"}`,
                                },
                                "[",
                                ing,
                                "]",
                              ),
                              ),
                            ),
                          ),
                        ),
                            /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            className:
                              "absolute top-3 right-3 z-10 flex flex-col items-end gap-1 pointer-events-none",
                          },
                              /*#__PURE__*/ React.createElement(
                            "span",
                            {
                              className: `px-2 py-0.5 rounded-full text-xs font-bold border ${getElementColor(recipe.element)}`,
                            },
                            recipe.element,
                          ),
                              /*#__PURE__*/ React.createElement(
                            "span",
                            {
                              className: "flex items-center gap-1 text-xs",
                            },
                                /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className:
                                  "text-slate-400 dark:text-slate-500",
                              },
                              t("catalystShort"),
                              ":",
                            ),
                                /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className:
                                  "font-semibold text-slate-600 dark:text-slate-300",
                              },
                              recipe.catalyst === "none" ||
                                recipe.catalyst === "(Keiner)"
                                ? t("noneLabel")
                                : recipe.catalyst,
                            ),
                          ),
                        ),
                        isCustom &&
                              /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            className:
                              "absolute bottom-2 right-2 z-10 flex items-center gap-0.5",
                          },
                                /*#__PURE__*/ React.createElement(
                            "button",
                            {
                              onClick: (e) =>
                                handleEditCustomRecipe(recipe, e),
                              className:
                                "inline-flex items-center justify-center px-1.5 py-1 rounded-full text-indigo-300 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors",
                              title: t("editRecipe"),
                            },
                                  /*#__PURE__*/ React.createElement("i", {
                              className: "fa-solid fa-pen text-sm",
                            }),
                          ),
                                /*#__PURE__*/ React.createElement(
                            "button",
                            {
                              onClick: (e) =>
                                handleDeleteCustomRecipe(recipe.id, e),
                              className:
                                "inline-flex items-center justify-center px-1.5 py-1 rounded-full text-red-300 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 transition-colors",
                              title: t("deleteRecipe"),
                            },
                                  /*#__PURE__*/ React.createElement("i", {
                              className: "fa-solid fa-trash text-sm",
                            }),
                          ),
                                /*#__PURE__*/ React.createElement(
                            "button",
                            {
                              onClick: (e) => handleAddToCart(recipe, e),
                              className: `flex items-center gap-1 px-1.5 py-1 rounded-full transition-colors ${inCart ? "bg-indigo-500 text-white hover:bg-indigo-600" : "text-slate-600 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400"}`,
                              title: t("addToCart"),
                            },
                                  /*#__PURE__*/ React.createElement("i", {
                              className: "fa-solid fa-cart-plus text-sm",
                            }),
                            inCart &&
                                    /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className:
                                  "text-[10px] font-black leading-none",
                              },
                              cartQty,
                            ),
                          ),
                          inCart &&
                                  /*#__PURE__*/ React.createElement(
                            "button",
                            {
                              onClick: (e) => {
                                e.stopPropagation();
                                setCart((prev) =>
                                  cartQty <= 1
                                    ? prev.filter(
                                      (i) => i.recipeId !== recipe.id,
                                    )
                                    : prev.map((i) =>
                                      i.recipeId === recipe.id
                                        ? {
                                          ...i,
                                          quantity: i.quantity - 1,
                                        }
                                        : i,
                                    ),
                                );
                              },
                              className:
                                "flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500 hover:bg-red-500 text-white font-black text-xs transition-colors",
                              title: t("decreaseRemove"),
                            },
                            "-",
                          ),
                        ),
                      );
                    })
                    : /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className:
                          "flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-600",
                      },
                          /*#__PURE__*/ React.createElement("i", {
                        className:
                          "fa-solid fa-magnifying-glass text-5xl mb-3 opacity-20",
                      }),
                          /*#__PURE__*/ React.createElement(
                        "p",
                        null,
                        t("noRecipesFound"),
                      ),
                    ),
                ),
              ),
              isCustomMode &&
              !cartOpen &&
                /*#__PURE__*/ React.createElement(
                React.Fragment,
                null,
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "mb-4 flex items-start justify-between gap-2",
                  },
                    /*#__PURE__*/ React.createElement(
                    "div",
                    null,
                      /*#__PURE__*/ React.createElement(
                      "h2",
                      {
                        className:
                          "text-xl font-bold text-slate-800 dark:text-slate-100",
                      },
                      activeCustomRecipeId
                        ? customRecipes.find(
                          (r) => r.id === activeCustomRecipeId,
                        )?.product || "Eigenes Rezept"
                        : "Eigenes Rezept",
                    ),
                      /*#__PURE__*/ React.createElement(
                      "p",
                      {
                        className:
                          "text-sm text-slate-500 dark:text-slate-400 mt-1",
                      },
                      activeCustomRecipeId
                        ? t("editSavedRecipe")
                        : t("customRecipeHint"),
                    ),
                  ),
                    /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: () => {
                        const existing = activeCustomRecipeId
                          ? customRecipes.find(
                            (r) => r.id === activeCustomRecipeId,
                          )
                          : null;
                        const matched = findMatchingRecipe(dominantElement);
                        // Vorhandenen Namen zeigen; bei neuem Rezept Match-Namen als Vorschlag
                        setSaveRecipeName(
                          existing?.product ?? matched?.product ?? "",
                        );
                        setSaveModalOpen(true);
                      },
                      title: t("saveCurrentRecipe"),
                      className:
                        "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-xl transition-all shadow-sm",
                    },
                      /*#__PURE__*/ React.createElement("i", {
                      className: "fa-solid fa-floppy-disk",
                    }),
                    " ",
                    t("saveBtn"),
                  ),
                ),
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "mb-4",
                  },
                    /*#__PURE__*/ React.createElement(
                    "h3",
                    {
                      className:
                        "text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2",
                    },
                    t("rankLabel"),
                  ),
                    /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className: "flex gap-2",
                    },
                    ["Basic", "Intermediate", "Advanced"].map((rank) =>
                        /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        key: rank,
                        onClick: () => setCustomRank(rank),
                        className: `flex-1 py-1.5 px-2 rounded-lg text-xs font-bold border transition-all ${customRank === rank ? "bg-indigo-500 border-indigo-500 text-white shadow-sm" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-500"}`,
                      },
                      rank,
                    ),
                    ),
                  ),
                ),
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "mb-5",
                  },
                    /*#__PURE__*/ React.createElement(
                    "h3",
                    {
                      className:
                        "text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2",
                    },
                    t("ingredientTypes"),
                  ),
                    /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className: "grid grid-cols-4 gap-1.5",
                    },
                    [0, 1, 2, 3].map((idx) => {
                      const type = customSlotTypes[idx];
                      const isMain = idx === 0;
                      return /*#__PURE__*/ React.createElement(
                        "button",
                        {
                          key: idx,
                          onClick: () => setTypePickerSlot(idx),
                          className: `relative flex flex-col items-center justify-center gap-1 p-2 pt-4 rounded-xl border-2 text-[10px] font-bold transition-all hover:shadow-md ${type ? "border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" : "border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 hover:border-indigo-300"}`,
                        },
                        isMain &&
                            /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className:
                              "absolute top-1 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[8px] px-1 py-0.5 rounded font-black leading-none whitespace-nowrap",
                          },
                          "MAIN",
                        ),
                        TYPE_ICONS[type]
                          ? /*#__PURE__*/ React.createElement(ItemIcon, {
                            id: TYPE_ICONS[type],
                            name: type,
                            size: "w-6 h-6",
                          })
                          : /*#__PURE__*/ React.createElement("i", {
                            className: "fa-solid fa-flask text-base",
                          }),
                          /*#__PURE__*/ React.createElement(
                            "span",
                            {
                              className: "truncate w-full text-center",
                            },
                            type || t("typePicker"),
                          ),
                      );
                    }),
                  ),
                ),
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "overflow-y-auto flex-1 custom-scrollbar pr-1",
                  },
                    /*#__PURE__*/ React.createElement(
                    "h3",
                    {
                      className:
                        "text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3",
                    },
                    t("catalystLabel"),
                  ),
                    /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className: "flex flex-col gap-2",
                    },
                    CATALYSTS.map((cat) => {
                      const isActive = catalyst.id === cat.id;
                      return /*#__PURE__*/ React.createElement(
                        "button",
                        {
                          key: cat.id,
                          onClick: () => setCatalyst(cat),
                          className: `flex items-center gap-4 p-4 border rounded-xl transition-all text-left hover:shadow-md ${isActive ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-600" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500"}`,
                        },
                          /*#__PURE__*/ React.createElement(ItemIcon, {
                          id: cat.id,
                          name: cat.name,
                          size: "w-10 h-10",
                        }),
                          /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className: `font-bold text-sm flex-1 ${isActive ? "text-indigo-700 dark:text-indigo-300" : "text-slate-700 dark:text-slate-200"}`,
                          },
                          cat.name === "none" ? t("noCatalyst") : cat.name,
                        ),
                        isActive &&
                            /*#__PURE__*/ React.createElement("i", {
                          className:
                            "fa-regular fa-circle-check text-xl text-indigo-500 dark:text-indigo-400",
                        }),
                      );
                    }),
                  ),
                ),
              ),
              cartOpen &&
                /*#__PURE__*/ React.createElement(
                React.Fragment,
                null,
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "mb-3 flex items-center justify-between flex-shrink-0",
                  },
                    /*#__PURE__*/ React.createElement(
                    "h2",
                    {
                      className:
                        "text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2",
                    },
                      /*#__PURE__*/ React.createElement("i", {
                      className: "fa-solid fa-cart-shopping text-indigo-500",
                    }),
                    " ",
                    t("productionPlan"),
                  ),
                  cart.length > 0 &&
                      /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: () => setCart([]),
                      className:
                        "text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300 font-semibold flex items-center gap-1 transition-colors",
                    },
                        /*#__PURE__*/ React.createElement("i", {
                      className: "fa-solid fa-trash text-xs",
                    }),
                    " ",
                    t("cartClear"),
                  ),
                ),
                cart.length === 0
                  ? /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className:
                        "flex flex-col items-center justify-center flex-1 text-slate-400 dark:text-slate-600",
                    },
                        /*#__PURE__*/ React.createElement("i", {
                      className:
                        "fa-solid fa-cart-shopping text-5xl mb-3 opacity-20",
                    }),
                        /*#__PURE__*/ React.createElement(
                      "p",
                      {
                        className: "text-sm",
                      },
                      t("cartEmpty"),
                    ),
                        /*#__PURE__*/ React.createElement(
                      "p",
                      {
                        className: "text-xs mt-1 text-center",
                      },
                      t("cartEmptyHint"),
                      " ",
                          /*#__PURE__*/ React.createElement("i", {
                        className: "fa-solid fa-cart-plus mx-1",
                      }),
                      " ",
                      t("cartEmptyHint2"),
                    ),
                  )
                  : /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className:
                        "flex flex-col gap-5 flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1",
                    },
                        /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className: "space-y-1.5",
                      },
                      cart.map(({ recipeId, quantity }, cartIdx) => {
                        const recipe = [...RECIPES, ...customRecipes].find(
                          (r) => r.id === recipeId,
                        );
                        if (!recipe) return null;
                        const isPending = quantity === 0;
                        const isExpanded = cartExpandedRecipe === recipeId;
                        const perMats = cartPerRecipe[cartIdx] || {};
                        return /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            key: recipeId,
                            className: `rounded-xl border transition-all ${isPending ? "border-red-300 dark:border-red-700 opacity-60" : isExpanded ? "border-indigo-400 dark:border-indigo-500" : "border-slate-200 dark:border-slate-700"}`,
                          },
                              /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: `flex items-center gap-2 px-3 py-2.5 rounded-t-xl transition-all ${isPending ? "bg-red-50 dark:bg-red-900/20" : isExpanded ? "bg-indigo-50 dark:bg-indigo-900/30" : "bg-white dark:bg-slate-800"}`,
                            },
                                /*#__PURE__*/ React.createElement(
                              "button",
                              {
                                onClick: () =>
                                  setCartExpandedRecipe(
                                    isExpanded ? null : recipeId,
                                  ),
                                className:
                                  "flex items-center gap-2 flex-1 min-w-0 text-left",
                              },
                                  /*#__PURE__*/ React.createElement(ItemIcon, {
                                id: recipe.matchedRecipeId ?? recipe.id,
                                name: recipe.product,
                                size: "w-8 h-8 flex-shrink-0",
                              }),
                                  /*#__PURE__*/ React.createElement(
                                "div",
                                {
                                  className: "flex-1 min-w-0",
                                },
                                    /*#__PURE__*/ React.createElement(
                                  "p",
                                  {
                                    className: `font-bold text-sm truncate ${isExpanded ? "text-indigo-700 dark:text-indigo-300" : "text-slate-800 dark:text-slate-200"}`,
                                  },
                                  recipe.product,
                                ),
                                isPending
                                  ? /*#__PURE__*/ React.createElement(
                                    "p",
                                    {
                                      className:
                                        "text-[10px] text-red-500 dark:text-red-400 font-semibold",
                                    },
                                    t("pendingRemove"),
                                  )
                                  : /*#__PURE__*/ React.createElement(
                                    "p",
                                    {
                                      className:
                                        "text-[10px] text-slate-400",
                                    },
                                    recipe.rank,
                                    " \u2013 ",
                                    recipe.type,
                                  ),
                              ),
                                  /*#__PURE__*/ React.createElement("i", {
                                className: `fa-solid fa-chevron-${isExpanded ? "up" : "down"} text-xs text-slate-400 flex-shrink-0`,
                              }),
                            ),
                                /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className:
                                  "flex items-center gap-1 flex-shrink-0 ml-1",
                              },
                                  /*#__PURE__*/ React.createElement(
                                "button",
                                {
                                  onClick: () => {
                                    if (quantity === 1) {
                                      setCart((prev) =>
                                        prev.map((i) =>
                                          i.recipeId === recipeId
                                            ? {
                                              ...i,
                                              quantity: 0,
                                            }
                                            : i,
                                        ),
                                      );
                                      const timer = setTimeout(() => {
                                        setCart((prev) =>
                                          prev.filter(
                                            (i) => i.recipeId !== recipeId,
                                          ),
                                        );
                                        delete pendingRemove.current[
                                          recipeId
                                        ];
                                      }, 3000);
                                      if (pendingRemove.current[recipeId])
                                        clearTimeout(
                                          pendingRemove.current[recipeId],
                                        );
                                      pendingRemove.current[recipeId] =
                                        timer;
                                    } else {
                                      setCart((prev) =>
                                        prev.map((i) =>
                                          i.recipeId === recipeId
                                            ? {
                                              ...i,
                                              quantity: i.quantity - 1,
                                            }
                                            : i,
                                        ),
                                      );
                                    }
                                  },
                                  className:
                                    "w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-red-100 dark:hover:bg-red-900/30 font-bold text-base flex items-center justify-center transition-colors",
                                },
                                "-",
                              ),
                                  /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className:
                                    "w-6 text-center text-sm font-black text-slate-700 dark:text-slate-200",
                                },
                                quantity,
                              ),
                                  /*#__PURE__*/ React.createElement(
                                "button",
                                {
                                  onClick: () => {
                                    if (pendingRemove.current[recipeId]) {
                                      clearTimeout(
                                        pendingRemove.current[recipeId],
                                      );
                                      delete pendingRemove.current[
                                        recipeId
                                      ];
                                    }
                                    setCart((prev) =>
                                      prev.map((i) =>
                                        i.recipeId === recipeId
                                          ? {
                                            ...i,
                                            quantity: i.quantity + 1,
                                          }
                                          : i,
                                      ),
                                    );
                                  },
                                  className:
                                    "w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 font-bold text-base flex items-center justify-center transition-colors",
                                },
                                "+",
                              ),
                                  /*#__PURE__*/ React.createElement(
                                "button",
                                {
                                  onClick: () => {
                                    if (pendingRemove.current[recipeId]) {
                                      clearTimeout(
                                        pendingRemove.current[recipeId],
                                      );
                                      delete pendingRemove.current[
                                        recipeId
                                      ];
                                    }
                                    setCart((prev) =>
                                      prev.filter(
                                        (i) => i.recipeId !== recipeId,
                                      ),
                                    );
                                  },
                                  className:
                                    "text-slate-300 hover:text-red-500 dark:hover:text-red-400 transition-colors ml-1 flex-shrink-0",
                                },
                                    /*#__PURE__*/ React.createElement("i", {
                                  className: "fa-solid fa-xmark text-base",
                                }),
                              ),
                            ),
                          ),
                          isExpanded &&
                          Object.keys(perMats).length > 0 &&
                                /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className:
                                "border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-b-xl space-y-1",
                            },
                            Object.entries(perMats)
                              .sort(([aId], [bId]) =>
                                (
                                  findItem(parseInt(aId))?.name || ""
                                ).localeCompare(
                                  findItem(parseInt(bId))?.name || "",
                                ),
                              )
                              .map(([idStr, needed]) => {
                                const id = parseInt(idStr);
                                const mat = findItem(id);
                                const inLager = parsedLager[id] || 0;
                                const noLager =
                                  Object.keys(parsedLager).length === 0;
                                const ok = noLager || inLager >= needed;
                                return /*#__PURE__*/ React.createElement(
                                  "div",
                                  {
                                    key: id,
                                    className: `flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs ${noLager ? "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400" : ok ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400"}`,
                                  },
                                        /*#__PURE__*/ React.createElement(
                                    ItemIcon,
                                    {
                                      id: id,
                                      name: mat?.name || idStr,
                                      size: "w-4 h-4 flex-shrink-0",
                                    },
                                  ),
                                        /*#__PURE__*/ React.createElement(
                                    "span",
                                    {
                                      className:
                                        "flex-1 font-semibold truncate",
                                    },
                                    mat?.name || `ID ${id}`,
                                  ),
                                        /*#__PURE__*/ React.createElement(
                                    "span",
                                    {
                                      className:
                                        "font-black flex-shrink-0",
                                    },
                                    !noLager && inLager > 0
                                      ? `${inLager} / `
                                      : "",
                                    needed,
                                  ),
                                  !noLager &&
                                          /*#__PURE__*/ React.createElement(
                                    "i",
                                    {
                                      className: `fa-solid ${ok ? "fa-circle-check" : "fa-circle-xmark"} text-xs flex-shrink-0`,
                                    },
                                  ),
                                );
                              }),
                          ),
                        );
                      }),
                    ),
                    (() => {
                      const noLager = Object.keys(parsedLager).length === 0;
                      const allOk =
                        noLager ||
                        Object.entries(cartTotal).every(
                          ([idStr, needed]) =>
                            (parsedLager[parseInt(idStr)] || 0) >= needed,
                        );
                      const hasMaterials =
                        Object.keys(cartTotal).length > 0;
                      return /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className:
                            "pt-2 border-t border-slate-200 dark:border-slate-700 flex-shrink-0",
                        },
                        !hasMaterials &&
                              /*#__PURE__*/ React.createElement(
                          "p",
                          {
                            className:
                              "text-xs text-slate-400 text-center py-1",
                          },
                          t("noMaterialsYet"),
                        ),
                        hasMaterials &&
                        !allOk &&
                        Object.keys(parsedLager).length > 0 &&
                              /*#__PURE__*/ React.createElement(
                          "p",
                          {
                            className:
                              "text-xs text-amber-500 dark:text-amber-400 flex items-center gap-1 mb-2",
                          },
                                /*#__PURE__*/ React.createElement("i", {
                            className: "fa-solid fa-triangle-exclamation",
                          }),
                          " ",
                          t("notEnough"),
                        ),
                            /*#__PURE__*/ React.createElement(
                          "button",
                          {
                            onClick: confirmProduction,
                            disabled: !hasMaterials,
                            className: `w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors
                                                                        ${hasMaterials ? (allOk ? "bg-green-500 hover:bg-green-600 text-white shadow-sm" : "bg-amber-500 hover:bg-amber-600 text-white shadow-sm") : "bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed"}`,
                          },
                              /*#__PURE__*/ React.createElement("i", {
                            className: "fa-solid fa-hammer",
                          }),
                          allOk ? t("craftMain") : t("craftAnyway"),
                        ),
                      );
                    })(),
                  ),
              ),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            "div",
            {
              className: "lg:col-span-1 flex flex-col gap-6 min-h-0",
              style: {
                gridColumn: "3",
              },
            },
            cartOpen &&
            Object.keys(cartTotal).length > 0 &&
              /*#__PURE__*/ React.createElement(
              "div",
              {
                className:
                  "bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 flex flex-col min-h-0 transition-colors",
              },
                /*#__PURE__*/ React.createElement(
                "div",
                {
                  className:
                    "flex items-center justify-between mb-3 flex-shrink-0",
                },
                  /*#__PURE__*/ React.createElement(
                  "h3",
                  {
                    className:
                      "text-base font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2",
                  },
                    /*#__PURE__*/ React.createElement("i", {
                    className: "fa-solid fa-list-check text-indigo-500",
                  }),
                  " ",
                  t("reqMaterials"),
                ),
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "flex gap-1 p-0.5 bg-slate-100 dark:bg-slate-900 rounded-lg",
                  },
                    /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: () => setMatGrouped(false),
                      className: `px-2.5 py-1 text-xs font-bold rounded-md transition-all ${!matGrouped ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700"}`,
                    },
                    t("total"),
                  ),
                    /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: () => setMatGrouped(true),
                      className: `px-2.5 py-1 text-xs font-bold rounded-md transition-all ${matGrouped ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700"}`,
                    },
                    t("grouped"),
                  ),
                ),
              ),
                /*#__PURE__*/ React.createElement(
                "div",
                {
                  className:
                    "space-y-2 overflow-y-auto custom-scrollbar flex-1 min-h-0",
                },
                !matGrouped
                  ? (() => {
                    const noLager = Object.keys(parsedLager).length === 0;
                    const allEntries = Object.entries(cartTotal).sort(
                      ([aId], [bId]) => parseInt(aId) - parseInt(bId),
                    );
                    const renderEntry = ([idStr, needed]) => {
                      const id = parseInt(idStr);
                      const mat = findItem(id);
                      const inLager = parsedLager[id] || 0;
                      const ok = noLager || inLager >= needed;
                      return /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          key: id,
                          className: `flex items-center gap-2 px-3 py-2 rounded-lg border ${noLager ? "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700" : ok ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50"}`,
                        },
                            /*#__PURE__*/ React.createElement(ItemIcon, {
                          id: id,
                          name: mat?.name || idStr,
                          size: "w-6 h-6 flex-shrink-0",
                        }),
                            /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className:
                              "flex-1 text-sm font-semibold text-slate-700 dark:text-slate-200 truncate",
                          },
                          mat?.name || `ID ${id}`,
                        ),
                            /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className: `text-xs font-black flex-shrink-0 ${noLager ? "text-slate-500 dark:text-slate-400" : ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`,
                          },
                          !noLager && inLager > 0 ? `${inLager} / ` : "",
                          needed,
                        ),
                        !noLager &&
                              /*#__PURE__*/ React.createElement("i", {
                          className: `fa-solid ${ok ? "fa-circle-check text-green-500" : "fa-circle-xmark text-red-400"} text-sm flex-shrink-0`,
                        }),
                            /*#__PURE__*/ React.createElement(
                          "a",
                          {
                            href: `https://cp.arcadia-online.org/item/view/?id=${id}`,
                            target: "_blank",
                            rel: "noopener noreferrer",
                            onClick: (e) => e.stopPropagation(),
                            className:
                              "flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors text-xs",
                            title: "Arcadia DB",
                          },
                              /*#__PURE__*/ React.createElement("i", {
                            className: "fa-solid fa-database",
                          }),
                        ),
                            /*#__PURE__*/ React.createElement(
                          "a",
                          {
                            href: `https://arcadia-market.de/sells/item_id/${id}`,
                            target: "_blank",
                            rel: "noopener noreferrer",
                            onClick: (e) => e.stopPropagation(),
                            className:
                              "flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800/60 transition-colors text-xs",
                            title: "Arcadia Market",
                          },
                              /*#__PURE__*/ React.createElement("i", {
                            className: "fa-solid fa-cart-shopping",
                          }),
                        ),
                      );
                    };
                    if (
                      matSplitMode === "none" ||
                      (matSplitMode === "stock" && noLager)
                    ) {
                      return /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className: "space-y-2",
                        },
                        allEntries.map(renderEntry),
                      );
                    }
                    if (matSplitMode === "stock") {
                      const available = allEntries.filter(
                        ([idStr, needed]) =>
                          (parsedLager[parseInt(idStr)] || 0) >= needed,
                      );
                      const missing = allEntries.filter(
                        ([idStr, needed]) =>
                          (parsedLager[parseInt(idStr)] || 0) < needed,
                      );
                      return /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className: "space-y-3",
                        },
                        missing.length > 0 &&
                              /*#__PURE__*/ React.createElement(
                          "div",
                          null,
                                /*#__PURE__*/ React.createElement(
                            "p",
                            {
                              className:
                                "text-[10px] font-black uppercase tracking-wider text-red-500 dark:text-red-400 mb-1.5 flex items-center gap-1",
                            },
                                  /*#__PURE__*/ React.createElement("i", {
                              className: "fa-solid fa-circle-xmark",
                            }),
                            " ",
                            t("stockMissing"),
                            " (",
                            missing.length,
                            ")",
                          ),
                                /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "space-y-2",
                            },
                            missing.map(renderEntry),
                          ),
                        ),
                        available.length > 0 &&
                              /*#__PURE__*/ React.createElement(
                          "div",
                          null,
                                /*#__PURE__*/ React.createElement(
                            "p",
                            {
                              className:
                                "text-[10px] font-black uppercase tracking-wider text-green-600 dark:text-green-400 mb-1.5 flex items-center gap-1",
                            },
                                  /*#__PURE__*/ React.createElement("i", {
                              className: "fa-solid fa-circle-check",
                            }),
                            " ",
                            t("stockAvailable"),
                            " (",
                            available.length,
                            ")",
                          ),
                                /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "space-y-2",
                            },
                            available.map(renderEntry),
                          ),
                        ),
                      );
                    }
                    // mode === 'type'
                    const usable = allEntries.filter(
                      ([idStr]) =>
                        getStorageType(parseInt(idStr)) === "usable",
                    );
                    const etc = allEntries.filter(
                      ([idStr]) =>
                        getStorageType(parseInt(idStr)) === "etc",
                    );
                    return /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className: "space-y-3",
                      },
                      usable.length > 0 &&
                            /*#__PURE__*/ React.createElement(
                        "div",
                        null,
                              /*#__PURE__*/ React.createElement(
                          "p",
                          {
                            className:
                              "text-[10px] font-black uppercase tracking-wider text-indigo-500 dark:text-indigo-400 mb-1.5 flex items-center gap-1",
                          },
                                /*#__PURE__*/ React.createElement("i", {
                            className: "fa-solid fa-hand-holding-heart",
                          }),
                          " ",
                          t("stockUsable"),
                          " (",
                          usable.length,
                          ")",
                        ),
                              /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            className: "space-y-2",
                          },
                          usable.map(renderEntry),
                        ),
                      ),
                      etc.length > 0 &&
                            /*#__PURE__*/ React.createElement(
                        "div",
                        null,
                              /*#__PURE__*/ React.createElement(
                          "p",
                          {
                            className:
                              "text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1",
                          },
                                /*#__PURE__*/ React.createElement("i", {
                            className: "fa-solid fa-box-archive",
                          }),
                          " ",
                          t("stockEtc"),
                          " (",
                          etc.length,
                          ")",
                        ),
                              /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            className: "space-y-2",
                          },
                          etc.map(renderEntry),
                        ),
                      ),
                    );
                  })()
                  : cart.map(({ recipeId, quantity }, cartIdx) => {
                    if (quantity <= 0) return null;
                    const recipe = [...RECIPES, ...customRecipes].find(
                      (r) => r.id === recipeId,
                    );
                    if (!recipe) return null;
                    const perMats = cartPerRecipe[cartIdx] || {};
                    if (Object.keys(perMats).length === 0) return null;
                    const noLager = Object.keys(parsedLager).length === 0;
                    const groupOk =
                      noLager ||
                      Object.entries(perMats).every(
                        ([idStr, needed]) =>
                          (parsedLager[parseInt(idStr)] || 0) >= needed,
                      );
                    return /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        key: recipeId,
                        className:
                          "rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden",
                      },
                          /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className: `flex items-center gap-2 px-3 py-2 ${noLager ? "bg-slate-50 dark:bg-slate-900" : groupOk ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20"}`,
                        },
                            /*#__PURE__*/ React.createElement(ItemIcon, {
                          id: recipe.matchedRecipeId ?? recipe.id,
                          name: recipe.product,
                          size: "w-5 h-5 flex-shrink-0",
                        }),
                            /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className:
                              "flex-1 text-xs font-bold text-slate-800 dark:text-slate-200 truncate",
                          },
                          recipe.product,
                        ),
                        quantity > 1 &&
                              /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className:
                              "text-[10px] font-bold text-slate-400",
                          },
                          "\xC3\u2014",
                          quantity,
                        ),
                        !noLager &&
                              /*#__PURE__*/ React.createElement("i", {
                          className: `fa-solid ${groupOk ? "fa-circle-check text-green-500" : "fa-circle-xmark text-red-400"} text-xs flex-shrink-0`,
                        }),
                      ),
                          /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className:
                            "bg-white dark:bg-slate-800 px-3 py-2 space-y-1",
                        },
                        Object.entries(perMats)
                          .sort(([aId], [bId]) =>
                            (
                              findItem(parseInt(aId))?.name || ""
                            ).localeCompare(
                              findItem(parseInt(bId))?.name || "",
                            ),
                          )
                          .map(([idStr, needed]) => {
                            const id = parseInt(idStr);
                            const mat = findItem(id);
                            const inLager = parsedLager[id] || 0;
                            const ok = noLager || inLager >= needed;
                            return /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                key: id,
                                className: `flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs ${noLager ? "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400" : ok ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400"}`,
                              },
                                  /*#__PURE__*/ React.createElement(ItemIcon, {
                                id: id,
                                name: mat?.name || idStr,
                                size: "w-4 h-4 flex-shrink-0",
                              }),
                                  /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className:
                                    "flex-1 font-semibold truncate",
                                },
                                mat?.name || `ID ${id}`,
                              ),
                                  /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className: "font-black flex-shrink-0",
                                },
                                !noLager && inLager > 0
                                  ? `${inLager} / `
                                  : "",
                                needed,
                              ),
                              !noLager &&
                                    /*#__PURE__*/ React.createElement("i", {
                                className: `fa-solid ${ok ? "fa-circle-check" : "fa-circle-xmark"} text-xs flex-shrink-0`,
                              }),
                            );
                          }),
                      ),
                    );
                  }),
              ),
            ),
            /*#__PURE__*/ React.createElement(
              "div",
              {
                className: `flex flex-col gap-6 flex-1 overflow-y-auto custom-scrollbar min-h-0 ${cartOpen ? "hidden" : ""}`,
              },
              /*#__PURE__*/ React.createElement(
                "div",
                {
                  className:
                    "bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors",
                },
                /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "p-6 flex justify-between items-center",
                  },
                  /*#__PURE__*/ React.createElement(
                    "h2",
                    {
                      className:
                        "text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2",
                    },
                    /*#__PURE__*/ React.createElement("i", {
                      className:
                        "fa-solid fa-vial text-xl text-indigo-500 dark:text-indigo-400",
                    }),
                    t("cauldronTitle"),
                  ),
                  /*#__PURE__*/ React.createElement(
                    "button",
                    {
                      onClick: clearCauldron,
                      className:
                        "text-sm text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-semibold flex items-center gap-1 transition-colors",
                    },
                    /*#__PURE__*/ React.createElement("i", {
                      className: "fa-regular fa-circle-xmark text-base",
                    }),
                    " ",
                    t("cartClear"),
                  ),
                ),
                /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "px-6 pb-6",
                  },
                  /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      className: "grid grid-cols-2 gap-4 mb-6",
                    },
                    cauldron.map((slot, idx) => {
                      const canSwap = !!selectedRecipe || isCustomMode;
                      const isMainMaterial = idx === 0;
                      const slotBg = (() => {
                        if (!slot)
                          return "border-slate-200 dark:border-slate-700 border-dashed bg-slate-50 dark:bg-slate-900";
                        const maxStat = Math.max(
                          slot.fire,
                          slot.earth,
                          slot.air,
                          slot.water,
                        );
                        if (maxStat === 0)
                          return "border-indigo-200 dark:border-indigo-700/50 bg-indigo-50 dark:bg-indigo-900/30";
                        if (slot.fire === maxStat)
                          return "border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/25";
                        if (slot.earth === maxStat)
                          return "border-green-300 dark:border-green-700/60 bg-green-50 dark:bg-green-900/25";
                        if (slot.air === maxStat)
                          return "border-yellow-300 dark:border-yellow-700/60 bg-yellow-50 dark:bg-yellow-900/25";
                        return "border-blue-300 dark:border-blue-700/60 bg-blue-50 dark:bg-blue-900/25";
                      })();
                      return /*#__PURE__*/ React.createElement(
                        "button",
                        {
                          key: idx,
                          onClick: () => {
                            if (!canSwap) return;
                            if (_swapLastSlot.current !== idx) {
                              _swapOriginalRef.current = slot ?? null;
                              _swapLastSlot.current = idx;
                            }
                            setSwapOriginalItem(_swapOriginalRef.current);
                            setSwapSlotIndex(idx);
                            const _ms = slot
                              ? Math.max(
                                slot.fire,
                                slot.earth,
                                slot.air,
                                slot.water,
                              )
                              : 0;
                            setSwapElementFilter(
                              _ms > 0
                                ? slot.fire === _ms
                                  ? "fire"
                                  : slot.earth === _ms
                                    ? "earth"
                                    : slot.air === _ms
                                      ? "air"
                                      : "water"
                                : null,
                            );
                          },
                          disabled: !canSwap,
                          className: `h-[110px] rounded-xl border-2 flex flex-col items-center justify-center p-2 relative transition-all group w-full
                                    ${slotBg}
                                    ${canSwap ? "cursor-pointer hover:brightness-95 hover:shadow-md" : "cursor-not-allowed"}`,
                          title: canSwap ? t("clickToSwap") : "",
                        },
                        isMainMaterial &&
                        canSwap &&
                          /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className:
                              "absolute top-1 left-1 bg-indigo-500 dark:bg-indigo-600 text-white text-[9px] px-1.5 py-0.5 rounded shadow-sm font-bold z-10",
                          },
                          "MAIN (x2)",
                        ),
                        slot
                          ? /*#__PURE__*/ React.createElement(
                            React.Fragment,
                            null,
                              /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className:
                                  "text-[10px] font-bold text-indigo-400 dark:text-indigo-400 uppercase tracking-wider group-hover:opacity-20 transition-opacity",
                              },
                              "[",
                              slot.type,
                              "]",
                            ),
                              /*#__PURE__*/ React.createElement(ItemIcon, {
                              id: slot.id,
                              name: slot.name,
                              size: "w-8 h-8",
                              className:
                                "my-1 group-hover:opacity-20 transition-opacity",
                            }),
                              /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className:
                                  "font-bold text-slate-800 dark:text-slate-200 text-center text-xs leading-tight group-hover:opacity-20 transition-opacity line-clamp-1",
                              },
                              slot.name,
                            ),
                              /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className:
                                  "absolute bottom-1 left-1 right-1 flex gap-0.5 group-hover:opacity-20 transition-opacity",
                              },
                                /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className:
                                    "flex-1 text-center text-[9px] font-bold bg-red-500/20 text-red-600 dark:text-red-400 rounded px-0.5",
                                },
                                isMainMaterial ? slot.fire * 2 : slot.fire,
                              ),
                                /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className:
                                    "flex-1 text-center text-[9px] font-bold bg-green-500/20 text-green-600 dark:text-green-400 rounded px-0.5",
                                },
                                isMainMaterial ? slot.earth * 2 : slot.earth,
                              ),
                                /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className:
                                    "flex-1 text-center text-[9px] font-bold bg-yellow-400/30 text-yellow-600 dark:text-yellow-400 rounded px-0.5",
                                },
                                isMainMaterial ? slot.air * 2 : slot.air,
                              ),
                                /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className:
                                    "flex-1 text-center text-[9px] font-bold bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded px-0.5",
                                },
                                isMainMaterial ? slot.water * 2 : slot.water,
                              ),
                                /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className:
                                    "flex-1 text-center text-[9px] font-bold bg-slate-300/60 dark:bg-slate-500/40 text-slate-600 dark:text-slate-300 rounded px-0.5",
                                },
                                  /*#__PURE__*/ React.createElement("i", {
                                  className:
                                    "fa-solid fa-wand-magic-sparkles text-[8px]",
                                }),
                                slot.quality,
                              ),
                            ),
                            canSwap &&
                                /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className:
                                  "absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-500/10 dark:bg-indigo-500/20 rounded-xl",
                              },
                                  /*#__PURE__*/ React.createElement("i", {
                                className:
                                  "fa-solid fa-rotate text-3xl text-indigo-600 dark:text-indigo-400",
                              }),
                            ),
                          )
                          : /*#__PURE__*/ React.createElement(
                            "span",
                            {
                              className:
                                "text-slate-400 dark:text-slate-600 text-sm font-medium",
                            },
                            t("ingredientSlot"),
                            " ",
                            idx + 1,
                          ),
                      );
                    }),
                  ),
                  Object.keys(parsedLager).length > 0 &&
                  (lagerWarnings.missing.length > 0 ||
                    lagerWarnings.low.length > 0) &&
                    /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className: "mb-4 flex flex-col gap-2",
                      },
                      lagerWarnings.missing.map(
                        ({ material: mat, slotIdx, alternative }) =>
                          /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            key: "miss_" + mat.id,
                            className:
                              "flex flex-col gap-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl px-3 py-2 text-sm",
                          },
                            /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "flex items-center gap-2",
                            },
                              /*#__PURE__*/ React.createElement(ItemIcon, {
                              id: mat.id,
                              name: mat.name,
                              size: "w-6 h-6 flex-shrink-0",
                            }),
                              /*#__PURE__*/ React.createElement("i", {
                              className:
                                "fa-solid fa-circle-xmark text-red-500 flex-shrink-0",
                            }),
                              /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className:
                                  "text-red-700 dark:text-red-400 font-semibold flex-1",
                              },
                                /*#__PURE__*/ React.createElement(
                                "strong",
                                null,
                                mat.name,
                              ),
                              " ",
                              t("notInStock"),
                            ),
                          ),
                          alternative &&
                              /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "flex items-center gap-2 pl-1",
                            },
                                /*#__PURE__*/ React.createElement("i", {
                              className:
                                "fa-solid fa-arrow-right text-slate-400 text-xs",
                            }),
                                /*#__PURE__*/ React.createElement(ItemIcon, {
                              id: alternative.id,
                              name: alternative.name,
                              size: "w-5 h-5 flex-shrink-0",
                            }),
                                /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className:
                                  "text-slate-600 dark:text-slate-400 text-xs flex-1",
                              },
                              "Alternative: ",
                                  /*#__PURE__*/ React.createElement(
                                "strong",
                                {
                                  className:
                                    "text-slate-800 dark:text-slate-200",
                                },
                                alternative.name,
                              ),
                                  /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className: "ml-1 text-indigo-500",
                                },
                                "\xD7",
                                parsedLager[alternative.id],
                              ),
                            ),
                                /*#__PURE__*/ React.createElement(
                              "button",
                              {
                                onClick: () =>
                                  setCauldron((prev) => {
                                    const c = [...prev];
                                    c[slotIdx] = alternative;
                                    return c;
                                  }),
                                className:
                                  "text-xs px-2 py-0.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-lg transition-colors",
                              },
                              t("swapLabel"),
                            ),
                          ),
                        ),
                      ),
                      lagerWarnings.low.map(({ material, amount }) =>
                        /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          key: "low_" + material.id,
                          className:
                            "flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl px-3 py-2 text-sm",
                        },
                          /*#__PURE__*/ React.createElement(ItemIcon, {
                          id: material.id,
                          name: material.name,
                          size: "w-6 h-6 flex-shrink-0",
                        }),
                          /*#__PURE__*/ React.createElement("i", {
                          className:
                            "fa-solid fa-triangle-exclamation text-amber-500 flex-shrink-0",
                        }),
                          /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className:
                              "text-amber-800 dark:text-amber-300 font-semibold",
                          },
                            /*#__PURE__*/ React.createElement(
                            "strong",
                            null,
                            material.name,
                          ),
                          " ",
                          t("lowStock").replace("{amount}", amount),
                        ),
                      ),
                      ),
                    ),
                  /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className: "grid grid-cols-2 gap-4 mb-6",
                      },
                    /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className:
                            "bg-slate-50 dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-700 transition-colors flex flex-col justify-center",
                        },
                      /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className:
                              "text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1",
                          },
                          t("achievedQuality"),
                        ),
                      /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            className: "flex items-center justify-between",
                          },
                        /*#__PURE__*/ React.createElement(
                            "span",
                            {
                              className: `text-lg font-black ${stats.quality > 0 ? (selectedRecipe && stats.quality < selectedRecipe.minQuality ? "text-red-500" : "text-indigo-600 dark:text-indigo-400") : "text-slate-400"}`,
                            },
                            stats.quality > 0 ? stats.quality : "-",
                          ),
                          selectedRecipe &&
                          /*#__PURE__*/ React.createElement(
                            "span",
                            {
                              className:
                                "text-xs font-bold text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700",
                            },
                            t("goalLabel"),
                            " ",
                            selectedRecipe.minQuality,
                          ),
                        ),
                      ),
                      isCustomMode
                        ? /*#__PURE__*/ React.createElement(
                          "button",
                          {
                            onClick: () => setCatalystModalOpen(true),
                            className:
                              "bg-slate-50 dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-700 transition-colors flex items-center justify-between w-full group hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md cursor-pointer",
                            title: t("catalystModalTitle"),
                          },
                          /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "flex flex-col justify-center",
                            },
                            /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className:
                                  "text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1",
                              },
                              t("catalystLabel"),
                            ),
                            /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className:
                                  "text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors",
                              },
                              catalyst.id === "none"
                                ? t("noneLabel")
                                : catalyst.name,
                            ),
                          ),
                          /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "flex items-center gap-2",
                            },
                            /*#__PURE__*/ React.createElement(ItemIcon, {
                              id: catalyst.id,
                              name: catalyst.name,
                              size: "w-8 h-8",
                              className:
                                "group-hover:opacity-70 transition-opacity",
                            }),
                            /*#__PURE__*/ React.createElement("i", {
                              className:
                                "fa-solid fa-rotate text-indigo-400 dark:text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity text-lg",
                            }),
                          ),
                        )
                        : /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            className:
                              "bg-slate-50 dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-700 transition-colors flex items-center justify-between",
                          },
                          /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              className: "flex flex-col justify-center",
                            },
                            /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className:
                                  "text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1",
                              },
                              t("catalystLabel"),
                            ),
                            /*#__PURE__*/ React.createElement(
                              "span",
                              {
                                className:
                                  "text-sm font-bold text-slate-800 dark:text-slate-200",
                              },
                              catalyst.id === "none"
                                ? t("noneLabel")
                                : catalyst.name,
                            ),
                          ),
                          /*#__PURE__*/ React.createElement(ItemIcon, {
                            id: catalyst.id,
                            name: catalyst.name,
                            size: "w-8 h-8",
                          }),
                        ),
                    ),
                  /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        className: "mb-5",
                      },
                    /*#__PURE__*/ React.createElement(
                        "h3",
                        {
                          className:
                            "text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2",
                        },
                        t("agentLabel"),
                      ),
                    /*#__PURE__*/ React.createElement(
                        "button",
                        {
                          onClick: () => setAgentModalOpen(true),
                          className: `w-full h-[72px] rounded-xl border-2 flex items-center gap-3 px-4 transition-all group cursor-pointer hover:shadow-md
                                                    ${selectedAgent ? "border-indigo-200 dark:border-indigo-700/50 bg-indigo-50 dark:bg-indigo-900/30 hover:border-indigo-400 dark:hover:border-indigo-500" : "border-slate-200 dark:border-slate-700 border-dashed bg-slate-50 dark:bg-slate-900 hover:border-indigo-300 dark:hover:border-indigo-600"}`,
                        },
                        selectedAgent
                          ? /*#__PURE__*/ React.createElement(
                            React.Fragment,
                            null,
                            /*#__PURE__*/ React.createElement(ItemIcon, {
                              id: selectedAgent.id,
                              name: selectedAgent.name,
                              size: "w-10 h-10",
                              className:
                                "group-hover:opacity-70 transition-opacity",
                            }),
                            /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className:
                                  "flex flex-col items-start flex-1 min-w-0",
                              },
                              /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className:
                                    "font-bold text-slate-800 dark:text-slate-200 text-sm truncate w-full group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors",
                                },
                                selectedAgent.name,
                              ),
                              /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className: `text-[10px] px-1.5 py-0.5 rounded-full border font-bold mt-0.5 ${getElementColor(selectedAgent.element)}`,
                                },
                                selectedAgent.element,
                              ),
                            ),
                            /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className:
                                  "flex flex-col items-end gap-0.5 text-xs font-bold shrink-0",
                              },
                              selectedAgent.fire > 0 &&
                                /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className: "text-red-500",
                                },
                                  /*#__PURE__*/ React.createElement("i", {
                                  className:
                                    "fa-solid fa-fire text-[10px] mr-0.5",
                                }),
                                "+",
                                selectedAgent.fire,
                              ),
                              selectedAgent.earth > 0 &&
                                /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className: "text-green-600",
                                },
                                  /*#__PURE__*/ React.createElement("i", {
                                  className:
                                    "fa-solid fa-mountain text-[10px] mr-0.5",
                                }),
                                "+",
                                selectedAgent.earth,
                              ),
                              selectedAgent.air > 0 &&
                                /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className: "text-yellow-500",
                                },
                                  /*#__PURE__*/ React.createElement("i", {
                                  className:
                                    "fa-solid fa-wind text-[10px] mr-0.5",
                                }),
                                "+",
                                selectedAgent.air,
                              ),
                              selectedAgent.water > 0 &&
                                /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className: "text-blue-500",
                                },
                                  /*#__PURE__*/ React.createElement("i", {
                                  className:
                                    "fa-solid fa-droplet text-[10px] mr-0.5",
                                }),
                                "+",
                                selectedAgent.water,
                              ),
                              selectedAgent.quality > 0 &&
                                /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className: "text-indigo-500",
                                },
                                "+",
                                selectedAgent.quality,
                                " Qual.",
                              ),
                            ),
                            /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className:
                                  "opacity-0 group-hover:opacity-100 transition-opacity",
                              },
                              /*#__PURE__*/ React.createElement("i", {
                                className:
                                  "fa-solid fa-rotate text-2xl text-indigo-500 dark:text-indigo-400",
                              }),
                            ),
                          )
                          : /*#__PURE__*/ React.createElement(
                            "span",
                            {
                              className:
                                "text-slate-400 dark:text-slate-600 text-sm font-medium mx-auto",
                            },
                            t("noAgentSelected"),
                          ),
                      ),
                    ),
                  /*#__PURE__*/ React.createElement(
                      "div",
                      null,
                    /*#__PURE__*/ React.createElement(
                        "h3",
                        {
                          className:
                            "text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3",
                        },
                        t("achievedElements"),
                      ),
                    /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className: "space-y-3",
                        },
                        [
                          {
                            name: "Feuer",
                            key: "fire",
                            color: "bg-red-500",
                            icon: /*#__PURE__*/ React.createElement("i", {
                              className: "fa-solid fa-fire text-base",
                            }),
                          },
                          {
                            name: "Erde",
                            key: "earth",
                            color: "bg-green-500",
                            icon: /*#__PURE__*/ React.createElement("i", {
                              className: "fa-solid fa-mountain text-base",
                            }),
                          },
                          {
                            name: "Luft",
                            key: "air",
                            color: "bg-yellow-400",
                            icon: /*#__PURE__*/ React.createElement("i", {
                              className: "fa-solid fa-wind text-base",
                            }),
                          },
                          {
                            name: "Wasser",
                            key: "water",
                            color: "bg-blue-500",
                            icon: /*#__PURE__*/ React.createElement("i", {
                              className: "fa-solid fa-droplet text-base",
                            }),
                          },
                        ].map((el) => {
                          const maxPossible = 400;
                          const val = stats[el.key];
                          const percent = Math.min(
                            100,
                            (val / maxPossible) * 100,
                          );
                          const isDominant =
                            dominantElement.toLowerCase() === el.key && val > 0;
                          const minScore = effectiveRecipe?.minScore || 0;
                          const minScorePct =
                            minScore > 0
                              ? Math.min(100, (minScore / maxPossible) * 100)
                              : 0;
                          const isRequired =
                            effectiveRecipe?.element?.toLowerCase() === el.key;
                          return /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              key: el.key,
                              className: "flex items-center gap-3",
                            },
                          /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className: `w-8 h-8 rounded-full flex items-center justify-center text-white ${el.color} ${isDominant ? "ring-4 ring-indigo-200 dark:ring-indigo-500/30 shadow-md scale-110" : "opacity-80"}`,
                              },
                              el.icon,
                            ),
                          /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className:
                                  "flex-1 h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden relative",
                              },
                              minScore > 0 &&
                              isRequired &&
                              /*#__PURE__*/ React.createElement("div", {
                                className:
                                  "absolute inset-y-0 left-0 rounded-full opacity-20 bg-violet-500",
                                style: {
                                  width: `${minScorePct}%`,
                                },
                              }),
                            /*#__PURE__*/ React.createElement("div", {
                                className: `h-full ${el.color} transition-all duration-500 ease-out`,
                                style: {
                                  width: `${percent}%`,
                                },
                              }),
                              minScore > 0 &&
                              isRequired &&
                              /*#__PURE__*/ React.createElement("div", {
                                className:
                                  "absolute inset-y-0 w-0.5 bg-violet-600 dark:bg-violet-400",
                                style: {
                                  left: `${minScorePct}%`,
                                },
                              }),
                            ),
                          /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className:
                                  "w-10 text-right text-sm font-bold text-slate-600 dark:text-slate-300",
                              },
                              val,
                            ),
                          );
                        }),
                      ),
                    ),
                ),
              ),
              /*#__PURE__*/ React.createElement(
                "div",
                {
                  className: `rounded-2xl shadow-lg border-2 p-6 transition-all duration-500 relative overflow-hidden flex-shrink-0
                            ${!effectiveRecipe ? "bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400" : isEffectiveRecipeValid ? "bg-gradient-to-br from-indigo-600 to-violet-700 border-indigo-400 text-white" : "bg-gradient-to-br from-red-600 to-orange-600 border-red-400 text-white"}`,
                },
                /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "relative z-10",
                  },
                  /*#__PURE__*/ React.createElement(
                    "h3",
                    {
                      className: `text-sm font-bold uppercase tracking-wider mb-2 ${effectiveRecipe ? "text-white/80" : "text-slate-400 dark:text-slate-500"}`,
                    },
                    t("resultTitle"),
                  ),
                  effectiveRecipe
                    ? /*#__PURE__*/ React.createElement(
                      "div",
                      null,
                        /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          className: "flex items-center gap-4 mb-2",
                        },
                          /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            className:
                              "bg-white/20 p-2 rounded-xl backdrop-blur-sm",
                          },
                            /*#__PURE__*/ React.createElement(ItemIcon, {
                            id:
                              effectiveRecipe.matchedRecipeId ??
                              effectiveRecipe.id,
                            name: effectiveRecipe.product,
                            size: "w-12 h-12",
                          }),
                        ),
                          /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            className: "text-3xl font-black drop-shadow-md",
                          },
                          effectiveRecipe.product,
                        ),
                      ),
                      isEffectiveRecipeValid
                        ? /*#__PURE__*/ React.createElement(
                          "p",
                          {
                            className:
                              "text-indigo-200 font-medium flex items-center gap-2 mt-4",
                          },
                          getElementIcon(
                            effectiveRecipe.element,
                            "text-xl text-indigo-300",
                          ),
                          t("elementReached"),
                          " ",
                          effectiveRecipe.element,
                        )
                        : /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            className:
                              "mt-4 bg-red-900/40 p-4 rounded-xl border border-red-300/30 backdrop-blur-sm",
                          },
                              /*#__PURE__*/ React.createElement(
                            "p",
                            {
                              className:
                                "text-red-100 font-semibold flex items-start gap-2 text-sm leading-snug",
                            },
                                /*#__PURE__*/ React.createElement("i", {
                              className:
                                "fa-solid fa-circle-exclamation text-xl flex-shrink-0 mt-0.5 text-red-300",
                            }),
                                /*#__PURE__*/ React.createElement(
                              "div",
                              {
                                className: "flex flex-col gap-1",
                              },
                                  /*#__PURE__*/ React.createElement(
                                "span",
                                {
                                  className: "text-white font-bold mb-1",
                                },
                                t("synthesisFail"),
                              ),
                              dominantElement === "Tie" &&
                                    /*#__PURE__*/ React.createElement(
                                "span",
                                null,
                                t("tieError"),
                              ),
                              dominantElement !== "Tie" &&
                              dominantElement !==
                              effectiveRecipe.element &&
                                    /*#__PURE__*/ React.createElement(
                                "span",
                                null,
                                " ",
                                t("wrongElement")
                                  .replace("{dominant}", dominantElement)
                                  .replace(
                                    "{required}",
                                    effectiveRecipe.element,
                                  ),
                              ),
                              stats.quality < effectiveRecipe.minQuality &&
                                    /*#__PURE__*/ React.createElement(
                                "span",
                                null,
                                " ",
                                t("qualityTooLow")
                                  .replace("{achieved}", stats.quality)
                                  .replace(
                                    "{min}",
                                    effectiveRecipe.minQuality,
                                  ),
                              ),
                              effectiveRecipe.minScore > 0 &&
                              stats[
                              effectiveRecipe.element.toLowerCase()
                              ] < effectiveRecipe.minScore &&
                                    /*#__PURE__*/ React.createElement(
                                "span",
                                null,
                                " ",
                                t("scoreTooLow")
                                  .replace(
                                    "{element}",
                                    effectiveRecipe.element,
                                  )
                                  .replace(
                                    "{achieved}",
                                    stats[
                                    effectiveRecipe.element.toLowerCase()
                                    ],
                                  )
                                  .replace(
                                    "{min}",
                                    effectiveRecipe.minScore,
                                  ),
                              ),
                            ),
                          ),
                        ),
                    )
                    : /*#__PURE__*/ React.createElement(
                      "p",
                      {
                        className: "font-medium",
                      },
                      t("selectRecipeHint"),
                    ),
                ),
                effectiveRecipe &&
                isEffectiveRecipeValid &&
                  /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "absolute -bottom-10 -right-10 opacity-20 transform rotate-12 scale-150 transition-all pointer-events-none",
                  },
                    /*#__PURE__*/ React.createElement("i", {
                    className: "fa-solid fa-vial text-[12rem] text-white",
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
      ocrAmbiguous !== null &&
      ocrCurrentMatch &&
        /*#__PURE__*/ React.createElement(
        "div",
        {
          className:
            "fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4",
        },
          /*#__PURE__*/ React.createElement(
          "div",
          {
            className:
              "bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col border border-slate-200 dark:border-slate-700 transition-colors",
          },
            /*#__PURE__*/ React.createElement(
            "div",
            {
              className:
                "p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50",
            },
              /*#__PURE__*/ React.createElement(
              "div",
              null,
                /*#__PURE__*/ React.createElement(
                "h3",
                {
                  className:
                    "text-lg font-bold text-slate-800 dark:text-slate-100",
                },
                t("ocrAmbiguousTitle"),
              ),
                /*#__PURE__*/ React.createElement(
                "p",
                {
                  className:
                    "text-xs text-slate-500 dark:text-slate-400 mt-0.5",
                },
                '"',
                ocrCurrentMatch.text,
                '"',
              ),
            ),
              /*#__PURE__*/ React.createElement(
              "button",
              {
                onClick: () => setOcrAmbiguous(null),
                className:
                  "p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 dark:text-slate-400",
              },
                /*#__PURE__*/ React.createElement("i", {
                className: "fa-solid fa-xmark text-xl",
              }),
            ),
          ),
            /*#__PURE__*/ React.createElement(
            "div",
            {
              className: "p-4 flex flex-col gap-2",
            },
              /*#__PURE__*/ React.createElement(
              "p",
              {
                className: "text-sm text-slate-500 dark:text-slate-400 mb-1",
              },
              t("ocrAmbiguousDesc"),
            ),
            ocrCurrentMatch.matches.map((recipe) =>
                /*#__PURE__*/ React.createElement(
              "button",
              {
                key: recipe.id,
                onClick: () => ocrAdvance(recipe.id),
                className:
                  "flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all",
              },
                  /*#__PURE__*/ React.createElement(ItemIcon, {
                id: recipe.matchedRecipeId ?? recipe.id,
                name: recipe.product,
                size: "w-8 h-8",
              }),
                  /*#__PURE__*/ React.createElement(
                "div",
                null,
                    /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className:
                      "font-bold text-slate-800 dark:text-slate-100 text-sm",
                  },
                  recipe.product,
                ),
                    /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    className: "text-xs text-slate-400 dark:text-slate-500",
                  },
                  recipe.element,
                  " \xB7 ",
                  recipe.type,
                  " \xB7 ",
                  recipe.rank,
                ),
              ),
            ),
            ),
              /*#__PURE__*/ React.createElement(
              "button",
              {
                onClick: () => ocrAdvance(null),
                className:
                  "mt-1 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 py-2 transition-colors",
              },
              t("ocrSkip"),
            ),
          ),
          (() => {
            const ambigTotal = ocrAmbiguous.list.filter(
              (x) => x.type === "ambiguous",
            ).length;
            const ambigIdx = ocrAmbiguous.list
              .slice(0, ocrAmbiguous.idx + 1)
              .filter((x) => x.type === "ambiguous").length;
            return ambigTotal > 1
              ? /*#__PURE__*/ React.createElement(
                "div",
                {
                  className:
                    "px-5 pb-4 text-center text-xs text-slate-400 dark:text-slate-500",
                },
                ambigIdx,
                " / ",
                ambigTotal,
              )
              : null;
          })(),
        ),
      ),
    ),
  );
}
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(/*#__PURE__*/ React.createElement(App, null));
