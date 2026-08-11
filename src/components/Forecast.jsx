// src/components/Forecast.jsx
import React, { useEffect, useState, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import Navbar from "./Navbar";
import "./Forecast.css";

// Helper to resolve asset URLs relative to the base path in both local development and deployed production (subfolder) environments
const getAssetUrl = (path) => {
  const base = import.meta.env.BASE_URL || "/";
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${cleanPath}`;
};

// Build dynamic date strings for today and yesterday in YYYY-MM-DD format
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, "0");
const dd = String(today.getDate()).padStart(2, "0");
const todayDateStr = `${yyyy}-${mm}-${dd}`; // e.g. 2026-05-25

const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);
const yyyyY = yesterday.getFullYear();
const mmY = String(yesterday.getMonth() + 1).padStart(2, "0");
const ddY = String(yesterday.getDate()).padStart(2, "0");
const yesterdayDateStr = `${yyyyY}-${mmY}-${ddY}`; // e.g. 2026-05-24

// Parse model time in UTC and convert to Philippine Standard Time (UTC + 8 hours)
const getAdjustedPHSTDate = (modelTime) => {
  const parts = modelTime.split("T");
  const datePart = parts[0];
  const timePart = parts[1] || "000000";

  const yr = parseInt(datePart.slice(0, 4), 10);
  const mo = parseInt(datePart.slice(5, 7), 10) - 1; // 0-indexed
  const dy = parseInt(datePart.slice(8, 10), 10);

  const hr = parseInt(timePart.slice(0, 2), 10);
  const min = parseInt(timePart.slice(2, 4), 10);
  const sec = parseInt(timePart.slice(4, 6), 10);

  const utcTime = Date.UTC(yr, mo, dy, hr, min, sec);
  return new Date(utcTime + 8 * 60 * 60 * 1000);
};

// Convert a model time string to a 12-hour PHST label (UTC + 8h)
const toPhstLabel = (modelTime) => {
  const date = getAdjustedPHSTDate(modelTime);
  const hours24 = date.getUTCHours();
  const period = hours24 >= 12 ? "PM" : "AM";
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  return `${hours12}:${String(date.getUTCMinutes()).padStart(2, "0")} ${period}`;
};

// Pretty Date Converter with proper date rollover (UTC + 8h)
const toPrettyDate = (modelTime) => {
  const date = getAdjustedPHSTDate(modelTime);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthName = months[date.getUTCMonth()];
  return `${monthName} ${date.getUTCDate()}`;
};

// Forecast products using the user's file naming pattern
const FORECAST_HOURS = ["000000", "060000", "120000", "180000"]; // 00, 06, 12, 18 UTC
const FORECAST_DATES = [todayDateStr, yesterdayDateStr];

const FORECAST_OPTIONS = FORECAST_DATES.flatMap((dateStr) =>
  FORECAST_HOURS.flatMap((hhmmss) => {
    const modelTime = `${dateStr}T${hhmmss}`;
    const hourUtc = hhmmss.slice(0, 2);
    const isMidnight = hhmmss === "000000";

    const fnv3Base5Day = isMidnight ? `/assets/tropical_cyclone_5day_forecast_FNV3P2_${dateStr}.png` : `/assets/tropical_cyclone_5day_forecast_FNV3P2_${modelTime}.png`;
    const fnv3Base15Day = isMidnight ? `/assets/tropical_cyclone_15day_forecast_FNV3P2_${dateStr}.png` : `/assets/tropical_cyclone_15day_forecast_FNV3P2_${modelTime}.png`;

    const fnv3p15Day = isMidnight ? `/assets/tropical_cyclone_5day_forecast_FNV3P1_${dateStr}.png` : `/assets/tropical_cyclone_5day_forecast_FNV3P1_${modelTime}.png`;
    const fnv3p115Day = isMidnight ? `/assets/tropical_cyclone_15day_forecast_FNV3P1_${dateStr}.png` : `/assets/tropical_cyclone_15day_forecast_FNV3P1_${modelTime}.png`;

    const oper5Day = isMidnight ? `/assets/tropical_cyclone_5day_forecast_OPER_${dateStr}.png` : `/assets/tropical_cyclone_5day_forecast_OPER_${modelTime}.png`;
    const oper15Day = isMidnight ? `/assets/tropical_cyclone_15day_forecast_OPER_${dateStr}.png` : `/assets/tropical_cyclone_15day_forecast_OPER_${modelTime}.png`;

    const fnv3Large5Day = isMidnight ? `/assets/fnv3_tropical_cyclone_5day_forecast_${dateStr}.png` : `/assets/fnv3_tropical_cyclone_5day_forecast_${modelTime}.png`;
    const fnv3Large15Day = isMidnight ? `/assets/fnv3_tropical_cyclone_15day_forecast_${dateStr}.png` : `/assets/fnv3_tropical_cyclone_15day_forecast_${modelTime}.png`;

    const ifs5Day = `/assets/ifs_tropical_cyclone_5day_forecast_${modelTime}.png`;
    const ifs15Day = `/assets/ifs_tropical_cyclone_15day_forecast_${modelTime}.png`;

    const aifs5Day = `/assets/aifs_tropical_cyclone_5day_forecast_${modelTime}.png`;
    const aifs15Day = `/assets/aifs_tropical_cyclone_15day_forecast_${modelTime}.png`;

    const aigefs5Day = `/assets/aigefs_tropical_cyclone_5day_forecast_${modelTime}.png`;
    const aigefs15Day = `/assets/aigefs_tropical_cyclone_15day_forecast_${modelTime}.png`;

    return [
      {
        id: `fnv3-base-5day-${modelTime}`,
        type: "5day",
        model: "fnv3_base",
        label: `5-day forecast (${dateStr} ${hourUtc}:00 UTC)`,
        modelTime,
        imageSrc: getAssetUrl(fnv3Base5Day),
      },
      {
        id: `fnv3-base-15day-${modelTime}`,
        type: "15day",
        model: "fnv3_base",
        label: `15-day forecast (${dateStr} ${hourUtc}:00 UTC)`,
        modelTime,
        imageSrc: getAssetUrl(fnv3Base15Day),
      },
      {
        id: `fnv3p1-5day-${modelTime}`,
        type: "5day",
        model: "fnv3p1",
        label: `5-day forecast (${dateStr} ${hourUtc}:00 UTC)`,
        modelTime,
        imageSrc: getAssetUrl(fnv3p15Day),
      },
      {
        id: `fnv3p1-15day-${modelTime}`,
        type: "15day",
        model: "fnv3p1",
        label: `15-day forecast (${dateStr} ${hourUtc}:00 UTC)`,
        modelTime,
        imageSrc: getAssetUrl(fnv3p115Day),
      },
      {
        id: `oper-5day-${modelTime}`,
        type: "5day",
        model: "oper",
        label: `5-day forecast (${dateStr} ${hourUtc}:00 UTC)`,
        modelTime,
        imageSrc: getAssetUrl(oper5Day),
      },
      {
        id: `oper-15day-${modelTime}`,
        type: "15day",
        model: "oper",
        label: `15-day forecast (${dateStr} ${hourUtc}:00 UTC)`,
        modelTime,
        imageSrc: getAssetUrl(oper15Day),
      },
      {
        id: `fnv3-large-5day-${modelTime}`,
        type: "5day",
        model: "fnv3_large",
        label: `5-day forecast (${dateStr} ${hourUtc}:00 UTC)`,
        modelTime,
        imageSrc: getAssetUrl(fnv3Large5Day),
      },
      {
        id: `fnv3-large-15day-${modelTime}`,
        type: "15day",
        model: "fnv3_large",
        label: `15-day forecast (${dateStr} ${hourUtc}:00 UTC)`,
        modelTime,
        imageSrc: getAssetUrl(fnv3Large15Day),
      },
      {
        id: `ifs-5day-${modelTime}`,
        type: "5day",
        model: "ifs",
        label: `5-day forecast (${dateStr} ${hourUtc}:00 UTC)`,
        modelTime,
        imageSrc: getAssetUrl(ifs5Day),
      },
      {
        id: `ifs-15day-${modelTime}`,
        type: "15day",
        model: "ifs",
        label: `15-day forecast (${dateStr} ${hourUtc}:00 UTC)`,
        modelTime,
        imageSrc: getAssetUrl(ifs15Day),
      },
      {
        id: `aifs-5day-${modelTime}`,
        type: "5day",
        model: "aifs",
        label: `5-day forecast (${dateStr} ${hourUtc}:00 UTC)`,
        modelTime,
        imageSrc: getAssetUrl(aifs5Day),
      },
      {
        id: `aifs-15day-${modelTime}`,
        type: "15day",
        model: "aifs",
        label: `15-day forecast (${dateStr} ${hourUtc}:00 UTC)`,
        modelTime,
        imageSrc: getAssetUrl(aifs15Day),
      },
      {
        id: `aigefs-5day-${modelTime}`,
        type: "5day",
        model: "aigefs",
        label: `5-day forecast (${dateStr} ${hourUtc}:00 UTC)`,
        modelTime,
        imageSrc: getAssetUrl(aigefs5Day),
      },
      {
        id: `aigefs-15day-${modelTime}`,
        type: "15day",
        model: "aigefs",
        label: `15-day forecast (${dateStr} ${hourUtc}:00 UTC)`,
        modelTime,
        imageSrc: getAssetUrl(aigefs15Day),
      },
    ];
  })
);

const modelsList = [
  { id: "fnv3_base", name: "GDM WNC Base", key: "fnv3-base", source: "GDM Ensemble" },
  { id: "fnv3p1", name: "GDM WNCP1", key: "fnv3p1", source: "GDM FNV3P1 Ensemble" },
  { id: "oper", name: "GDM OPER", key: "oper", source: "GDM OPER Ensemble" },
  { id: "fnv3_large", name: "WNC Large", key: "fnv3-large", source: "GDM Large Ensemble" },
  { id: "ifs", name: "ECMWF IFS", key: "ifs", source: "ECMWF IFS Ensemble" },
  { id: "aifs", name: "ECMWF AIFS", key: "aifs", source: "ECMWF AIFS Ensemble" },
  { id: "aigefs", name: "AI-GEFS", key: "aigefs", source: "NOAA AI-GEFS Ensemble" },
];

const specsData = [
  {
    id: "fnv3_base",
    name: "GDM WNC Base",
    res: "0.25° (~28km)",
    members: "50 members",
    type: "DL-initialized",
    desc: "Google DeepMind FuXi-Nazca V3 core meteorological forecasting model ensemble (WNCP2).",
    source: "Global DeepLearning Model (GDM)",
  },
  {
    id: "fnv3p1",
    name: "GDM WNCP1",
    res: "0.25° (~28km)",
    members: "50 members",
    type: "DL-initialized",
    desc: "Earlier version of Google's AI cyclone model with an upgraded tracker. Operational Sept 2025 - May 2026.",
    source: "Global DeepLearning Model (GDM)",
  },
  {
    id: "oper",
    name: "GDM OPER",
    res: "0.25° (~28km)",
    members: "50 members",
    type: "Operational Ensemble",
    desc: "The best operational cyclone forecasts from Google models, utilizing historical version adjustments.",
    source: "Operational Ensemble",
  },
  {
    id: "fnv3_large",
    name: "WNC Large Ensemble",
    res: "0.25° (~28km)",
    members: "1000 members",
    type: "DL Extreme Ensemble",
    desc: "A massive super-ensemble leveraging 1,000 perturbed deep learning initializations to map extreme tail-risk scenarios and probabilistic track envelopes with high fidelity.",
    source: "GDM Extreme Computing",
  },
  {
    id: "ifs",
    name: "ECMWF IFS",
    res: "0.2° (~22km)",
    members: "51 members",
    type: "Physics Hydrodynamic",
    desc: "The gold standard of global forecasting from ECMWF. Utilizes traditional physical equations of fluid dynamics and thermodynamics.",
    source: "ECMWF",
  },
  {
    id: "aifs",
    name: "ECMWF AIFS",
    res: "0.25° (~28km)",
    members: "51 members",
    type: "AI-Physics Hybrid",
    desc: "ECMWF's newly integrated Artificial Intelligence hybrid track forecasting engine, combining deep learning with data assimilation.",
    source: "ECMWF",
  },
  {
    id: "aigefs",
    name: "NOAA AI-GEFS",
    res: "0.25° (~28km)",
    members: "31 members",
    type: "ML AI-driven",
    desc: "The machine-learning powered version of the Global Ensemble Forecast System, optimized by NOAA for advanced storm track prediction and uncertainty mapping.",
    source: "National Oceanic and Atmospheric Administration",
  },
];

// Chronological timeline order (latest first)
const allPossibleCycles = Array.from(
  new Set(FORECAST_OPTIONS.map((opt) => opt.modelTime))
).sort((a, b) => b.localeCompare(a));

const Forecast = () => {
  const [availableIds, setAvailableIds] = useState([]);
  const [selectedModel, setSelectedModel] = useState("fnv3_base");
  const [isCompareGrid, setIsCompareGrid] = useState(false);
  const [showClusters, setShowClusters] = useState(false);
  const [showForecastTrack, setShowForecastTrack] = useState(false);
  const [stormsIndex, setStormsIndex] = useState([]);
  const [selectedStormId, setSelectedStormId] = useState("latest");

  useEffect(() => {
    fetch(getAssetUrl("/data/tc_storms_index.json"))
      .then((res) => {
        const contentType = res.headers.get("content-type");
        if (res.ok && contentType && contentType.includes("application/json")) {
          return res.json();
        }
        return [];
      })
      .then((json) => {
        setStormsIndex((json || []).filter((s) => s.active));
      })
      .catch(() => {
        setStormsIndex([]);
      });
  }, []);

  const [selectedType, setSelectedType] = useState("5day"); // '5day' or '15day'
  const [selectedModelTime, setSelectedModelTime] = useState(allPossibleCycles[0]);
  const [expandedSpecs, setExpandedSpecs] = useState(null);
  const [hasManuallySelected, setHasManuallySelected] = useState(false);

  // Zoom & Pan Lightbox States
  const [lightboxData, setLightboxData] = useState(null); // { src, title }
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [touchStartDist, setTouchStartDist] = useState(0);
  const touchSwipeStartRef = useRef(null);

  const canvasRef = useRef(null);
  const latestKnownRef = useRef(null);

  const [showTrends, setShowTrends] = useState(false);
  const [trendsManifest, setTrendsManifest] = useState(null);
  const [activeTrendDistId, setActiveTrendDistId] = useState(null);
  const [isWideTrend, setIsWideTrend] = useState(false);
  const [trendHorizon, setTrendHorizon] = useState("5day");

  // Automatically sync/default the trend horizon when model changes
  useEffect(() => {
    setTrendHorizon(selectedModel === "fnv3_large" ? "15day" : "5day");
  }, [selectedModel]);

  useEffect(() => {
    if (showTrends && !trendsManifest) {
      fetch(getAssetUrl("/data/trends/manifest.json"))
        .then(res => {
          if (res.ok) return res.json();
          throw new Error("Failed to load trends manifest");
        })
        .then(data => {
          setTrendsManifest(data);
          const key = `${selectedModel === "fnv3_large" ? "large" : "base"}_${trendHorizon}`;
          const dists = data[key] || [];
          if (dists.length > 0) {
            setActiveTrendDistId(dists[0].id);
          }
        })
        .catch(err => {
          console.error(err);
          setTrendsManifest({});
        });
    }
  }, [showTrends, selectedModel, trendHorizon, trendsManifest]);

  // Disable trends view if selected model is changed to one that does not support it
  useEffect(() => {
    if (selectedModel !== "fnv3_base" && selectedModel !== "fnv3_large") {
      setShowTrends(false);
      setShowForecastTrack(false);
    } else {
      setShowForecastTrack(false);
    }
    if (selectedModel !== "fnv3_large") {
      setShowClusters(false);
    }
    setSelectedStormId("latest");
  }, [selectedModel]);

  // Disable trends view if isCompareGrid is turned on
  useEffect(() => {
    if (isCompareGrid) {
      setShowTrends(false);
      setShowForecastTrack(false);
    }
  }, [isCompareGrid]);

  useEffect(() => {
    if (trendsManifest) {
      const key = `${selectedModel === "fnv3_large" ? "large" : "base"}_${trendHorizon}`;
      const dists = trendsManifest[key] || [];
      if (dists.length > 0) {
        setActiveTrendDistId(dists[0].id);
      } else {
        setActiveTrendDistId(null);
      }
    }
  }, [selectedModel, trendHorizon, trendsManifest]);

  // Preload and verify image availability on mount
  useEffect(() => {
    FORECAST_OPTIONS.forEach((opt) => {
      const img = new Image();
      img.onload = () => {
        setAvailableIds((prev) =>
          prev.includes(opt.id) ? prev : [...prev, opt.id]
        );
      };
      img.onerror = () => {
        setAvailableIds((prev) => prev.filter((id) => id !== opt.id));
      };
      img.src = opt.imageSrc;
    });
  }, []);

  // Set default active model time based on what is loaded, auto-selecting new updates
  useEffect(() => {
    const loadedCycles = allPossibleCycles.filter((time) => {
      if (isCompareGrid) {
        return FORECAST_OPTIONS.some((opt) => opt.modelTime === time && availableIds.includes(opt.id));
      } else {
        return FORECAST_OPTIONS.some((opt) => opt.model === selectedModel && opt.modelTime === time && availableIds.includes(opt.id));
      }
    });
    if (loadedCycles.length > 0) {
      if (!hasManuallySelected) {
        setSelectedModelTime(loadedCycles[0]);
      } else if (!loadedCycles.includes(selectedModelTime)) {
        setSelectedModelTime(loadedCycles[0]);
      }
    }
  }, [availableIds, selectedModel, isCompareGrid, hasManuallySelected]);

  // Lightbox gesture/wheel controller
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const preventDefaultWheel = (e) => {
      e.preventDefault();
      const zoomFactor = 0.25;
      setZoomScale((prev) => {
        let newScale = prev + (e.deltaY < 0 ? zoomFactor : -zoomFactor);
        newScale = Math.min(Math.max(newScale, 1), 4);
        if (newScale === 1) {
          setPanX(0);
          setPanY(0);
        }
        return newScale;
      });
    };

    canvas.addEventListener("wheel", preventDefaultWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", preventDefaultWheel);
    };
  }, [lightboxData]);

  // Single model track data helper
  const getModelTrackData = (modelId) => {
    const model = modelsList.find((m) => m.id === modelId);
    if (!model) return null;
    if (showForecastTrack && (modelId === "fnv3_base" || modelId === "fnv3_large")) {
      return {
        name: model.name,
        source: model.source,
        imageSrc: getAssetUrl(`/assets/tc_forecast_${selectedStormId}.png`),
        modelTime: selectedModelTime,
      };
    }
    const optionId = `${model.key}-${selectedType}-${selectedModelTime}`;
    const option = FORECAST_OPTIONS.find((opt) => opt.id === optionId);
    const isAvailable = option && availableIds.includes(option.id);
    let img = isAvailable ? option.imageSrc : null;
    if (modelId === "fnv3_large" && showClusters && img) {
      img = img.replace(".png", "_cluster.png");
    }
    return {
      name: model.name,
      source: model.source,
      imageSrc: img,
      modelTime: selectedModelTime,
    };
  };

  // Compute available models with loaded images in Grid Comparison mode
  const availableGridItems = useMemo(() => {
    return modelsList
      .map((model) => {
        const track = getModelTrackData(model.id);
        return { model, track };
      })
      .filter((item) => item.track && item.track.imageSrc);
  }, [modelsList, selectedType, selectedModelTime, selectedStormId, availableIds, showForecastTrack, showClusters]);

  const handlePrevLightbox = (e) => {
    if (e) e.stopPropagation();
    if (availableGridItems.length > 0 && lightboxIndex !== null) {
      const prevIdx = (lightboxIndex - 1 + availableGridItems.length) % availableGridItems.length;
      const prevItem = availableGridItems[prevIdx];
      setLightboxIndex(prevIdx);
      setLightboxData({
        src: prevItem.track.imageSrc,
        title: `${prevItem.model.name} (${selectedType.toUpperCase()})`
      });
      setZoomScale(1);
      setPanX(0);
      setPanY(0);
    }
  };

  const handleNextLightbox = (e) => {
    if (e) e.stopPropagation();
    if (availableGridItems.length > 0 && lightboxIndex !== null) {
      const nextIdx = (lightboxIndex + 1) % availableGridItems.length;
      const nextItem = availableGridItems[nextIdx];
      setLightboxIndex(nextIdx);
      setLightboxData({
        src: nextItem.track.imageSrc,
        title: `${nextItem.model.name} (${selectedType.toUpperCase()})`
      });
      setZoomScale(1);
      setPanX(0);
      setPanY(0);
    }
  };

  const openLightboxWithImage = (src, title, modelId) => {
    let idx = -1;
    if (modelId) {
      idx = availableGridItems.findIndex((item) => item.model.id === modelId);
    }
    if (idx === -1) {
      idx = availableGridItems.findIndex((item) => item.track && item.track.imageSrc === src);
    }
    setLightboxIndex(idx !== -1 ? idx : 0);
    setLightboxData({ src, title });
    setZoomScale(1);
    setPanX(0);
    setPanY(0);
  };

  // Touch Swipe navigation handlers for Lightbox modal
  const handleLightboxTouchStart = (e) => {
    if (e.touches && e.touches.length === 1) {
      touchSwipeStartRef.current = e.touches[0].clientX;
    }
  };

  const handleLightboxTouchEnd = (e) => {
    if (touchSwipeStartRef.current !== null && e.changedTouches && e.changedTouches.length === 1) {
      const touchEndClientX = e.changedTouches[0].clientX;
      const swipeDelta = touchEndClientX - touchSwipeStartRef.current;
      touchSwipeStartRef.current = null;

      if (swipeDelta < -45) {
        handleNextLightbox();
      } else if (swipeDelta > 45) {
        handlePrevLightbox();
      }
    }
  };

  // Keyboard navigation listener (ArrowLeft / ArrowRight / Escape)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (lightboxData) {
        if (e.key === "ArrowLeft") handlePrevLightbox();
        if (e.key === "ArrowRight") handleNextLightbox();
        if (e.key === "Escape") closeLightbox();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxData, lightboxIndex, availableGridItems]);

  const hasDataForCycle = (cycleTime) => {
    if (isCompareGrid) {
      return FORECAST_OPTIONS.some((opt) => opt.modelTime === cycleTime && availableIds.includes(opt.id));
    } else {
      return FORECAST_OPTIONS.some((opt) => opt.model === selectedModel && opt.modelTime === cycleTime && availableIds.includes(opt.id));
    }
  };

  const currentTrack = getModelTrackData(selectedModel);

  // Accordion Expand/Collapse Toggle
  const toggleSpecsAccordion = (id) => {
    setExpandedSpecs((prev) => (prev === id ? null : id));
  };

  // Close Lightbox Canvas
  const closeLightbox = () => {
    setLightboxData(null);
    setLightboxIndex(null);
    setZoomScale(1);
    setPanX(0);
    setPanY(0);
  };

  // Drag coordinates calculations
  const handleDragStart = (e) => {
    if (zoomScale === 1) return;
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    if (clientX === undefined || clientY === undefined) return;
    setIsDragging(true);
    setDragStart({ x: clientX - panX, y: clientY - panY });
  };

  const handleDragMove = (e) => {
    if (!isDragging || zoomScale === 1) return;
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    if (clientX === undefined || clientY === undefined) return;
    setPanX(clientX - dragStart.x);
    setPanY(clientY - dragStart.y);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  // Touch support for dragging + pinch zoom + swipe navigation
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setTouchStartDist(Math.hypot(dx, dy));
    } else if (e.touches.length === 1) {
      touchSwipeStartRef.current = e.touches[0].clientX;
      handleDragStart(e);
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && touchStartDist > 0) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / touchStartDist;

      setZoomScale((prev) => {
        let newScale = prev * factor;
        newScale = Math.min(Math.max(newScale, 1), 4);
        if (newScale === 1) {
          setPanX(0);
          setPanY(0);
        }
        return newScale;
      });
      setTouchStartDist(dist);
    } else if (e.touches.length === 1) {
      handleDragMove(e);
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) {
      setTouchStartDist(0);
    }
    handleDragEnd();

    if (zoomScale === 1 && touchSwipeStartRef.current !== null && e.changedTouches && e.changedTouches.length === 1) {
      const touchEndClientX = e.changedTouches[0].clientX;
      const swipeDelta = touchEndClientX - touchSwipeStartRef.current;
      touchSwipeStartRef.current = null;

      if (swipeDelta < -40) {
        handleNextLightbox();
      } else if (swipeDelta > 40) {
        handlePrevLightbox();
      }
    }
  };

  const handleZoomIn = () => {
    setZoomScale((prev) => Math.min(prev + 0.5, 4));
  };

  const handleZoomOut = () => {
    setZoomScale((prev) => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) {
        setPanX(0);
        setPanY(0);
      }
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomScale(1);
    setPanX(0);
    setPanY(0);
  };

  return (
    <>
      <Navbar />
      <section className="forecast-section">
        <div className="forecast-container">

          {/* Header Block */}
          <header className="forecast-header">
            <div className="header-titles">
              <h1 className="main-title">Ensemble Forecast</h1>
              <p className="subtitle">
                Browse model guidance for the current tropical system. Choose a
                forecast product below to view the corresponding track prepared by{" "}
                <span className="brand-highlight">Calauan Weather</span>.
              </p>
            </div>

            <div className="header-controls">
              <div className="header-row">
                <Link to="/spaghetti" className="btn-interactive">
                  <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  Spaghetti Plot Map
                </Link>

                {/* Run Cycle Trends comparison button */}
                {(selectedModel === "fnv3_base" || selectedModel === "fnv3_large") && (
                  <button
                    onClick={() => setShowTrends(!showTrends)}
                    className={`btn-interactive ${showTrends ? "active" : ""}`}
                    style={showTrends ? { borderColor: "var(--accent-color)", boxShadow: "0 0 10px rgba(0, 240, 255, 0.25)" } : {}}
                  >
                    <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    {showTrends ? "Close Trends" : "Run Cycle Trend"}
                  </button>
                )}

                {/* Grid Comparison Mode Toggle */}
                <button
                  onClick={() => setIsCompareGrid((prev) => !prev)}
                  className={`btn-interactive ${isCompareGrid ? "active" : ""}`}
                  style={isCompareGrid ? { borderColor: "var(--accent-color)", boxShadow: "0 0 10px rgba(0, 240, 255, 0.25)" } : {}}
                >
                  <svg className="icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    {isCompareGrid ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    )}
                  </svg>
                  {isCompareGrid ? "Single Model Mode" : "Grid Comparison Mode"}
                </button>
              </div>

              {/* Model Selector (Visible only in single model mode) */}
              {!isCompareGrid && (
                <div className="model-toggle">
                  {modelsList.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => setSelectedModel(model.id)}
                      className={`toggle-btn ${selectedModel === model.id ? "active" : ""}`}
                    >
                      {model.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Forecast Horizon (5-Day / 15-Day Selector) */}
              <div className="horizon-selector">
                <button
                  onClick={() => setSelectedType("5day")}
                  className={`horizon-btn ${selectedType === "5day" ? "active" : ""}`}
                >
                  5-Day Forecast
                </button>
                <button
                  onClick={() => setSelectedType("15day")}
                  className={`horizon-btn ${selectedType === "15day" ? "active" : ""}`}
                >
                  15-Day Forecast
                </button>
              </div>

            </div>
          </header>

          {/* Timeline Run Selector Carousel */}
          {!showTrends && (
            <div className="timeline-carousel-container">
              <div className="timeline-carousel-header">
                <span>Model Run Cycles Timeline</span>
                <span>All Times PHST (UTC+8)</span>
              </div>
              <div className="timeline-track-wrapper">
                <div className="timeline-track">
                  {allPossibleCycles.map((cycleTime) => {
                    const isActive = selectedModelTime === cycleTime;
                    const hasData = hasDataForCycle(cycleTime);
                    const timeStr = toPhstLabel(cycleTime);
                    const dateStr = toPrettyDate(cycleTime);
                    const utcLabel = `${cycleTime.split("T")[1].slice(0, 2)}Z`;

                    return (
                      <div
                        key={cycleTime}
                        onClick={() => {
                          setSelectedModelTime(cycleTime);
                          setHasManuallySelected(true);
                        }}
                        className={`timeline-node ${isActive ? "active" : ""}`}
                        style={!hasData ? { opacity: 0.5, borderStyle: "dashed" } : {}}
                      >
                        <span className="timeline-node-date">{dateStr}</span>
                        <span className="timeline-node-time">{timeStr}</span>
                        <div className="timeline-node-badge">
                          {utcLabel} {!hasData && "(Pending)"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {((selectedModel === "fnv3_base" || selectedModel === "fnv3_large") && !isCompareGrid) && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "900", color: "var(--text-muted)", paddingLeft: "0.25rem" }}>
                    View Mode:
                  </span>
                  <div style={{ display: "flex", backgroundColor: "var(--bg-dark)", padding: "0.25rem", borderRadius: "0.5rem", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                    <button
                      onClick={() => { setShowClusters(false); setShowForecastTrack(false); }}
                      className={`toggle-btn ${(!showClusters && !showForecastTrack) ? "active" : ""}`}
                      style={{
                        padding: "0.25rem 0.5rem",
                        borderRadius: "0.35rem",
                        fontSize: "0.7rem",
                        fontWeight: "900",
                        cursor: "pointer",
                        border: "none",
                        backgroundColor: (!showClusters && !showForecastTrack) ? "var(--bg-light)" : "transparent",
                        color: (!showClusters && !showForecastTrack) ? "var(--accent-color)" : "var(--text-muted)",
                        transition: "all 0.2s"
                      }}
                    >
                      STANDARD OUTLOOK
                    </button>
                    {selectedModel === "fnv3_large" && (
                      <button
                        onClick={() => { setShowClusters(true); setShowForecastTrack(false); }}
                        className={`toggle-btn ${showClusters ? "active" : ""}`}
                        style={{
                          padding: "0.25rem 0.5rem",
                          borderRadius: "0.35rem",
                          fontSize: "0.7rem",
                          fontWeight: "900",
                          cursor: "pointer",
                          border: "none",
                          backgroundColor: showClusters ? "var(--bg-light)" : "transparent",
                          color: showClusters ? "var(--accent-color)" : "var(--text-muted)",
                          transition: "all 0.2s"
                        }}
                      >
                        TRACK CLUSTERS
                      </button>
                    )}
                    <button
                      onClick={() => { setShowClusters(false); setShowForecastTrack(true); }}
                      className={`toggle-btn ${showForecastTrack ? "active" : ""}`}
                      style={{
                        padding: "0.25rem 0.5rem",
                        borderRadius: "0.35rem",
                        fontSize: "0.7rem",
                        fontWeight: "900",
                        cursor: "pointer",
                        border: "none",
                        backgroundColor: showForecastTrack ? "var(--bg-light)" : "transparent",
                        color: showForecastTrack ? "var(--accent-color)" : "var(--text-muted)",
                        transition: "all 0.2s"
                      }}
                    >
                      FORECAST TRACK
                    </button>
                  </div>
                </div>
              )}

              {showForecastTrack && stormsIndex.length > 0 && !isCompareGrid && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "900", color: "var(--text-muted)", paddingLeft: "0.25rem" }}>
                    Storm Track:
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", backgroundColor: "var(--bg-dark)", padding: "0.25rem", borderRadius: "0.5rem", border: "1px solid rgba(255, 255, 255, 0.05)", gap: "0.25rem" }}>
                    <button
                      onClick={() => setSelectedStormId("latest")}
                      className={`toggle-btn ${selectedStormId === "latest" ? "active" : ""}`}
                      style={{
                        padding: "0.25rem 0.5rem",
                        borderRadius: "0.35rem",
                        fontSize: "0.7rem",
                        fontWeight: "900",
                        cursor: "pointer",
                        border: "none",
                        backgroundColor: selectedStormId === "latest" ? "var(--bg-light)" : "transparent",
                        color: selectedStormId === "latest" ? "var(--accent-color)" : "var(--text-muted)",
                        transition: "all 0.2s"
                      }}
                    >
                      ALL SYSTEMS (COMPOSITE)
                    </button>
                    {stormsIndex.map((storm) => (
                      <button
                        key={storm.track_id}
                        onClick={() => setSelectedStormId(storm.track_id)}
                        className={`toggle-btn ${selectedStormId === storm.track_id ? "active" : ""}`}
                        style={{
                          padding: "0.25rem 0.5rem",
                          borderRadius: "0.35rem",
                          fontSize: "0.7rem",
                          fontWeight: "900",
                          cursor: "pointer",
                          border: "none",
                          backgroundColor: selectedStormId === storm.track_id ? "var(--bg-light)" : "transparent",
                          color: selectedStormId === storm.track_id ? "var(--accent-color)" : "var(--text-muted)",
                          transition: "all 0.2s"
                        }}
                      >
                        {storm.storm_name.toUpperCase()} ({storm.track_id})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dashboard Panels */}
          <div className={`forecast-grid ${isCompareGrid ? "compare-active" : ""}`}>

            {/* Comparison Grid mode view */}
            {isCompareGrid ? (
              <div className="comparison-grid">
                {modelsList.map((model) => {
                  const track = getModelTrackData(model.id);
                  return (
                    <div key={model.id} className="compare-card">
                      <div className="compare-card-header">
                        <span className="compare-card-title">{model.name}</span>
                        <span className="compare-card-badge">{selectedType.toUpperCase()}</span>
                      </div>

                      {track && track.imageSrc ? (
                        <div
                          className="compare-image-wrapper"
                          onClick={() => openLightboxWithImage(track.imageSrc, `${model.name} (${selectedType.toUpperCase()})`, model.id)}
                        >
                          <img
                            src={track.imageSrc}
                            alt={`${model.name} forecast`}
                            className="compare-card-img"
                          />
                        </div>
                      ) : (
                        <div className="placeholder-card-body">
                          <div className="placeholder-icon-wrap"></div>
                          <div>
                            <div className="placeholder-model-name">{model.name}</div>
                            <span className="placeholder-text">Track unreleased or pending for this run cycle.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (

              /* Single Model Mode View (Forecast Map or Trends Map) */
              <div className="panel image-panel">
                <div className="panel-header">
                  <span>{showTrends ? "Run Cycle Forecast Trends Map" : (currentTrack ? `${currentTrack.name} (${selectedType.toUpperCase()})` : "Forecast map")}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {showTrends && (
                      <button
                        onClick={() => setShowTrends(false)}
                        className="trends-back-btn"
                      >
                        <svg className="icon" style={{ width: "0.8rem", height: "0.8rem", stroke: "currentColor" }} fill="none" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span>Back to Forecast</span>
                      </button>
                    )}
                    <span className="mono-badge">
                      {selectedModelTime}
                    </span>
                  </div>
                </div>

                {showTrends ? (
                  /* Trends inline container */
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {/* Trends inline controls toolbar */}
                    <div className="trends-toolbar">
                      {/* Active System selection */}
                      <div className="trends-toolbar-section" style={{ flex: 1 }}>
                        <span className="trends-toolbar-label">
                          Select Active System
                        </span>
                        <div className="trends-systems-list">
                          {(() => {
                            const key = `${selectedModel === "fnv3_large" ? "large" : "base"}_${trendHorizon}`;
                            const dists = trendsManifest?.[key] || [];
                            if (dists.length === 0) {
                              return (
                                <div className="trends-empty-text">
                                  No active systems meeting threshold.
                                </div>
                              );
                            }
                            return dists.map((d) => (
                              <button
                                key={d.id}
                                onClick={() => setActiveTrendDistId(d.id)}
                                className={`trends-system-btn ${activeTrendDistId === d.id ? "active" : ""
                                  }`}
                              >
                                {d.name}
                              </button>
                            ));
                          })()}
                        </div>
                      </div>

                      {/* Horizon selection */}
                      <div className="trends-toolbar-section" style={{ flexShrink: 0 }}>
                        <span className="trends-toolbar-label">
                          Forecast Horizon
                        </span>
                        <div className="trends-width-selector">
                          <button
                            onClick={() => setTrendHorizon("5day")}
                            className={`trends-width-btn ${trendHorizon === "5day" ? "active" : ""}`}
                          >
                            5-Day
                          </button>
                          <button
                            onClick={() => setTrendHorizon("15day")}
                            className={`trends-width-btn ${trendHorizon === "15day" ? "active" : ""}`}
                          >
                            15-Day
                          </button>
                        </div>
                      </div>

                      {/* Width options */}
                      <div className="trends-toolbar-section" style={{ flexShrink: 0 }}>
                        <span className="trends-toolbar-label">
                          Extent Width
                        </span>
                        <div className="trends-width-selector">
                          <button
                            onClick={() => setIsWideTrend(false)}
                            className={`trends-width-btn ${!isWideTrend ? "active" : ""}`}
                          >
                            Standard
                          </button>
                          <button
                            onClick={() => setIsWideTrend(true)}
                            className={`trends-width-btn ${isWideTrend ? "active" : ""}`}
                          >
                            Wide
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Trends map image viewport */}
                    <div className="image-wrapper">
                      {(() => {
                        const key = `${selectedModel === "fnv3_large" ? "large" : "base"}_${trendHorizon}`;
                        const dists = trendsManifest?.[key] || [];
                        const activeDist = dists.find(d => d.id === activeTrendDistId) || dists[0];

                        if (!trendsManifest) {
                          return (
                            <div className="empty-state">
                              <div className="animate-spin" style={{ width: "24px", height: "24px", borderRadius: "50%", border: "2px solid rgba(0,240,255,0.2)", borderTopColor: "var(--accent-color)" }}></div>
                              <span>Loading trends manifest...</span>
                            </div>
                          );
                        }

                        if (dists.length === 0 || !activeDist) {
                          return (
                            <div className="empty-state">
                              <div className="empty-icon"></div>
                              <span style={{ maxWidth: "320px", textAlign: "center", lineHeight: "1.4" }}>
                                No trend maps pre-rendered for this cycle. Trend maps are only generated for systems with ≥100 tracks (Large) or ≥25 tracks (Base).
                              </span>
                            </div>
                          );
                        }

                        const imgPath = isWideTrend ? activeDist.wide : activeDist.standard;
                        const finalImgUrl = getAssetUrl(imgPath);

                        return (
                          <img
                            src={finalImgUrl}
                            alt={`Trends map for ${activeDist.name}`}
                            className="forecast-img"
                            onClick={() => setLightboxData({ src: finalImgUrl, title: `${activeDist.name} (${selectedType.toUpperCase()})` })}
                          />
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  /* Standard Forecast Map */
                  <div className="image-wrapper">
                    {currentTrack && currentTrack.imageSrc ? (
                      <img
                        src={currentTrack.imageSrc}
                        alt={`Forecast track for ${currentTrack.name}`}
                        onClick={() => openLightboxWithImage(currentTrack.imageSrc, `${currentTrack.name} (${selectedType.toUpperCase()})`, selectedModel)}
                        className="forecast-img"
                      />
                    ) : (
                      <div className="empty-state">
                        <div className="empty-icon"></div>
                        <span>No forecast image available. Track unreleased or pending.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Sidebar / Metadata Controls */}
            <aside className="panel metadata-panel" style={isCompareGrid ? { width: "100%", gridColumn: "1 / -1" } : {}}>
              {showTrends ? (
                /* Trend Details View */
                <div className="metadata-section">
                  <h2>Trend details</h2>
                  {(() => {
                    const key = `${selectedModel === "fnv3_large" ? "large" : "base"}_${trendHorizon}`;
                    const dists = trendsManifest?.[key] || [];
                    const activeDist = dists.find(d => d.id === activeTrendDistId) || dists[0];
                    const totalMembers = selectedModel === "fnv3_large" ? 1000 : 50;

                    if (!activeDist) {
                      return (
                        <div className="trends-empty-text">
                          No active system details.
                        </div>
                      );
                    }

                    const supportRatio = (activeDist.trackCount / totalMembers) * 100;

                    return (
                      <dl className="details-list">
                        <div className="detail-item">
                          <dt>System Name</dt>
                          <dd className="mono-value">{activeDist.name}</dd>
                        </div>
                        <div className="detail-item">
                          <dt>Supporting Tracks</dt>
                          <dd className="highlight-text">
                            {activeDist.trackCount} / {totalMembers} members
                          </dd>
                        </div>
                        <div className="support-ratio-container">
                          <div className="support-ratio-header">
                            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Support Ratio</span>
                            <span className="highlight-text" style={{ fontWeight: "700" }}>{supportRatio.toFixed(1)}%</span>
                          </div>
                          <div className="support-ratio-bar-bg">
                            <div
                              className="support-ratio-bar-fill"
                              style={{ width: `${Math.min(100, supportRatio)}%` }}
                            ></div>
                          </div>
                        </div>
                        <div className="detail-item">
                          <dt>Model Engine</dt>
                          <dd>
                            {selectedModel === "fnv3_large" ? "WNC Large Ensemble" : selectedModel === "fnv3p1" ? "GDM WNCP1" : selectedModel === "oper" ? "GDM OPER" : "GDM WNC Base"}
                          </dd>
                        </div>
                        <div className="detail-item">
                          <dt>Processed by</dt>
                          <dd className="highlight-text">Calauan Weather</dd>
                        </div>
                      </dl>
                    );
                  })()}
                </div>
              ) : (
                /* Standard Run Details */
                <div className="metadata-section">
                  <h2>Run details</h2>
                  <dl className="details-list">
                    <div className="detail-item">
                      <dt>Model Cycle Time</dt>
                      <dd className="mono-value">
                        {selectedModelTime ? `${selectedModelTime}\n(${toPhstLabel(selectedModelTime)} PHST)` : "N/A"}
                      </dd>
                    </div>
                    {!isCompareGrid && (
                      <div className="detail-item">
                        <dt>Model Source</dt>
                        <dd>{currentTrack ? currentTrack.source : "N/A"}</dd>
                      </div>
                    )}
                    <div className="detail-item">
                      <dt>Processed by</dt>
                      <dd className="highlight-text">Calauan Weather</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Model Spec Matrix Expandable Accordions */}
              <div className="specs-accordion-card">
                <h2 className="specs-title">
                  <svg className="specs-title-icon" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                  Model Intelligence Matrix
                </h2>

                <div className="accordion-list">
                  {specsData.map((spec) => {
                    const isExpanded = expandedSpecs === spec.id;
                    return (
                      <div
                        key={spec.id}
                        className={`accordion-item ${isExpanded ? "expanded" : ""}`}
                      >
                        <button
                          className="accordion-header"
                          onClick={() => toggleSpecsAccordion(spec.id)}
                        >
                          <span className="accordion-item-title">
                            {spec.name}
                          </span>
                          <span className="accordion-chevron">▼</span>
                        </button>

                        <div className="accordion-content">
                          <div className="accordion-body">
                            <p className="specs-desc">{spec.desc}</p>
                            <div className="specs-grid">
                              <div className="spec-row">
                                <span className="spec-lbl">Resolution</span>
                                <span className="spec-val spec-val-badge">{spec.res}</span>
                              </div>
                              <div className="spec-row">
                                <span className="spec-lbl">Ensemble Size</span>
                                <span className="spec-val">{spec.members}</span>
                              </div>
                              <div className="spec-row">
                                <span className="spec-lbl">Category</span>
                                <span className="spec-val">{spec.type}</span>
                              </div>
                              <div className="spec-row">
                                <span className="spec-lbl">Source Authority</span>
                                <span className="spec-val" style={{ fontSize: "0.7rem" }}>{spec.source}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="disclaimer-section">
                <p>
                  This page is for visualization and guidance only. Always check
                  official bulletins from PAGASA, JTWC, JMA, and your local
                  authorities when making decisions for safety.
                </p>
              </div>
            </aside>
          </div>
        </div>

        {/* Lightbox Zoom/Pan Overlay */}
        {lightboxData && (
          <div
            className="lightbox-overlay"
            onClick={closeLightbox}
            onTouchStart={handleLightboxTouchStart}
            onTouchEnd={handleLightboxTouchEnd}
          >
            {/* Top Navigation Bar: Brand Pill on Left, Model Switcher in Center, Zoom & Close on Right */}
            <div className="lightbox-top-bar" onClick={(e) => e.stopPropagation()}>
              <div className="lightbox-brand-group">
                <span className="lightbox-brand-title">
                  {lightboxIndex !== null && availableGridItems[lightboxIndex]
                    ? availableGridItems[lightboxIndex].model.name.toUpperCase()
                    : lightboxData.title}
                </span>
                <span className="lightbox-brand-badge">MAINLINE</span>
              </div>

              {availableGridItems.length > 1 && (
                <div className="lightbox-model-tabs-center">
                  {availableGridItems.map((item, idx) => (
                    <button
                      key={item.model.id}
                      className={`lightbox-tab-pill ${idx === lightboxIndex ? "active" : ""}`}
                      onClick={() => {
                        setLightboxIndex(idx);
                        setLightboxData({
                          src: item.track.imageSrc,
                          title: `${item.model.name} (${selectedType.toUpperCase()})`
                        });
                        setZoomScale(1);
                        setPanX(0);
                        setPanY(0);
                      }}
                    >
                      {item.model.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="lightbox-top-actions">
                <span className="zoom-value-text">Zoom: {zoomScale.toFixed(1)}x</span>
                <button className="top-action-btn" onClick={handleZoomIn} title="Zoom In">
                  <ZoomIn size={15} />
                </button>
                <button className="top-action-btn" onClick={handleZoomOut} title="Zoom Out">
                  <ZoomOut size={15} />
                </button>
                <button className="top-action-btn" onClick={handleResetZoom} title="Reset View">
                  <RotateCcw size={15} />
                </button>
                <button className="top-action-btn close-danger-btn" onClick={closeLightbox} title="Close Modal">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Interactive Zoom/Pan Canvas */}
            <div
              ref={canvasRef}
              className={`lightbox-canvas ${isDragging ? "dragging" : ""}`}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={handleDragStart}
              onMouseMove={handleDragMove}
              onMouseUp={handleDragEnd}
              onMouseLeave={handleDragEnd}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <img
                src={lightboxData.src}
                alt={lightboxData.title}
                className="lightbox-img"
                style={{
                  transform: `translate(${panX}px, ${panY}px) scale(${zoomScale})`,
                  transition: isDragging ? "none" : "transform 0.15s ease-out",
                }}
              />
            </div>

            {/* Bottom Stepper Pill Bar: < Prev • Dots • Next > */}
            {availableGridItems.length > 1 && (
              <div className="lightbox-bottom-stepper" onClick={(e) => e.stopPropagation()}>
                <button className="stepper-btn" onClick={handlePrevLightbox}>
                  <ChevronLeft size={15} />
                  <span>Prev</span>
                </button>

                <div className="stepper-dots">
                  {availableGridItems.map((_, idx) => (
                    <span
                      key={idx}
                      className={`stepper-dot ${idx === lightboxIndex ? "active" : ""}`}
                      onClick={() => {
                        const item = availableGridItems[idx];
                        setLightboxIndex(idx);
                        setLightboxData({
                          src: item.track.imageSrc,
                          title: `${item.model.name} (${selectedType.toUpperCase()})`
                        });
                        setZoomScale(1);
                        setPanX(0);
                        setPanY(0);
                      }}
                    />
                  ))}
                </div>

                <button className="stepper-btn" onClick={handleNextLightbox}>
                  <span>Next</span>
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
};

export default Forecast;
