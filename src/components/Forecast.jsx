import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Columns2,
  HelpCircle,
  Activity,
  Command
} from "lucide-react";
import Navbar from "./Navbar";
import "./Forecast.css";

// Operational under-monitoring models configuration
const CLUSTER_MODELS = [
  { id: "gdm_wnc_large", name: "GDM WNC Large", shortName: "WNC Large", members: "1,001 Members", badge: "1001-ENS" },
  { id: "gdm_wncv3", name: "GDM WNCv3", shortName: "WNCv3", members: "64 Members", badge: "64-ENS" }
];

// Clean formatting helper: renders technical IDs like 'MONITORING_LPA01' or 'LPA01' as 'Cluster 01'
const formatClusterLabel = (id) => {
  if (!id) return "Cluster 01";
  const match = String(id).match(/(\d+)/);
  if (match) {
    const num = match[1].padStart(2, "0");
    return `Cluster ${num}`;
  }
  const clean = String(id).replace(/^MONITORING_/i, "").replace(/^LPA_?/i, "").trim();
  return clean ? `Cluster ${clean}` : "Cluster 01";
};

// Fallback seed entries in case manifest is fetching or temporarily offline
const DEFAULT_CLUSTER_ENTRIES = [
  {
    storm_id: "MONITORING_LPA01",
    atcf_id: "LPA01",
    init_date: "20261008",
    cycle: "06Z",
    model: "gdm_wnc_large",
    filename: "MONITORING_LPA01_20261008_06Z_gdm_wnc_large.png"
  },
  {
    storm_id: "MONITORING_LPA01",
    atcf_id: "LPA01",
    init_date: "20261008",
    cycle: "06Z",
    model: "gdm_wncv3",
    filename: "MONITORING_LPA01_20261008_06Z_gdm_wncv3.png"
  },
  {
    storm_id: "MONITORING_LPA02",
    atcf_id: "LPA02",
    init_date: "20261008",
    cycle: "06Z",
    model: "gdm_wnc_large",
    filename: "MONITORING_LPA02_20261008_06Z_gdm_wnc_large.png"
  },
  {
    storm_id: "MONITORING_LPA04",
    atcf_id: "LPA04",
    init_date: "20261008",
    cycle: "06Z",
    model: "gdm_wnc_large",
    filename: "MONITORING_LPA04_20261008_06Z_gdm_wnc_large.png"
  },
  {
    storm_id: "MONITORING_LPA03",
    atcf_id: "LPA03",
    init_date: "20261008",
    cycle: "06Z",
    model: "gdm_wnc_large",
    filename: "MONITORING_LPA03_20261008_06Z_gdm_wnc_large.png"
  }
];

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

    const wnv35Day = isMidnight ? `/assets/tropical_cyclone_5day_forecast_WNV3_${dateStr}.png` : `/assets/tropical_cyclone_5day_forecast_WNV3_${modelTime}.png`;
    const wnv315Day = isMidnight ? `/assets/tropical_cyclone_15day_forecast_WNV3_${dateStr}.png` : `/assets/tropical_cyclone_15day_forecast_WNV3_${modelTime}.png`;

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
        id: `wnv3-5day-${modelTime}`,
        type: "5day",
        model: "wnv3",
        label: `5-day forecast (${dateStr} ${hourUtc}:00 UTC)`,
        modelTime,
        imageSrc: getAssetUrl(wnv35Day),
      },
      {
        id: `wnv3-15day-${modelTime}`,
        type: "15day",
        model: "wnv3",
        label: `15-day forecast (${dateStr} ${hourUtc}:00 UTC)`,
        modelTime,
        imageSrc: getAssetUrl(wnv315Day),
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
  { id: "wnv3", name: "GDM WNCv3", key: "wnv3", source: "GDM WNCv3 Ensemble" },
  { id: "fnv3_base", name: "GDM WNC Base", key: "fnv3-base", source: "GDM Ensemble" },
  { id: "fnv3p1", name: "GDM WNCP1", key: "fnv3p1", source: "GDM FNV3P1 Ensemble" },
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
    id: "wnv3",
    name: "GDM WNCv3",
    res: "0.25° (~28km)",
    members: "64 members",
    type: "DL-initialized",
    desc: "Google DeepMind WeatherNext Cyclone V3 (WNV3) operational 64-member ensemble forecasting model.",
    source: "Global DeepLearning Model (GDM)",
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

  const [selectedType, setSelectedType] = useState("5day"); // '5day' | '15day' | 'cluster'
  const [selectedModelTime, setSelectedModelTime] = useState(allPossibleCycles[0]);
  const [expandedSpecs, setExpandedSpecs] = useState(null);
  const [hasManuallySelected, setHasManuallySelected] = useState(false);

  // Cluster Monitoring Specific States
  const [clusterManifest, setClusterManifest] = useState(DEFAULT_CLUSTER_ENTRIES);
  const [clusterModel, setClusterModel] = useState("gdm_wnc_large"); // 'gdm_wnc_large' | 'gdm_wncv3'
  const [selectedClusterRun, setSelectedClusterRun] = useState("");
  const [selectedClusterId, setSelectedClusterId] = useState("LPA01");
  const [isClusterSplitView, setIsClusterSplitView] = useState(false);
  const [showClusterHelp, setShowClusterHelp] = useState(false);

  // Fetch real-time Under-Monitoring Cluster Manifest
  useEffect(() => {
    fetch(getAssetUrl("/data/spaghetti_manifest.json"))
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((json) => {
        if (Array.isArray(json) && json.length > 0) {
          setClusterManifest(json);
          // Extract unique runs: `${init_date}_${cycle}` sorted chronologically newest first
          const runs = Array.from(
            new Set(
              json.map((j) => {
                const d = j.init_date || (j.unique_key?.match(/(\d{8})T/)?.[1] || "20261008");
                const c = j.cycle || (j.unique_key?.includes("T06Z") ? "06Z" : "00Z");
                return `${d}_${c}`;
              })
            )
          ).sort((a, b) => b.localeCompare(a));

          const latestRun = runs[0] || "";
          setSelectedClusterRun(latestRun);

          const itemsInLatestRun = json.filter((j) => {
            const d = j.init_date || (j.unique_key?.match(/(\d{8})T/)?.[1] || "20261008");
            const c = j.cycle || (j.unique_key?.includes("T06Z") ? "06Z" : "00Z");
            return `${d}_${c}` === latestRun;
          });
          const firstLpa = itemsInLatestRun[0]?.atcf_id || itemsInLatestRun[0]?.storm_id || json[0].atcf_id || json[0].storm_id;
          if (firstLpa) setSelectedClusterId(firstLpa);
        }
      })
      .catch(() => { });
  }, []);

  // Zoom & Pan Lightbox States (kept in refs to prevent render-cycle resets)
  const [lightboxData, setLightboxData] = useState(null); // { src, title }
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [displayScale, setDisplayScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);

  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const currentSrcRef = useRef(null);
  const lightboxIndexRef = useRef(lightboxIndex);
  const lightboxDataRef = useRef(lightboxData);

  useEffect(() => {
    lightboxIndexRef.current = lightboxIndex;
  }, [lightboxIndex]);

  useEffect(() => {
    lightboxDataRef.current = lightboxData;
  }, [lightboxData]);

  // Reset view modes when selected model changes
  useEffect(() => {
    setShowForecastTrack(false);
    if (selectedModel !== "fnv3_large") {
      setShowClusters(false);
    }
    setSelectedStormId("latest");
  }, [selectedModel]);

  // Disable forecast track when compare grid is active
  useEffect(() => {
    if (isCompareGrid) {
      setShowForecastTrack(false);
    }
  }, [isCompareGrid]);

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

  // Available initialization runs in cluster manifest (e.g. '20261008_06Z', '20261008_00Z')
  // Automatically distinguishes repeating 00Z-18Z cycles across different forecast days!
  const availableClusterRuns = useMemo(() => {
    const map = new Map();
    const allDates = new Set();
    clusterManifest.forEach((item) => {
      const d = item.init_date || (item.unique_key?.match(/(\d{8})T/)?.[1] || "20261008");
      allDates.add(d);
    });
    const hasMultipleDates = allDates.size > 1;

    clusterManifest.forEach((item) => {
      const d = item.init_date || (item.unique_key?.match(/(\d{8})T/)?.[1] || "20261008");
      const c = item.cycle || (item.unique_key?.includes("T06Z") ? "06Z" : "00Z");
      const key = `${d}_${c}`;
      if (!map.has(key)) {
        let dateLabel = d;
        if (d && d.length === 8) {
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const mIdx = parseInt(d.slice(4, 6), 10) - 1;
          const day = parseInt(d.slice(6, 8), 10);
          if (mIdx >= 0 && mIdx < 12) {
            dateLabel = `${months[mIdx]} ${day}`;
          }
        }
        map.set(key, {
          key,
          init_date: d,
          cycle: c,
          dateLabel,
          displayLabel: hasMultipleDates ? `${dateLabel} · ${c}` : c
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [clusterManifest]);

  // Resolves the currently active cluster run key (fallback to latest available run)
  const activeClusterRunKey = selectedClusterRun || availableClusterRuns[0]?.key || "";

  // Derived cluster lists formatted as 'Cluster 01', 'Cluster 02', etc.
  // Filtered by activeClusterRunKey AND (in single-model view) by active clusterModel!
  const availableClusterList = useMemo(() => {
    const map = new Map();
    const runFiltered = clusterManifest.filter((item) => {
      if (!activeClusterRunKey) return true;
      const d = item.init_date || (item.unique_key?.match(/(\d{8})T/)?.[1] || "20261008");
      const c = item.cycle || (item.unique_key?.includes("T06Z") ? "06Z" : "00Z");
      return `${d}_${c}` === activeClusterRunKey;
    });

    runFiltered.forEach((item) => {
      // In single model view, only show clusters available for the selected model!
      if (!isClusterSplitView && item.model !== clusterModel) {
        return;
      }
      const key = item.atcf_id || item.storm_id;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          label: formatClusterLabel(key),
          fullName: formatClusterLabel(key),
          models: []
        });
      }
      map.get(key).models.push(item.model);
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [clusterManifest, activeClusterRunKey, isClusterSplitView, clusterModel]);

  // Auto-snap selected cluster if current selection is not in active model / run list
  useEffect(() => {
    if (availableClusterList.length > 0) {
      const exists = availableClusterList.some((c) => c.id === selectedClusterId);
      if (!exists) {
        setSelectedClusterId(availableClusterList[0].id);
      }
    }
  }, [availableClusterList, selectedClusterId]);

  const activeClusterItem = useMemo(() => {
    if (!clusterManifest.length) return null;
    const runItems = activeClusterRunKey
      ? clusterManifest.filter((m) => {
        const d = m.init_date || (m.unique_key?.match(/(\d{8})T/)?.[1] || "20261008");
        const c = m.cycle || (m.unique_key?.includes("T06Z") ? "06Z" : "00Z");
        return `${d}_${c}` === activeClusterRunKey;
      })
      : clusterManifest;

    let match = runItems.find(
      (m) => m.model === clusterModel && (m.atcf_id === selectedClusterId || m.storm_id === selectedClusterId)
    );
    if (!match) {
      match = runItems.find((m) => m.model === clusterModel);
    }
    if (!match) {
      match = runItems[0] || clusterManifest[0];
    }
    return match;
  }, [clusterManifest, activeClusterRunKey, clusterModel, selectedClusterId]);

  const splitV3Item = useMemo(() => {
    const runItems = activeClusterRunKey
      ? clusterManifest.filter((m) => {
        const d = m.init_date || (m.unique_key?.match(/(\d{8})T/)?.[1] || "20261008");
        const c = m.cycle || (m.unique_key?.includes("T06Z") ? "06Z" : "00Z");
        return `${d}_${c}` === activeClusterRunKey;
      })
      : clusterManifest;

    return (
      runItems.find(
        (m) => m.model === "gdm_wncv3" && (m.atcf_id === selectedClusterId || m.storm_id === selectedClusterId)
      ) || null
    );
  }, [clusterManifest, activeClusterRunKey, selectedClusterId]);

  const splitLargeItem = useMemo(() => {
    const runItems = activeClusterRunKey
      ? clusterManifest.filter((m) => {
        const d = m.init_date || (m.unique_key?.match(/(\d{8})T/)?.[1] || "20261008");
        const c = m.cycle || (m.unique_key?.includes("T06Z") ? "06Z" : "00Z");
        return `${d}_${c}` === activeClusterRunKey;
      })
      : clusterManifest;

    return (
      runItems.find(
        (m) => m.model === "gdm_wnc_large" && (m.atcf_id === selectedClusterId || m.storm_id === selectedClusterId)
      ) || null
    );
  }, [clusterManifest, activeClusterRunKey, selectedClusterId]);

  const handleNextCluster = useCallback(() => {
    if (!availableClusterList.length) return;
    const currIdx = availableClusterList.findIndex((c) => c.id === selectedClusterId);
    const nextIdx = (currIdx + 1) % availableClusterList.length;
    setSelectedClusterId(availableClusterList[nextIdx].id);
  }, [availableClusterList, selectedClusterId]);

  const handlePrevCluster = useCallback(() => {
    if (!availableClusterList.length) return;
    const currIdx = availableClusterList.findIndex((c) => c.id === selectedClusterId);
    const prevIdx = (currIdx - 1 + availableClusterList.length) % availableClusterList.length;
    setSelectedClusterId(availableClusterList[prevIdx].id);
  }, [availableClusterList, selectedClusterId]);

  // Filter cluster list in Lightbox strictly by the currently displayed model (Large vs WNCv3) and cycle!
  const activeLightboxClusterList = useMemo(() => {
    if (!lightboxData?.isCluster) return [];
    const modelToUse = lightboxData.item?.model || clusterModel;
    const itemDate = lightboxData.item?.init_date || (lightboxData.item?.unique_key?.match(/(\d{8})T/)?.[1] || "");
    const itemCycle = lightboxData.item?.cycle || (lightboxData.item?.unique_key?.includes("T06Z") ? "06Z" : "00Z");
    const runToUse = itemDate && itemCycle ? `${itemDate}_${itemCycle}` : activeClusterRunKey;

    const filtered = clusterManifest.filter((m) => {
      if (m.model !== modelToUse) return false;
      if (runToUse) {
        const d = m.init_date || (m.unique_key?.match(/(\d{8})T/)?.[1] || "");
        const c = m.cycle || (m.unique_key?.includes("T06Z") ? "06Z" : "00Z");
        const rKey = d && c ? `${d}_${c}` : "";
        if (rKey && rKey !== runToUse) return false;
      }
      return true;
    });

    const seen = new Set();
    const unique = [];
    filtered.forEach((m) => {
      const key = m.atcf_id || m.storm_id;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(m);
      }
    });

    return unique.sort((a, b) => {
      const labelA = formatClusterLabel(a.atcf_id || a.storm_id);
      const labelB = formatClusterLabel(b.atcf_id || b.storm_id);
      return labelA.localeCompare(labelB);
    });
  }, [clusterManifest, lightboxData?.isCluster, lightboxData?.item, clusterModel, activeClusterRunKey]);

  const openClusterLightbox = (item) => {
    if (!item) return;
    const modelToUse = item.model || clusterModel;
    const itemDate = item.init_date || (item.unique_key?.match(/(\d{8})T/)?.[1] || "");
    const itemCycle = item.cycle || (item.unique_key?.includes("T06Z") ? "06Z" : "00Z");
    const runToUse = itemDate && itemCycle ? `${itemDate}_${itemCycle}` : activeClusterRunKey;

    const list = clusterManifest.filter((m) => {
      if (m.model !== modelToUse) return false;
      if (runToUse) {
        const d = m.init_date || (m.unique_key?.match(/(\d{8})T/)?.[1] || "");
        const c = m.cycle || (m.unique_key?.includes("T06Z") ? "06Z" : "00Z");
        const rKey = d && c ? `${d}_${c}` : "";
        if (rKey && rKey !== runToUse) return false;
      }
      return true;
    }).sort((a, b) => {
      const labelA = formatClusterLabel(a.atcf_id || a.storm_id);
      const labelB = formatClusterLabel(b.atcf_id || b.storm_id);
      return labelA.localeCompare(labelB);
    });

    const clusterId = item.atcf_id || item.storm_id;
    const foundIdx = list.findIndex((m) => (m.atcf_id || m.storm_id) === clusterId);

    const src = getAssetUrl(`/assets/${item.filename}`);
    const title = `${formatClusterLabel(clusterId)} • ${item.model === "gdm_wnc_large" ? "GDM WNC Large" : "GDM WNCv3"} (${item.cycle || "00Z"})`;
    scaleRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setDisplayScale(1);
    setLightboxIndex(foundIdx !== -1 ? foundIdx : 0);
    setLightboxData({
      src,
      title,
      isCluster: true,
      item
    });
  };

  const handlePrevLightbox = useCallback((e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const currentData = lightboxDataRef.current;
    if (currentData?.isCluster && activeLightboxClusterList.length > 0) {
      setLightboxIndex((prevIdx) => {
        const cur = prevIdx ?? 0;
        const prevIdxVal = (cur - 1 + activeLightboxClusterList.length) % activeLightboxClusterList.length;
        const prevItem = activeLightboxClusterList[prevIdxVal];
        setLightboxData({
          src: getAssetUrl(`/assets/${prevItem.filename}`),
          title: `${formatClusterLabel(prevItem.atcf_id || prevItem.storm_id)} • ${prevItem.model === "gdm_wnc_large" ? "GDM WNC Large" : "GDM WNCv3"} (${prevItem.cycle || "00Z"})`,
          isCluster: true,
          item: prevItem
        });
        return prevIdxVal;
      });
      return;
    }
    if (availableGridItems.length > 0) {
      setLightboxIndex((prevIdx) => {
        const cur = prevIdx ?? 0;
        const prevIdxVal = (cur - 1 + availableGridItems.length) % availableGridItems.length;
        const prevItem = availableGridItems[prevIdxVal];
        setLightboxData({
          src: prevItem.track.imageSrc,
          title: `${prevItem.model.name} (${selectedType.toUpperCase()})`
        });
        return prevIdxVal;
      });
    }
  }, [activeLightboxClusterList, availableGridItems, selectedType]);

  const handleNextLightbox = useCallback((e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const currentData = lightboxDataRef.current;
    if (currentData?.isCluster && activeLightboxClusterList.length > 0) {
      setLightboxIndex((prevIdx) => {
        const cur = prevIdx ?? 0;
        const nextIdxVal = (cur + 1) % activeLightboxClusterList.length;
        const nextItem = activeLightboxClusterList[nextIdxVal];
        setLightboxData({
          src: getAssetUrl(`/assets/${nextItem.filename}`),
          title: `${formatClusterLabel(nextItem.atcf_id || nextItem.storm_id)} • ${nextItem.model === "gdm_wnc_large" ? "GDM WNC Large" : "GDM WNCv3"} (${nextItem.cycle || "00Z"})`,
          isCluster: true,
          item: nextItem
        });
        return nextIdxVal;
      });
      return;
    }
    if (availableGridItems.length > 0) {
      setLightboxIndex((prevIdx) => {
        const cur = prevIdx ?? 0;
        const nextIdxVal = (cur + 1) % availableGridItems.length;
        const nextItem = availableGridItems[nextIdxVal];
        setLightboxData({
          src: nextItem.track.imageSrc,
          title: `${nextItem.model.name} (${selectedType.toUpperCase()})`
        });
        return nextIdxVal;
      });
    }
  }, [activeLightboxClusterList, availableGridItems, selectedType]);

  const openLightboxWithImage = (src, title, modelId) => {
    let idx = -1;
    if (modelId) {
      idx = availableGridItems.findIndex((item) => item.model.id === modelId);
    }
    if (idx === -1) {
      idx = availableGridItems.findIndex((item) => item.track && item.track.imageSrc === src);
    }
    scaleRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setDisplayScale(1);
    setLightboxIndex(idx !== -1 ? idx : 0);
    setLightboxData({ src, title });
  };

  // Close Lightbox Canvas
  const closeLightbox = useCallback(() => {
    setLightboxData(null);
    setLightboxIndex(null);
    currentSrcRef.current = null;
    scaleRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setDisplayScale(1);
  }, []);

  // Mobile Touch Swipe Handlers for Cluster Card
  const clusterTouchStartRef = useRef(null);
  const handleClusterTouchStart = (e) => {
    if (e.touches && e.touches.length === 1) {
      clusterTouchStartRef.current = e.touches[0].clientX;
    }
  };

  const handleClusterTouchEnd = (e) => {
    if (clusterTouchStartRef.current !== null && e.changedTouches && e.changedTouches.length === 1) {
      const deltaX = e.changedTouches[0].clientX - clusterTouchStartRef.current;
      clusterTouchStartRef.current = null;
      if (deltaX < -45) {
        handleNextCluster();
      } else if (deltaX > 45) {
        handlePrevCluster();
      }
    }
  };

  // Direct DOM transform application for 60fps gesture rendering
  const applyTransform = useCallback((smooth = false) => {
    if (!imgRef.current) return;
    imgRef.current.style.transition = smooth ? "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)" : "none";
    imgRef.current.style.transformOrigin = "0 0";
    imgRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${scaleRef.current})`;
  }, []);

  // Clamping algorithm ensuring the zoomed image stays bounded without empty edge gaps
  const clampPan = useCallback((scale, x, y) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return { x, y };

    const cWidth = canvas.clientWidth;
    const cHeight = canvas.clientHeight;
    const iWidth = img.offsetWidth;
    const iHeight = img.offsetHeight;

    if (!iWidth || !iHeight || !cWidth || !cHeight) return { x, y };

    const left0 = (cWidth - iWidth) / 2;
    const top0 = (cHeight - iHeight) / 2;

    const scaledW = iWidth * scale;
    const scaledH = iHeight * scale;

    let clampedX = x;
    let clampedY = y;

    if (scaledW >= cWidth) {
      const minX = cWidth - left0 - scaledW;
      const maxX = -left0;
      clampedX = Math.min(Math.max(x, minX), maxX);
    } else {
      clampedX = (cWidth - scaledW) / 2 - left0;
    }

    if (scaledH >= cHeight) {
      const minY = cHeight - top0 - scaledH;
      const maxY = -top0;
      clampedY = Math.min(Math.max(y, minY), maxY);
    } else {
      clampedY = (cHeight - scaledH) / 2 - top0;
    }

    return { x: clampedX, y: clampedY };
  }, []);

  const zoomAtPoint = useCallback((targetScale, ptX, ptY) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const clampedScale = Math.min(Math.max(targetScale, 1), 5);
    if (clampedScale <= 1.02) {
      scaleRef.current = 1;
      panRef.current = { x: 0, y: 0 };
      applyTransform(true);
      setDisplayScale(1);
      return;
    }

    const cWidth = canvas.clientWidth;
    const cHeight = canvas.clientHeight;
    const iWidth = img.offsetWidth;
    const iHeight = img.offsetHeight;
    const left0 = (cWidth - iWidth) / 2;
    const top0 = (cHeight - iHeight) / 2;

    const uX = (ptX - left0 - panRef.current.x) / scaleRef.current;
    const uY = (ptY - top0 - panRef.current.y) / scaleRef.current;

    const newX = ptX - left0 - clampedScale * uX;
    const newY = ptY - top0 - clampedScale * uY;

    const clamped = clampPan(clampedScale, newX, newY);
    scaleRef.current = clampedScale;
    panRef.current = clamped;
    applyTransform(true);
    setDisplayScale(clampedScale);
  }, [applyTransform, clampPan]);

  const handleZoomIn = useCallback(() => {
    const canvas = canvasRef.current;
    const midX = canvas ? canvas.clientWidth / 2 : 0;
    const midY = canvas ? canvas.clientHeight / 2 : 0;
    zoomAtPoint(scaleRef.current + 0.5, midX, midY);
  }, [zoomAtPoint]);

  const handleZoomOut = useCallback(() => {
    const canvas = canvasRef.current;
    const midX = canvas ? canvas.clientWidth / 2 : 0;
    const midY = canvas ? canvas.clientHeight / 2 : 0;
    const targetScale = Math.max(scaleRef.current - 0.5, 1);
    if (targetScale <= 1.02) {
      scaleRef.current = 1;
      panRef.current = { x: 0, y: 0 };
      applyTransform(true);
      setDisplayScale(1);
    } else {
      zoomAtPoint(targetScale, midX, midY);
    }
  }, [zoomAtPoint, applyTransform]);

  const handleResetZoom = useCallback(() => {
    scaleRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    applyTransform(true);
    setDisplayScale(1);
  }, [applyTransform]);

  // Comprehensive Global Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is interacting with form controls
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;

      // Handle Lightbox keyboard shortcuts when open
      if (lightboxData) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          handlePrevLightbox();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          handleNextLightbox();
        } else if (e.key === "Escape") {
          e.preventDefault();
          closeLightbox();
        } else if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          handleZoomIn();
        } else if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          handleZoomOut();
        } else if (e.key === "0" || e.key.toLowerCase() === "r") {
          e.preventDefault();
          handleResetZoom();
        }
        return;
      }

      // Help Modal Shortcuts
      if (showClusterHelp) {
        if (e.key === "Escape" || e.key === "?") {
          e.preventDefault();
          setShowClusterHelp(false);
          return;
        }
      }

      const keyLower = e.key.toLowerCase();

      // Quick toggle for Cluster horizon: 'c' toggles cluster mode
      if (keyLower === "c") {
        e.preventDefault();
        setSelectedType((prev) => (prev === "cluster" ? "5day" : "cluster"));
        return;
      }

      // Toggle shortcuts cheatsheet
      if (e.key === "?") {
        e.preventDefault();
        setShowClusterHelp((prev) => !prev);
        return;
      }

      // In Cluster Mode Specific Shortcuts
      if (selectedType === "cluster") {
        if (keyLower === "m" || e.key === "Tab") {
          e.preventDefault();
          setClusterModel((prev) => (prev === "gdm_wnc_large" ? "gdm_wncv3" : "gdm_wnc_large"));
        } else if (keyLower === "d") {
          e.preventDefault();
          setIsClusterSplitView((prev) => !prev);
        } else if (e.key === "ArrowLeft" || e.key === "[") {
          e.preventDefault();
          handlePrevCluster();
        } else if (e.key === "ArrowRight" || e.key === "]") {
          e.preventDefault();
          handleNextCluster();
        } else if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(e.key)) {
          const numIdx = parseInt(e.key, 10) - 1;
          if (availableClusterList[numIdx]) {
            e.preventDefault();
            setSelectedClusterId(availableClusterList[numIdx].id);
          }
        } else if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          if (activeClusterItem) {
            openClusterLightbox(activeClusterItem);
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          setSelectedType("5day");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    lightboxData,
    lightboxIndex,
    availableGridItems,
    closeLightbox,
    selectedType,
    showClusterHelp,
    clusterModel,
    selectedClusterId,
    availableClusterList,
    activeClusterItem,
    clusterManifest,
    handleNextCluster,
    handlePrevCluster
  ]);

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

  const handleNextRef = useRef(handleNextLightbox);
  const handlePrevRef = useRef(handlePrevLightbox);
  useEffect(() => {
    handleNextRef.current = handleNextLightbox;
    handlePrevRef.current = handlePrevLightbox;
  }, [handleNextLightbox, handlePrevLightbox]);

  // Reset zoom and pan ONLY when the displayed image actually changes
  useEffect(() => {
    if (lightboxData?.src && lightboxData.src !== currentSrcRef.current) {
      currentSrcRef.current = lightboxData.src;
      scaleRef.current = 1;
      panRef.current = { x: 0, y: 0 };
      setDisplayScale(1);
      requestAnimationFrame(() => {
        applyTransform(false);
      });
    }
  }, [lightboxData?.src, applyTransform]);

  // Unified Pointer Events, Gesture Clamping, Pinch Zoom, Double-Tap & Desktop Wheel Controller
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !lightboxData) return;

    const ac = new AbortController();
    const { signal } = ac;

    const activePointers = new Map();
    const gestureState = {
      hadMultiTouch: false,
      startX: 0,
      startY: 0,
      startTime: 0,
      lastPoint: null,
      initialPinchDist: 0,
      initialPinchScale: 1,
      initialPinchMidpoint: null,
      initialPinchPan: { x: 0, y: 0 },
      lastTapTime: 0,
      lastTapPos: { x: 0, y: 0 }
    };

    const onPointerDown = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;

      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) { }

      const rect = canvas.getBoundingClientRect();
      const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      activePointers.set(e.pointerId, pt);

      const count = activePointers.size;

      if (count === 1) {
        setIsDragging(true);
        gestureState.hadMultiTouch = false;
        gestureState.startX = pt.x;
        gestureState.startY = pt.y;
        gestureState.startTime = Date.now();
        gestureState.lastPoint = { ...pt };
      } else if (count === 2) {
        setIsDragging(true);
        gestureState.hadMultiTouch = true;
        const pts = Array.from(activePointers.values());
        const dx = pts[1].x - pts[0].x;
        const dy = pts[1].y - pts[0].y;
        gestureState.initialPinchDist = Math.hypot(dx, dy) || 1;
        gestureState.initialPinchScale = scaleRef.current;
        gestureState.initialPinchMidpoint = {
          x: (pts[0].x + pts[1].x) / 2,
          y: (pts[0].y + pts[1].y) / 2
        };
        gestureState.initialPinchPan = { ...panRef.current };
      } else {
        gestureState.hadMultiTouch = true;
      }
    };

    const onPointerMove = (e) => {
      if (!activePointers.has(e.pointerId)) return;
      const rect = canvas.getBoundingClientRect();
      const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      activePointers.set(e.pointerId, pt);

      const count = activePointers.size;
      const img = imgRef.current;
      if (!img) return;

      if (count === 2) {
        // Pinch zoom: zooms around the midpoint between fingers and pans with it
        const pts = Array.from(activePointers.values());
        const currentDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
        const currentMidpoint = {
          x: (pts[0].x + pts[1].x) / 2,
          y: (pts[0].y + pts[1].y) / 2
        };

        const ratio = currentDist / gestureState.initialPinchDist;
        let newScale = gestureState.initialPinchScale * ratio;
        newScale = Math.min(Math.max(newScale, 1), 5);

        const cWidth = canvas.clientWidth;
        const cHeight = canvas.clientHeight;
        const iWidth = img.offsetWidth;
        const iHeight = img.offsetHeight;
        const left0 = (cWidth - iWidth) / 2;
        const top0 = (cHeight - iHeight) / 2;

        const uX = (gestureState.initialPinchMidpoint.x - left0 - gestureState.initialPinchPan.x) / gestureState.initialPinchScale;
        const uY = (gestureState.initialPinchMidpoint.y - top0 - gestureState.initialPinchPan.y) / gestureState.initialPinchScale;

        const rawX = currentMidpoint.x - left0 - newScale * uX;
        const rawY = currentMidpoint.y - top0 - newScale * uY;

        const clamped = clampPan(newScale, rawX, rawY);
        scaleRef.current = newScale;
        panRef.current = clamped;
        applyTransform(false);
      } else if (count === 1 && gestureState.lastPoint) {
        if (scaleRef.current > 1) {
          // When scale > 1, one-finger drag pans the image and must never change the image
          const deltaX = pt.x - gestureState.lastPoint.x;
          const deltaY = pt.y - gestureState.lastPoint.y;
          gestureState.lastPoint = { ...pt };

          const newX = panRef.current.x + deltaX;
          const newY = panRef.current.y + deltaY;
          const clamped = clampPan(scaleRef.current, newX, newY);
          panRef.current = clamped;
          applyTransform(false);
        }
      }
    };

    const onPointerUp = (e) => {
      if (!activePointers.has(e.pointerId)) return;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (_) { }

      const rect = canvas.getBoundingClientRect();
      const endPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      activePointers.delete(e.pointerId);

      const remainingCount = activePointers.size;

      // If one finger lifts after a pinch and the other is still down, keep panning and do not navigate
      if (remainingCount === 1) {
        const remainingPt = activePointers.values().next().value;
        gestureState.lastPoint = { ...remainingPt };
        return;
      }

      if (remainingCount === 0) {
        setIsDragging(false);

        // If scale ends below 1.02, snap back to exactly 1 with no offset
        if (scaleRef.current < 1.02) {
          scaleRef.current = 1;
          panRef.current = { x: 0, y: 0 };
          applyTransform(true);
          setDisplayScale(1);
        } else {
          const clamped = clampPan(scaleRef.current, panRef.current.x, panRef.current.y);
          panRef.current = clamped;
          applyTransform(true);
          setDisplayScale(scaleRef.current);
        }

        const now = Date.now();
        const dxTotal = endPt.x - gestureState.startX;
        const dyTotal = endPt.y - gestureState.startY;
        const isTap = Math.hypot(dxTotal, dyTotal) < 15 && (now - gestureState.startTime) < 300 && !gestureState.hadMultiTouch;

        // Double-tap toggles zoom (about 2.5x at tap point, or back to 1)
        if (isTap) {
          const timeSinceLastTap = now - gestureState.lastTapTime;
          const distFromLastTap = Math.hypot(endPt.x - gestureState.lastTapPos.x, endPt.y - gestureState.lastTapPos.y);

          if (timeSinceLastTap < 350 && distFromLastTap < 40) {
            gestureState.lastTapTime = 0;
            if (scaleRef.current > 1.05) {
              scaleRef.current = 1;
              panRef.current = { x: 0, y: 0 };
              applyTransform(true);
              setDisplayScale(1);
            } else {
              zoomAtPoint(2.5, endPt.x, endPt.y);
            }
            return;
          } else {
            gestureState.lastTapTime = now;
            gestureState.lastTapPos = { ...endPt };
          }
        }

        // Swipe left/right changes the image ONLY when not zoomed (scale <= 1.02)
        // and the gesture never had two fingers down. Must be clearly horizontal (|dx| > 60px and |dx| > 1.5 * |dy|).
        if (scaleRef.current <= 1.02 && !gestureState.hadMultiTouch) {
          const absDx = Math.abs(dxTotal);
          const absDy = Math.abs(dyTotal);
          if (absDx > 60 && absDx > 1.5 * absDy) {
            if (dxTotal < 0) {
              handleNextRef.current?.();
            } else {
              handlePrevRef.current?.();
            }
          }
        }
      }
    };

    // Desktop mouse wheel zoom around cursor
    const onWheel = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      let newScale = scaleRef.current * zoomFactor;
      newScale = Math.min(Math.max(newScale, 1), 5);

      if (newScale < 1.02) {
        scaleRef.current = 1;
        panRef.current = { x: 0, y: 0 };
        applyTransform(true);
        setDisplayScale(1);
        return;
      }

      const img = imgRef.current;
      if (!img) return;

      const cWidth = canvas.clientWidth;
      const cHeight = canvas.clientHeight;
      const iWidth = img.offsetWidth;
      const iHeight = img.offsetHeight;
      const left0 = (cWidth - iWidth) / 2;
      const top0 = (cHeight - iHeight) / 2;

      const uX = (cursorX - left0 - panRef.current.x) / scaleRef.current;
      const uY = (cursorY - top0 - panRef.current.y) / scaleRef.current;

      const newX = cursorX - left0 - newScale * uX;
      const newY = cursorY - top0 - newScale * uY;

      const clamped = clampPan(newScale, newX, newY);
      scaleRef.current = newScale;
      panRef.current = clamped;
      applyTransform(false);
      setDisplayScale(newScale);
    };

    // iOS Safari prevention of page-level pinch fighting the viewer
    const preventGesture = (e) => e.preventDefault();

    canvas.addEventListener("pointerdown", onPointerDown, { signal });
    canvas.addEventListener("pointermove", onPointerMove, { signal });
    canvas.addEventListener("pointerup", onPointerUp, { signal });
    canvas.addEventListener("pointercancel", onPointerUp, { signal });
    canvas.addEventListener("wheel", onWheel, { passive: false, signal });
    canvas.addEventListener("gesturestart", preventGesture, { passive: false, signal });
    canvas.addEventListener("gesturechange", preventGesture, { passive: false, signal });
    canvas.addEventListener("gestureend", preventGesture, { passive: false, signal });

    const onResize = () => {
      if (scaleRef.current > 1) {
        const clamped = clampPan(scaleRef.current, panRef.current.x, panRef.current.y);
        panRef.current = clamped;
        applyTransform(false);
      }
    };
    window.addEventListener("resize", onResize, { signal });

    // Initial transform application when canvas mounts
    requestAnimationFrame(() => {
      applyTransform(false);
    });

    return () => {
      ac.abort();
    };
  }, [lightboxData, applyTransform, clampPan, zoomAtPoint]);

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
                      onClick={() => {
                        setSelectedModel(model.id);
                        if (selectedType === "cluster") {
                          setSelectedType("5day");
                        }
                      }}
                      className={`toggle-btn ${selectedModel === model.id && selectedType !== "cluster" ? "active" : ""}`}
                    >
                      {model.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Forecast Horizon (5-Day / 15-Day / Cluster Selector) */}
              <div className="horizon-selector">
                <button
                  onClick={() => setSelectedType("5day")}
                  className={`horizon-btn ${selectedType === "5day" ? "active" : ""}`}
                >
                  <span>5-Day</span><span className="horizon-btn-extra"> Forecast</span>
                </button>
                <button
                  onClick={() => setSelectedType("15day")}
                  className={`horizon-btn ${selectedType === "15day" ? "active" : ""}`}
                >
                  <span>15-Day</span><span className="horizon-btn-extra"> Forecast</span>
                </button>
                <button
                  onClick={() => setSelectedType("cluster")}
                  className={`horizon-btn horizon-cluster-btn ${selectedType === "cluster" ? "active" : ""}`}
                  title="Under-Monitoring LPA & Track Clusters (Press 'C')"
                >
                  <span className="cluster-radar-pulse" />
                  <span>Cluster</span>
                  <span className="cluster-badge-count">{availableClusterList.length || "Live"}</span>
                  <kbd className="cluster-kbd-tag">C</kbd>
                </button>
              </div>

            </div>
          </header>

          {/* Timeline Run Selector Carousel (Hidden in Cluster tracking mode) */}
          {selectedType !== "cluster" && (
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
          <div className={`forecast-grid ${isCompareGrid && selectedType !== "cluster" ? "compare-active" : ""}`}>

            {/* Cluster Under-Monitoring Showcase Mode */}
            {selectedType === "cluster" ? (
              <div className="panel cluster-panel">
                {/* Cluster Toolbar */}
                <div className="cluster-toolbar">
                  <div className="cluster-title-group">
                    <div className="cluster-status-pill">
                      <span className="cluster-status-dot" />
                      <span>UNDER MONITORING SIGNALS</span>
                    </div>
                    <h3 className="cluster-main-title">
                      {isClusterSplitView
                        ? `Dual Model Comparison • ${formatClusterLabel(selectedClusterId)}`
                        : `${formatClusterLabel(activeClusterItem?.atcf_id || activeClusterItem?.storm_id || selectedClusterId)}`}
                    </h3>
                    <span className="cluster-subtitle">
                      AI Cyclogenesis Ensemble Spaghetti Tracking
                    </span>
                  </div>

                  <div className="cluster-actions-group">
                    {/* Cycle Segmented Control */}
                    {availableClusterRuns.length > 1 && (
                      <div className="cluster-cycle-segmented">
                        <span className="cycle-seg-label">Cycle:</span>
                        {availableClusterRuns.map((run) => (
                          <button
                            key={run.key}
                            onClick={() => setSelectedClusterRun(run.key)}
                            className={`cluster-cycle-btn ${activeClusterRunKey === run.key ? "active" : ""}`}
                            title={`Run Initialization: ${run.dateLabel} ${run.cycle}`}
                          >
                            {run.displayLabel}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Model Segmented Control (Active in Single View) */}
                    {!isClusterSplitView && (
                      <div className="cluster-model-segmented">
                        {CLUSTER_MODELS.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => setClusterModel(m.id)}
                            className={`cluster-seg-btn ${clusterModel === m.id ? "active" : ""}`}
                            title={`Switch to ${m.name} (Key: M)`}
                          >
                            <span className="seg-name-full">{m.name}</span>
                            <span className="seg-name-short">{m.shortName}</span>
                            <span className="seg-badge">{m.badge}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Secondary Actions (Side-by-side & Help) */}
                    <div className="cluster-secondary-actions">
                      <button
                        onClick={() => setIsClusterSplitView((prev) => !prev)}
                        className={`cluster-tool-btn cluster-split-toggle-btn ${isClusterSplitView ? "active" : ""}`}
                        title="Toggle Dual Side-by-Side View (Key: D)"
                      >
                        <Columns2 size={14} />
                        <span>{isClusterSplitView ? "Single View" : "Side-by-Side"}</span>
                        <kbd className="kbd-mini">D</kbd>
                      </button>

                      <button
                        onClick={() => setShowClusterHelp(true)}
                        className="cluster-tool-btn cluster-tool-icon-only"
                        title="Keyboard Shortcuts & Gestures (Key: ?)"
                      >
                        <HelpCircle size={15} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Disturbance Cluster Selector Chips */}
                {availableClusterList.length > 0 && (
                  <div className="cluster-lpa-strip">
                    <div className="cluster-strip-label">
                      <Activity size={13} />
                      <span>Clusters:</span>
                    </div>
                    <div className="cluster-chips-scroll">
                      {availableClusterList.map((c, idx) => {
                        const isSelected = selectedClusterId === c.id;
                        const hasInCurrentModel = c.models.includes(clusterModel);
                        return (
                          <button
                            key={c.id}
                            onClick={() => {
                              setSelectedClusterId(c.id);
                              if (!hasInCurrentModel && c.models.length > 0) {
                                setClusterModel(c.models[0]);
                              }
                            }}
                            className={`cluster-lpa-chip ${isSelected ? "active" : ""}`}
                            title={`View ${c.label} (Key: ${idx + 1})`}
                          >
                            <span className="chip-indicator" />
                            <span className="chip-name">{c.label}</span>
                            <kbd className="chip-kbd">{idx + 1}</kbd>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Main Visual Display Area */}
                {isClusterSplitView ? (
                  /* Dual Side-by-Side View */
                  <div className="cluster-split-container">
                    {/* WNCv3 Card */}
                    <div className="cluster-split-card">
                      <div className="cluster-split-header">
                        <div className="split-model-tag v3-tag">GDM WNCv3</div>
                        <span className="split-storm-tag">{formatClusterLabel(splitV3Item?.atcf_id || selectedClusterId)}</span>
                        <span className="split-members-tag">51 Members</span>
                      </div>
                      <div
                        className="cluster-image-wrapper split-image-wrap"
                        onClick={() => splitV3Item && openClusterLightbox(splitV3Item)}
                      >
                        {splitV3Item ? (
                          <img
                            src={getAssetUrl(`/assets/${splitV3Item.filename}`)}
                            alt="GDM WNCv3 Monitoring Plot"
                            className="cluster-img"
                          />
                        ) : (
                          <div className="empty-state">
                            <span>No WNCv3 disturbance signal detected for {formatClusterLabel(selectedClusterId)}.</span>
                          </div>
                        )}
                        <div className="cluster-hover-hint">
                          <Maximize2 size={16} />
                          <span>Click to Expand Lightbox</span>
                        </div>
                      </div>
                    </div>

                    {/* WNC Large Card */}
                    <div className="cluster-split-card">
                      <div className="cluster-split-header">
                        <div className="split-model-tag large-tag">GDM WNC Large</div>
                        <span className="split-storm-tag">{formatClusterLabel(splitLargeItem?.atcf_id || selectedClusterId)}</span>
                        <span className="split-members-tag">1,001 Members</span>
                      </div>
                      <div
                        className="cluster-image-wrapper split-image-wrap"
                        onClick={() => splitLargeItem && openClusterLightbox(splitLargeItem)}
                      >
                        {splitLargeItem ? (
                          <img
                            src={getAssetUrl(`/assets/${splitLargeItem.filename}`)}
                            alt="GDM WNC Large Monitoring Plot"
                            className="cluster-img"
                          />
                        ) : (
                          <div className="empty-state">
                            <span>No WNC Large disturbance signal detected for {formatClusterLabel(selectedClusterId)}.</span>
                          </div>
                        )}
                        <div className="cluster-hover-hint">
                          <Maximize2 size={16} />
                          <span>Click to Expand Lightbox</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Single Active Model Card with Mobile Swipe */
                  <div
                    className="cluster-single-card"
                    onTouchStart={handleClusterTouchStart}
                    onTouchEnd={handleClusterTouchEnd}
                  >
                    <div
                      className="cluster-image-wrapper"
                      onClick={() => activeClusterItem && openClusterLightbox(activeClusterItem)}
                    >
                      {activeClusterItem ? (
                        <img
                          src={getAssetUrl(`/assets/${activeClusterItem.filename}`)}
                          alt={`Monitoring plot for ${formatClusterLabel(activeClusterItem.atcf_id || activeClusterItem.storm_id)}`}
                          className="cluster-img"
                        />
                      ) : (
                        <div className="empty-state">
                          <span>No monitoring graphic available for this selection.</span>
                        </div>
                      )}
                      <div className="cluster-hover-hint">
                        <Maximize2 size={16} />
                        <span>Click to Zoom & Pan (or Press Space)</span>
                      </div>
                    </div>

                    {/* Mobile Swipe Guidance and Quick Stepper */}
                    <div className="cluster-mobile-bar">
                      <button
                        onClick={handlePrevCluster}
                        className="mobile-stepper-btn"
                        disabled={availableClusterList.length <= 1}
                      >
                        <ChevronLeft size={16} />
                        <span>Prev</span>
                      </button>

                      <div className="mobile-swipe-indicator">
                        <span>{formatClusterLabel(selectedClusterId)} • Swipe image or tap buttons</span>
                      </div>

                      <button
                        onClick={handleNextCluster}
                        className="mobile-stepper-btn"
                        disabled={availableClusterList.length <= 1}
                      >
                        <span>Next</span>
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : isCompareGrid ? (
              /* Comparison Grid mode view */
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

              /* Single Model Mode View (Forecast Map) */
              <div className="panel image-panel">
                <div className="panel-header">
                  <span>{currentTrack ? `${currentTrack.name} (${selectedType.toUpperCase()})` : "Forecast map"}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span className="mono-badge">
                      {selectedModelTime}
                    </span>
                  </div>
                </div>

                {/* Standard Forecast Map */}
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
              </div>
            )}

            {/* Sidebar / Metadata Controls */}
            <aside className="panel metadata-panel" style={isCompareGrid && selectedType !== "cluster" ? { width: "100%", gridColumn: "1 / -1" } : {}}>
              {/* Conditional Cluster Meta or Standard Run Details */}
              {selectedType === "cluster" ? (
                <div className="metadata-section">
                  <div className="cluster-meta-header">
                    <span className="cluster-live-tag">LIVE CLUSTER ANALYSIS</span>
                  </div>
                  <h2>Under-Monitoring Details</h2>
                  <dl className="details-list">
                    <div className="detail-item">
                      <dt>Disturbance Target</dt>
                      <dd className="highlight-text">{formatClusterLabel(activeClusterItem?.atcf_id || activeClusterItem?.storm_id || selectedClusterId)}</dd>
                    </div>
                    <div className="detail-item">
                      <dt>Cluster Reference</dt>
                      <dd className="mono-value">{formatClusterLabel(activeClusterItem?.atcf_id || selectedClusterId)} (Under Monitoring)</dd>
                    </div>
                    <div className="detail-item">
                      <dt>Model System</dt>
                      <dd className="mono-value">
                        {clusterModel === "gdm_wnc_large" ? "GDM WNC Large (1,001 Members)" : "GDM WNCv3 (64 Members)"}
                      </dd>
                    </div>
                    <div className="detail-item">
                      <dt>Cycle Run</dt>
                      <dd className="mono-value">
                        {activeClusterItem ? `${activeClusterItem.init_date} ${activeClusterItem.cycle}` : "Latest 00Z"}
                      </dd>
                    </div>
                    <div className="detail-item">
                      <dt>Disturbance Nursery</dt>
                      <dd>Western North Pacific / Caroline-Marianas</dd>
                    </div>
                    <div className="detail-item">
                      <dt>Official ATCF Status</dt>
                      <dd style={{ color: "#38bdf8", fontWeight: 700 }}>Pre-Classification Monitoring</dd>
                    </div>
                  </dl>
                  <div className="cluster-shortcuts-hint-box" onClick={() => setShowClusterHelp(true)}>
                    <Command size={13} />
                    <span>Shortcuts: <kbd>C</kbd> Horizon, <kbd>M</kbd> Model, <kbd>1-4</kbd> Cluster, <kbd>Space</kbd> Zoom</span>
                  </div>
                </div>
              ) : (
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
          >
            {/* Top Navigation Bar: Brand Pill on Left, Model Switcher in Center, Zoom & Close on Right */}
            <div className="lightbox-top-bar" onClick={(e) => e.stopPropagation()}>
              <div className="lightbox-brand-group">
                <span className="lightbox-brand-title">
                  {lightboxData?.isCluster
                    ? lightboxData.title
                    : lightboxIndex !== null && availableGridItems[lightboxIndex]
                      ? availableGridItems[lightboxIndex].model.name.toUpperCase()
                      : lightboxData.title}
                </span>
                <span className="lightbox-brand-badge">{lightboxData?.isCluster ? "CLUSTER" : "MAINLINE"}</span>
              </div>

              {lightboxData?.isCluster ? (
                activeLightboxClusterList.length > 1 && (
                  <div className="lightbox-model-tabs-center">
                    {activeLightboxClusterList.map((item, idx) => {
                      const clusterId = item.atcf_id || item.storm_id;
                      const isCurrent = (lightboxData.item?.atcf_id || lightboxData.item?.storm_id) === clusterId;
                      return (
                        <button
                          key={item.filename || idx}
                          className={`lightbox-tab-pill ${isCurrent ? "active" : ""}`}
                          onClick={() => {
                            setLightboxIndex(idx);
                            setLightboxData({
                              src: getAssetUrl(`/assets/${item.filename}`),
                              title: `${formatClusterLabel(clusterId)} • ${item.model === "gdm_wnc_large" ? "GDM WNC Large" : "GDM WNCv3"} (${item.cycle || "00Z"})`,
                              isCluster: true,
                              item
                            });
                          }}
                        >
                          {formatClusterLabel(clusterId)}
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                availableGridItems.length > 1 && (
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
                        }}
                      >
                        {item.model.name}
                      </button>
                    ))}
                  </div>
                )
              )}

              <div className="lightbox-top-actions">
                <span className="zoom-value-text">Zoom: {displayScale.toFixed(1)}x</span>
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
            >
              <img
                ref={imgRef}
                src={lightboxData.src}
                alt={lightboxData.title}
                className="lightbox-img"
              />
            </div>

            {/* Bottom Stepper Pill Bar: < Prev • Dots • Next > */}
            {(lightboxData?.isCluster ? activeLightboxClusterList.length > 1 : availableGridItems.length > 1) && (
              <div className="lightbox-bottom-stepper" onClick={(e) => e.stopPropagation()}>
                <button className="stepper-btn" onClick={handlePrevLightbox} aria-label="Previous">
                  <ChevronLeft size={16} />
                  <span>Prev</span>
                </button>

                <div className="stepper-dots">
                  {(lightboxData?.isCluster ? activeLightboxClusterList : availableGridItems).map((item, idx) => {
                    const isActive = lightboxData?.isCluster
                      ? (lightboxData.item?.atcf_id || lightboxData.item?.storm_id) === (item.atcf_id || item.storm_id)
                      : idx === lightboxIndex;
                    return (
                      <span
                        key={idx}
                        className={`stepper-dot ${isActive ? "active" : ""}`}
                        onClick={() => {
                          if (lightboxData?.isCluster) {
                            setLightboxIndex(idx);
                            setLightboxData({
                              src: getAssetUrl(`/assets/${item.filename}`),
                              title: `${formatClusterLabel(item.atcf_id || item.storm_id)} • ${item.model === "gdm_wnc_large" ? "GDM WNC Large" : "GDM WNCv3"} (${item.cycle || "00Z"})`,
                              isCluster: true,
                              item
                            });
                          } else {
                            setLightboxIndex(idx);
                            setLightboxData({
                              src: item.track.imageSrc,
                              title: `${item.model.name} (${selectedType.toUpperCase()})`
                            });
                          }
                        }}
                      />
                    );
                  })}
                </div>

                <button className="stepper-btn" onClick={handleNextLightbox} aria-label="Next">
                  <span>Next</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Keyboard Shortcuts & Gestures Modal */}
        {showClusterHelp && (
          <div className="cluster-help-backdrop" onClick={() => setShowClusterHelp(false)}>
            <div className="cluster-help-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="help-dialog-header">
                <div className="help-title-wrap">
                  <Command size={18} />
                  <h4>Cluster Monitoring Shortcuts</h4>
                </div>
                <button className="help-close-btn" onClick={() => setShowClusterHelp(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="help-dialog-body">
                <div className="shortcut-row">
                  <span className="shortcut-desc">Toggle Cluster view</span>
                  <kbd className="shortcut-key">C</kbd>
                </div>
                <div className="shortcut-row">
                  <span className="shortcut-desc">Toggle Model (WNCv3 ↔ Large)</span>
                  <kbd className="shortcut-key">M</kbd>
                </div>
                <div className="shortcut-row">
                  <span className="shortcut-desc">Side-by-Side Dual View</span>
                  <kbd className="shortcut-key">D</kbd>
                </div>
                <div className="shortcut-row">
                  <span className="shortcut-desc">Next / Previous Cluster</span>
                  <div className="shortcut-keys-group">
                    <kbd className="shortcut-key">←</kbd>
                    <kbd className="shortcut-key">→</kbd>
                  </div>
                </div>
                <div className="shortcut-row">
                  <span className="shortcut-desc">Direct jump to Cluster 1 – 4</span>
                  <div className="shortcut-keys-group">
                    <kbd className="shortcut-key">1</kbd>
                    <kbd className="shortcut-key">2</kbd>
                    <kbd className="shortcut-key">3</kbd>
                    <kbd className="shortcut-key">4</kbd>
                  </div>
                </div>
                <div className="shortcut-row">
                  <span className="shortcut-desc">Open Fullscreen Lightbox Zoom</span>
                  <kbd className="shortcut-key">Space</kbd>
                </div>
                <div className="shortcut-row">
                  <span className="shortcut-desc">Zoom In / Out in Lightbox</span>
                  <div className="shortcut-keys-group">
                    <kbd className="shortcut-key">+</kbd>
                    <kbd className="shortcut-key">-</kbd>
                  </div>
                </div>
                <div className="shortcut-row">
                  <span className="shortcut-desc">Close Lightbox / Exit Cluster View</span>
                  <kbd className="shortcut-key">Esc</kbd>
                </div>
              </div>
              <div className="help-dialog-footer">
                <span>📱 Touch gestures: Swipe left/right on mobile image to switch clusters</span>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
};

export default Forecast;
