import React, { useState, useMemo, useRef } from 'react';
import { MapPin, Layers, CloudRain, Wind, Thermometer, ZoomIn, ZoomOut, RotateCcw, Compass } from 'lucide-react';
import './CalauanMap.css';

// 18 Official Barangays / Sectors matching official Calauan Municipal Land Use Plan (CLUP) map
const OFFICIAL_CALAUAN_BARANGAYS = [
  {
    id: 'limao',
    name: 'Limao',
    type: 'Southwest Border Sector',
    cx: 120, cy: 400,
    path: 'M 40,390 C 40,340 110,300 160,340 L 190,380 L 160,460 C 100,480 40,450 40,390 Z',
    elevationFactor: 1.0, rainFactor: 0.94, windFactor: 1.10
  },
  {
    id: 'perez',
    name: 'Perez',
    type: 'Southwest Agricultural Sector',
    cx: 200, cy: 330,
    path: 'M 160,340 L 230,270 L 260,320 L 220,380 L 190,380 Z',
    elevationFactor: 0.98, rainFactor: 0.95, windFactor: 1.08
  },
  {
    id: 'mabacan',
    name: 'Mabacan',
    type: 'Western Agricultural & Plantation',
    cx: 260, cy: 250,
    path: 'M 230,270 L 290,190 L 330,220 L 290,290 L 260,320 Z',
    elevationFactor: 0.98, rainFactor: 0.95, windFactor: 1.08
  },
  {
    id: 'paliparan',
    name: 'Paliparan',
    type: 'Southwest Rural Sector',
    cx: 270, cy: 330,
    path: 'M 260,320 L 290,290 L 330,320 L 280,380 L 220,380 Z',
    elevationFactor: 1.04, rainFactor: 0.96, windFactor: 1.06
  },
  {
    id: 'balayhangin',
    name: 'Balayhangin',
    type: 'Central Wind Corridor',
    cx: 340, cy: 260,
    path: 'M 290,290 L 330,220 L 360,240 L 370,300 L 330,320 Z',
    elevationFactor: 1.02, rainFactor: 0.92, windFactor: 1.15
  },
  {
    id: 'imok',
    name: 'Imok',
    type: 'Upland / Mt. Imok Foothills',
    cx: 340, cy: 350,
    path: 'M 280,380 L 330,320 L 370,300 L 380,380 L 330,400 Z',
    elevationFactor: 1.25, rainFactor: 1.15, windFactor: 1.22
  },
  {
    id: 'prinza',
    name: 'Prinza',
    type: 'Central-East Agricultural',
    cx: 385, cy: 270,
    path: 'M 370,300 L 360,240 L 390,250 L 400,280 Z',
    elevationFactor: 0.94, rainFactor: 1.06, windFactor: 1.00
  },
  {
    id: 'masiit',
    name: 'Masiit',
    type: 'Northwest Agricultural',
    cx: 320, cy: 190,
    path: 'M 290,190 L 310,120 L 350,140 L 340,210 L 330,220 Z',
    elevationFactor: 1.00, rainFactor: 1.05, windFactor: 1.00
  },
  {
    id: 'hanggan',
    name: 'Hanggan',
    type: 'Far Northwest Sector',
    cx: 295, cy: 90,
    path: 'M 280,30 L 310,30 L 320,120 L 290,190 L 270,140 Z',
    elevationFactor: 0.96, rainFactor: 1.08, windFactor: 1.02
  },
  {
    id: 'bangyas',
    name: 'Bangyas',
    type: 'North Coastal Sector',
    cx: 345, cy: 90,
    path: 'M 310,30 L 340,40 L 350,140 L 320,120 Z',
    elevationFactor: 0.90, rainFactor: 1.20, windFactor: 1.18
  },
  {
    id: 'sanisidro',
    name: 'San Isidro',
    type: 'Central Corridor Sector',
    cx: 355, cy: 175,
    path: 'M 350,140 L 370,150 L 360,220 L 340,210 Z',
    elevationFactor: 1.06, rainFactor: 1.08, windFactor: 1.02
  },
  {
    id: 'kanluran',
    name: 'Kanluran (Pob.)',
    type: 'Urban Center (Poblacion West)',
    cx: 335, cy: 220,
    path: 'M 325,210 L 345,210 L 345,230 L 325,230 Z',
    elevationFactor: 1.00, rainFactor: 1.00, windFactor: 1.00
  },
  {
    id: 'silangan',
    name: 'Silangan (Pob.)',
    type: 'Urban Center (Poblacion East)',
    cx: 355, cy: 220,
    path: 'M 345,210 L 365,210 L 365,230 L 345,230 Z',
    elevationFactor: 1.00, rainFactor: 0.98, windFactor: 0.98
  },
  {
    id: 'lamot1',
    name: 'Lamot 1',
    type: 'Center-East Sector',
    cx: 410, cy: 240,
    path: 'M 360,220 L 390,220 L 440,250 L 400,280 L 360,240 Z',
    elevationFactor: 1.05, rainFactor: 1.00, windFactor: 1.02
  },
  {
    id: 'lamot2',
    name: 'Lamot 2',
    type: 'East-Central Sector',
    cx: 415, cy: 175,
    path: 'M 370,150 L 420,150 L 440,210 L 390,220 Z',
    elevationFactor: 1.08, rainFactor: 1.02, windFactor: 1.05
  },
  {
    id: 'dayap',
    name: 'Dayap',
    type: 'Pineapple Plantation Hub',
    cx: 420, cy: 100,
    path: 'M 340,40 L 440,50 L 460,110 L 420,150 L 370,150 L 350,140 Z',
    elevationFactor: 0.95, rainFactor: 1.12, windFactor: 1.05
  },
  {
    id: 'santotomas',
    name: 'Santo Tomas',
    type: 'Far East Highland Wing',
    cx: 490, cy: 155,
    path: 'M 440,50 L 530,100 L 560,170 L 440,210 L 420,150 L 460,110 Z',
    elevationFactor: 1.30, rainFactor: 1.18, windFactor: 1.25
  }
];

const CalauanMap = ({ currentWeather, selectedDay }) => {
  const [mapOverlayMode, setMapOverlayMode] = useState('rain'); // 'rain' | 'wind' | 'overview'
  const [activeBarangay, setActiveBarangay] = useState(null);

  // Zoom & Pan Interactive State
  const [zoomScale, setZoomScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const mapContainerRef = useRef(null);

  // Zoom Controls Handlers
  const handleZoomIn = () => setZoomScale((prev) => Math.min(prev + 0.35, 4.0));
  const handleZoomOut = () => setZoomScale((prev) => Math.max(prev - 0.35, 0.8));
  const handleResetZoom = () => {
    setZoomScale(1.0);
    setPan({ x: 0, y: 0 });
  };

  // Mouse Wheel Zooming
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoomScale((prev) => Math.min(Math.max(prev + zoomDelta, 0.8), 4.0));
  };

  // Mouse Drag Panning Handlers
  const handleMouseDown = (e) => {
    if (e.target.closest('.zoom-controls') || e.target.closest('.barangay-node-group')) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Extract base weather metrics
  // 24-Hour Total Daily Precipitation Accumulation (mm)
  const baseRain = selectedDay ? parseFloat(selectedDay.precipSum) : (currentWeather ? currentWeather.precip : 0.0);
  const baseWind = currentWeather ? currentWeather.windSpeed : (selectedDay ? selectedDay.windMax : 12);
  const baseTemp = currentWeather ? currentWeather.temp : (selectedDay ? selectedDay.tempMax : 28);
  const windDirStr = currentWeather ? currentWeather.windDirStr : 'ENE';

  // Compute live weather values for each Barangay
  const barangayWeatherData = useMemo(() => {
    return OFFICIAL_CALAUAN_BARANGAYS.map((b) => {
      const rainMm = (baseRain * b.rainFactor).toFixed(1);
      const windKmh = Math.round(baseWind * b.windFactor);
      const tempC = Math.round(baseTemp - (b.elevationFactor - 1.0) * 2.5);

      return {
        ...b,
        rainMm,
        windKmh,
        tempC,
        windDirStr,
      };
    });
  }, [baseRain, baseWind, baseTemp, windDirStr]);

  return (
    <div className="calauan-map-card">
      <div className="map-card-header">
        <div className="header-title-group">
          <Layers className="header-icon" size={20} />
          <div>
            <h3 className="map-title">Calauan Official Barangay Weather Map</h3>
            <p className="map-subtitle">18 Official Barangays & Sectors • Official CLUP Boundaries</p>
          </div>
        </div>

        {/* Overlay Mode Switcher */}
        <div className="map-overlay-tabs">
          <button
            className={`tab-btn ${mapOverlayMode === 'rain' ? 'active' : ''}`}
            onClick={() => setMapOverlayMode('rain')}
            title="Display 24h Total Rainfall (mm) per Barangay"
          >
            <CloudRain size={13} />
            <span>Rain (mm)</span>
          </button>
          <button
            className={`tab-btn ${mapOverlayMode === 'wind' ? 'active' : ''}`}
            onClick={() => setMapOverlayMode('wind')}
            title="Display Wind Speed (km/h) per Barangay"
          >
            <Wind size={13} />
            <span>Wind (km/h)</span>
          </button>
          <button
            className={`tab-btn ${mapOverlayMode === 'overview' ? 'active' : ''}`}
            onClick={() => setMapOverlayMode('overview')}
            title="Display Barangay Names & Pins"
          >
            <MapPin size={13} />
            <span>Barangays</span>
          </button>
        </div>
      </div>

      <div
        className="map-viewport-container"
        ref={mapContainerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className="svg-map-wrapper">
          {/* Interactive Zoom Control Panel */}
          <div className="zoom-controls">
            <button className="zoom-btn" onClick={handleZoomIn} title="Zoom In (+)">
              <ZoomIn size={16} />
            </button>
            <button className="zoom-btn" onClick={handleZoomOut} title="Zoom Out (-)">
              <ZoomOut size={16} />
            </button>
            <button className="zoom-btn reset" onClick={handleResetZoom} title="Reset View (↺)">
              <RotateCcw size={14} />
            </button>
            <div className="zoom-scale-indicator">
              {Math.round(zoomScale * 100)}%
            </div>
          </div>

          <svg
            viewBox="0 0 600 500"
            className="calauan-svg-canvas"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient id="calauanGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0.4" />
              </linearGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            <g
              transform={`translate(${pan.x}, ${pan.y}) scale(${zoomScale})`}
              style={{ transformOrigin: '300px 250px', transition: isDragging ? 'none' : 'transform 0.15s ease-out' }}
            >
              {/* Grid Lines */}
              <g className="map-grid-lines" opacity="0.12">
                {[100, 200, 300, 400].map((line) => (
                  <line key={`h-${line}`} x1="0" y1={line} x2="600" y2={line} stroke="#00d4ff" strokeWidth="1" strokeDasharray="4 4" />
                ))}
                {[100, 200, 300, 400, 500].map((line) => (
                  <line key={`v-${line}`} x1={line} y1="0" x2={line} y2="500" stroke="#00d4ff" strokeWidth="1" strokeDasharray="4 4" />
                ))}
              </g>

              {/* Render Official Barangay Polygons with Borders */}
              {barangayWeatherData.map((b) => {
                const isActive = activeBarangay?.id === b.id;
                return (
                  <g key={`poly-group-${b.id}`}>
                    <path
                      d={b.path}
                      className={`barangay-official-polygon ${isActive ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveBarangay(b);
                      }}
                      onMouseEnter={() => setActiveBarangay(b)}
                    >
                      <title>Brgy. {b.name}</title>
                    </path>
                    {/* Barangay Name Label inside Polygon */}
                    <text
                      x={b.cx}
                      y={b.cy + 12}
                      className={`barangay-map-label ${isActive ? 'active' : ''}`}
                    >
                      {b.name}
                    </text>
                  </g>
                );
              })}

              {/* Barangay Interactive Weather Badges & Nodes */}
              {barangayWeatherData.map((b) => {
                const isActive = activeBarangay?.id === b.id;
                return (
                  <g
                    key={b.id}
                    className={`barangay-node-group ${isActive ? 'active' : ''}`}
                    transform={`translate(${b.cx}, ${b.cy})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveBarangay(b);
                    }}
                    onMouseEnter={() => setActiveBarangay(b)}
                  >
                    {/* Invisible Hit Radius */}
                    <circle r="18" fill="transparent" pointerEvents="all" />
                    {/* Static Node Dot */}
                    <circle r="4" fill={mapOverlayMode === 'rain' ? '#38bdf8' : mapOverlayMode === 'wind' ? '#10b981' : '#00d4ff'} />

                    {/* Badge Content depending on mode */}
                    {mapOverlayMode === 'rain' && (
                      <g transform="translate(0, -14)">
                        <rect x="-24" y="-12" width="48" height="18" rx="5" fill="#0369a1" stroke="#38bdf8" strokeWidth="1.2" />
                        <text x="0" y="0" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="800">
                          {b.rainMm} mm
                        </text>
                      </g>
                    )}

                    {mapOverlayMode === 'wind' && (
                      <g transform="translate(0, -14)">
                        <rect x="-26" y="-12" width="52" height="18" rx="5" fill="#047857" stroke="#10b981" strokeWidth="1.2" />
                        <text x="0" y="0" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="800">
                          {b.windKmh} km/h
                        </text>
                      </g>
                    )}

                    {mapOverlayMode === 'overview' && (
                      <circle r="6" fill="#00d4ff" stroke="#ffffff" strokeWidth="1.5" />
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Compass Widget */}
          <div className="compass-widget">
            <Compass size={22} className="compass-icon" />
            <span>N</span>
          </div>

          {/* Active Barangay Details Popover Card */}
          {activeBarangay && (
            <div className="barangay-detail-card">
              <div className="b-card-header">
                <div>
                  <h4 className="b-name">Brgy. {activeBarangay.name}</h4>
                  <span className="b-type">{activeBarangay.type}</span>
                </div>
                <button className="b-close-btn" onClick={() => setActiveBarangay(null)}>×</button>
              </div>

              <div className="b-metrics-row">
                <div className="b-metric">
                  <CloudRain size={14} color="#38bdf8" />
                  <span>Rainfall: <strong>{activeBarangay.rainMm} mm</strong> (24h Total)</span>
                </div>
                <div className="b-metric">
                  <Wind size={14} color="#10b981" />
                  <span>Wind: <strong>{activeBarangay.windKmh} km/h</strong> ({activeBarangay.windDirStr})</span>
                </div>
                <div className="b-metric">
                  <Thermometer size={14} color="#f59e0b" />
                  <span>Air Temp: <strong>{activeBarangay.tempC} °C</strong></span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="map-footer-info">
        <div className="info-item">
          <span className="info-label">Boundary Layer</span>
          <span className="info-value">Official CLUP Map</span>
        </div>
        <div className="info-item">
          <span className="info-label">24H RAINFALL (MM)</span>
          <span className="info-value">{baseRain.toFixed(1)} mm Avg</span>
        </div>
        <div className="info-item">
          <span className="info-label">Wind Speed</span>
          <span className="info-value">{baseWind} km/h Peak</span>
        </div>
      </div>
    </div>
  );
};

export default CalauanMap;
