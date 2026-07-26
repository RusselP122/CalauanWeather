import React, { useState, useEffect } from 'react';
import * as turf from '@turf/turf';

// Define bounding polygons for Luzon, Visayas, and Mindanao
const REGIONS = {
  Luzon: turf.polygon([[
    [117.0, 12.1], // Includes Palawan North / Mindoro
    [117.0, 21.0], // Batanes/Babuyan islands North
    [126.5, 21.0],
    [126.5, 12.1],
    [117.0, 12.1]
  ]]),
  Visayas: turf.polygon([[
    [121.0, 9.0],
    [121.0, 12.1],
    [126.5, 12.1],
    [126.5, 9.0],
    [121.0, 9.0]
  ]]),
  Mindanao: turf.polygon([[
    [119.0, 5.0],
    [119.0, 9.0],
    [126.8, 9.0],
    [126.8, 5.0],
    [119.0, 5.0]
  ]])
};

const INTENSITIES = [
  { id: "STY", label: "Super Typhoon (≥185 km/h)", min: 185, max: Infinity },
  { id: "TY", label: "Typhoon (118-184 km/h)", min: 118, max: 184 },
  { id: "STS", label: "Severe TS (89-117 km/h)", min: 89, max: 117 },
  { id: "TS", label: "Tropical Storm (62-88 km/h)", min: 62, max: 88 },
  { id: "TD", label: "Tropical Dep (39-61 km/h)", min: 39, max: 61 },
  { id: "LPA", label: "Low Pressure (<39 km/h)", min: 0, max: 38 },
];

// Rough bounding box for the Philippines to determine Landfall/Graze
const PH_BOX = turf.polygon([[
  [117.0, 5.0],
  [117.0, 19.5],
  [122.5, 19.5],
  [126.5, 10.0],
  [126.5, 5.0],
  [117.0, 5.0]
]]);

export default function EnsembleFilter({ tracks, onFilterChange, isActive, isLocked }) {
  const [selectedIntensities, setSelectedIntensities] = useState(new Set());
  const [selectedRegion, setSelectedRegion] = useState("");
  const [trajectory, setTrajectory] = useState(""); // "landfall", "graze", "recurve"

  // Calculate if a track reaches given intensity
  const trackMeetsIntensity = (track) => {
    if (selectedIntensities.size === 0) return true;
    const maxWind = Math.max(...track.map(p => isNaN(p.windKmh) ? 0 : p.windKmh));
    for (const intensityId of selectedIntensities) {
      const category = INTENSITIES.find(i => i.id === intensityId);
      if (category && maxWind >= category.min && maxWind <= category.max) {
        return true;
      }
    }
    return false;
  };

  // Calculate if a track passes through/intersects a region
  const trackHitsRegion = (track) => {
    if (!selectedRegion) return true;
    if (track.length < 2) return false;
    const regionPolygon = REGIONS[selectedRegion];
    if (!regionPolygon) return true;

    try {
      const line = turf.lineString(track.map(p => [p.lon, p.lat]));
      return turf.booleanIntersects(line, regionPolygon);
    } catch (e) {
      console.warn("Turf intersection error for region:", e);
      return false;
    }
  };

  const trackMatchesTrajectory = (track) => {
    if (!trajectory) return true;
    if (track.length < 2) return false;

    if (trajectory === "recurve") {
      // Recurve definition: Goes west, then turns north/east
      const lons = track.map(p => p.lon);
      const minLon = Math.min(...lons);
      const minLonIdx = lons.indexOf(minLon);
      const finalLon = track[track.length - 1].lon;
      const finalLat = track[track.length - 1].lat;
      const initialLat = track[0].lat;

      // If it turns back east significantly (more than 2 degrees from its westernmost point)
      // and goes north
      return finalLon > minLon + 2 && finalLat > initialLat + 5 && minLonIdx < track.length - 2;
    }

    try {
      const line = turf.lineString(track.map(p => [p.lon, p.lat]));

      // Check intersection with PH
      let intersectsPH = false;
      let intersectsGraze = false;

      intersectsPH = turf.booleanIntersects(line, PH_BOX);

      // Buffered box for graze (approx 2 degrees / 120 miles)
      const grazeBox = turf.buffer(PH_BOX, 150, { units: 'miles' });
      intersectsGraze = turf.booleanIntersects(line, grazeBox);

      if (trajectory === "landfall") return intersectsPH;
      if (trajectory === "graze") return intersectsGraze && !intersectsPH;
    } catch (e) {
      console.warn("Turf intersection error:", e);
      return false;
    }

    return true;
  };

  useEffect(() => {
    if (!isActive || !tracks || tracks.length === 0) {
      onFilterChange(null, null);
      return;
    }

    if (selectedIntensities.size === 0 && !selectedRegion && !trajectory) {
      onFilterChange(null, null);
      return;
    }

    const filteredIds = new Set();
    tracks.forEach((track, index) => {
      if (trackMeetsIntensity(track) && trackHitsRegion(track) && trackMatchesTrajectory(track)) {
        filteredIds.add(index);
      }
    });

    const trajLabels = {
      "landfall": "PH Landfall",
      "graze": "Graze",
      "recurve": "Recurve"
    };

    onFilterChange(filteredIds, {
      intensities: Array.from(selectedIntensities).join(", "),
      region: selectedRegion,
      trajectory: trajectory ? trajLabels[trajectory] : ""
    });
  }, [tracks, selectedIntensities, selectedRegion, trajectory, isActive, onFilterChange]);

  if (!isActive) return null;

  const toggleIntensity = (id) => {
    setSelectedIntensities(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="mt-4 animate-fade-in relative">
      <h2 className="spaghetti-section-title">
        <svg className="spaghetti-section-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
        Ensemble Filter
      </h2>

      {isLocked && (
        <div className="absolute top-[28px] inset-x-0 bottom-0 z-10 flex flex-col items-center justify-center bg-slate-950/75 backdrop-blur-[3px] rounded-2xl border border-slate-800/40 mt-2">
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="text-slate-400 mb-2"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          <span className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-widest">Requires FNV3 Large</span>
        </div>
      )}

      <div className={`p-4 rounded-2xl border border-white/8 bg-[#0a1224]/50 backdrop-blur-xl shadow-2xl mt-2 ${isLocked ? 'opacity-40 pointer-events-none' : ''}`}>

        <div className="mb-4">
          <div className="text-[10px] text-slate-400 mb-2 uppercase font-extrabold tracking-wider">Peak Intensity Reached</div>
          <div className="segmented-control" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '10px' }}>
            {INTENSITIES.map(int => (
              <button
                key={int.id}
                onClick={() => toggleIntensity(int.id)}
                className={`segment-btn ${selectedIntensities.has(int.id) ? "active primary" : ""}`}
                style={{ padding: '6px 4px', borderRadius: '6px' }}
              >
                <span className="segment-label" style={{ fontSize: '9px', fontWeight: '800' }}>{int.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
          <div>
            <div className="text-[10px] text-slate-400 mb-2 uppercase font-extrabold tracking-wider">PH Landfall Region</div>
            <select
              className="w-full bg-black/30 border border-white/8 rounded-xl p-2.5 text-slate-200 text-xs font-semibold outline-none focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff] transition-all cursor-pointer"
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
            >
              <option value="">Any / No Filter</option>
              {Object.keys(REGIONS).map(regionName => (
                <option key={regionName} value={regionName}>{regionName}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-[10px] text-slate-400 mb-2 uppercase font-extrabold tracking-wider">Trajectory</div>
            <select
              className="w-full bg-black/30 border border-white/8 rounded-xl p-2.5 text-slate-200 text-xs font-semibold outline-none focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff] transition-all cursor-pointer"
              value={trajectory}
              onChange={(e) => setTrajectory(e.target.value)}
            >
              <option value="">Any Trajectory</option>
              <option value="landfall">Direct PH Landfall</option>
              <option value="graze">Graze (Near PH)</option>
              <option value="recurve">Recurve</option>
            </select>
          </div>
        </div>

        {(selectedIntensities.size > 0 || selectedRegion || trajectory) && (
          <div className="mt-4 text-right">
            <button
              onClick={() => { setSelectedIntensities(new Set()); setSelectedRegion(""); setTrajectory(""); }}
              className="text-[10px] font-extrabold text-rose-400 hover:text-rose-300 bg-rose-950/20 hover:bg-rose-950/45 border border-rose-900/50 px-4 py-2 rounded-xl transition-all"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
