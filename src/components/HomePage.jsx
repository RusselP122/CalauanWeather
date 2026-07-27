import React, { useEffect, useState, useMemo } from 'react';
import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudLightning,
  CloudFog,
  Wind,
  Droplets,
  Gauge,
  Thermometer,
  Eye,
  Sunrise,
  Sunset,
  Clock,
  Calendar,
  AlertTriangle,
  Info,
  CheckCircle,
  TrendingUp,
  MapPin,
  Compass,
  ChevronRight
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import Navbar from './Navbar';
import CalauanMap from './CalauanMap';
import NewsNotification from './NewsNotification';
import './HomePage.css';

// Coordinates for Calauan, Laguna
const CALAUAN_LAT = 14.1492;
const CALAUAN_LNG = 121.3152;

// WMO Weather Code Interpreter
const getWeatherDetails = (code) => {
  switch (code) {
    case 0:
      return { label: 'Clear Sky', icon: Sun, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
    case 1:
      return { label: 'Mainly Clear', icon: Sun, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
    case 2:
      return { label: 'Partly Cloudy', icon: CloudSun, color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' };
    case 3:
      return { label: 'Overcast', icon: Cloud, color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' };
    case 45:
    case 48:
      return { label: 'Foggy', icon: CloudFog, color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' };
    case 51:
    case 53:
    case 55:
      return { label: 'Light Drizzle', icon: CloudRain, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' };
    case 61:
    case 63:
      return { label: 'Moderate Rain', icon: CloudRain, color: '#0284c7', bg: 'rgba(2, 132, 199, 0.15)' };
    case 65:
      return { label: 'Heavy Downpour', icon: CloudRain, color: '#2563eb', bg: 'rgba(37, 99, 235, 0.2)' };
    case 80:
    case 81:
    case 82:
      return { label: 'Passing Rain Showers', icon: CloudRain, color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' };
    case 95:
      return { label: 'Thunderstorm', icon: CloudLightning, color: '#eab308', bg: 'rgba(234, 179, 8, 0.2)' };
    case 96:
    case 99:
      return { label: 'Severe Thunderstorm & Hail', icon: CloudLightning, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)' };
    default:
      return { label: 'Partly Cloudy', icon: CloudSun, color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' };
  }
};

// Cardinal Direction Helper
const getWindDirectionStr = (deg) => {
  if (deg === undefined || deg === null) return 'N/A';
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(deg / 22.5) % 16;
  return directions[index];
};

const HomePage = () => {
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [chartMetric, setChartMetric] = useState('temp'); // 'temp' | 'rain' | 'wind'
  const [currentTimeStr, setCurrentTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeString = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      setCurrentTimeStr(`${timeString} PHST`);
    };

    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchEcmwfData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Open-Meteo ECMWF IFS 0.25° High Resolution Forecast API
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${CALAUAN_LAT}&longitude=${CALAUAN_LNG}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,pressure_msl,cloud_cover,wind_speed_10m,wind_direction_10m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant&models=ecmwf_ifs025&timezone=Asia%2FManila`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`ECMWF IFS API responded with status ${response.status}`);
      }
      const data = await response.json();
      setWeatherData(data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching ECMWF IFS forecast:', err);
      // Fallback request to seamless ECMWF endpoint if ifs025 has temporary rate-limit
      try {
        const fallbackUrl = `https://api.open-meteo.com/v1/forecast?latitude=${CALAUAN_LAT}&longitude=${CALAUAN_LNG}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,pressure_msl,cloud_cover,wind_speed_10m,wind_direction_10m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant&timezone=Asia%2FManila`;
        const res = await fetch(fallbackUrl);
        const data = await res.json();
        setWeatherData(data);
        setLoading(false);
      } catch (fallbackErr) {
        setError('Unable to fetch live ECMWF IFS weather data. Please check connection.');
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchEcmwfData();
  }, []);

  // Daily Data Parser (7 Days)
  const dailyList = useMemo(() => {
    if (!weatherData || !weatherData.daily) return [];
    const d = weatherData.daily;
    return d.time.map((t, idx) => {
      const dateObj = new Date(t);
      const dayName = idx === 0 ? 'Today' : dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const fullDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const code = d.weather_code[idx];
      const details = getWeatherDetails(code);

      return {
        index: idx,
        date: t,
        dayName,
        fullDate,
        code,
        details,
        tempMax: Math.round(d.temperature_2m_max[idx]),
        tempMin: Math.round(d.temperature_2m_min[idx]),
        apparentMax: Math.round(d.apparent_temperature_max[idx]),
        apparentMin: Math.round(d.apparent_temperature_min[idx]),
        precipSum: d.precipitation_sum[idx]?.toFixed(1) || '0.0',
        precipProb: d.precipitation_probability_max ? d.precipitation_probability_max[idx] : 30,
        windMax: Math.round(d.wind_speed_10m_max[idx]),
        windDirDeg: d.wind_direction_10m_dominant ? d.wind_direction_10m_dominant[idx] : 90,
        uvMax: d.uv_index_max[idx]?.toFixed(1) || '0.0',
        sunrise: d.sunrise[idx] ? new Date(d.sunrise[idx]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '05:45 AM',
        sunset: d.sunset[idx] ? new Date(d.sunset[idx]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '06:25 PM',
      };
    });
  }, [weatherData]);

  // Current Weather Slice (First hourly point matching current hour)
  const currentWeather = useMemo(() => {
    if (!weatherData || !weatherData.hourly) return null;
    const h = weatherData.hourly;
    const now = new Date();
    const currentIsoHour = now.toISOString().slice(0, 13); // e.g. "2026-07-27T08"

    let matchIdx = h.time.findIndex((t) => t.startsWith(currentIsoHour));
    if (matchIdx === -1) matchIdx = 0;

    const code = h.weather_code[matchIdx];
    const details = getWeatherDetails(code);

    return {
      temp: Math.round(h.temperature_2m[matchIdx]),
      apparent: Math.round(h.apparent_temperature[matchIdx]),
      humidity: h.relative_humidity_2m[matchIdx],
      precipProb: h.precipitation_probability ? h.precipitation_probability[matchIdx] : 20,
      precip: h.precipitation[matchIdx],
      pressure: Math.round(h.pressure_msl[matchIdx]),
      cloudCover: h.cloud_cover[matchIdx],
      windSpeed: Math.round(h.wind_speed_10m[matchIdx]),
      windDirDeg: h.wind_direction_10m[matchIdx],
      windDirStr: getWindDirectionStr(h.wind_direction_10m[matchIdx]),
      uvIndex: (h.uv_index && h.uv_index[matchIdx] != null)
        ? Number(h.uv_index[matchIdx]).toFixed(1)
        : (weatherData.daily && weatherData.daily.uv_index_max ? Number(weatherData.daily.uv_index_max[0]).toFixed(1) : '0.0'),
      details,
      code
    };
  }, [weatherData]);

  // Hourly Slice for Charts & Slider (24 Hours for selected day)
  const hourlyChartData = useMemo(() => {
    if (!weatherData || !weatherData.hourly) return [];
    const h = weatherData.hourly;
    const targetDateStr = dailyList[selectedDayIndex]?.date;
    if (!targetDateStr) return [];

    const indices = [];
    h.time.forEach((t, i) => {
      if (t.startsWith(targetDateStr)) {
        indices.push(i);
      }
    });

    return indices.map((i) => {
      const dateObj = new Date(h.time[i]);
      const timeLabel = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return {
        time: timeLabel,
        rawTime: h.time[i],
        temp: Math.round(h.temperature_2m[i]),
        apparent: Math.round(h.apparent_temperature[i]),
        precipProb: h.precipitation_probability ? h.precipitation_probability[i] : 0,
        precip: h.precipitation ? parseFloat(h.precipitation[i].toFixed(1)) : 0,
        windSpeed: Math.round(h.wind_speed_10m[i]),
        pressure: Math.round(h.pressure_msl[i]),
        weatherCode: h.weather_code[i]
      };
    });
  }, [weatherData, selectedDayIndex, dailyList]);

  // Selected Day summary
  const selectedDay = dailyList[selectedDayIndex] || dailyList[0];

  return (
    <div className="homepage-wrapper">
      <Navbar />

      <main className="dashboard-main-container">
        {/* Dashboard Top Header Bar */}
        <div className="dashboard-top-bar">
          <div className="top-bar-location">
            <div className="top-bar-icon-box">
              <MapPin size={20} />
            </div>
            <div>
              <h2 className="top-bar-title">Calauan Weather Dashboard</h2>
              <div className="top-bar-subtitle">
                <span>Laguna Province (14.1492° N, 121.3152° E)</span>
              </div>
            </div>
          </div>

          <div className="top-bar-actions">
            <NewsNotification />
          </div>
        </div>
        {loading ? (
          <div className="dashboard-loading-state">
            <div className="loading-icon-wrapper">
              <CloudSun size={38} className="loading-weather-icon" />
              <div className="loading-spinner-ring"></div>
            </div>
            <h3 className="loading-title">LOADING PLEASE WAIT...</h3>
            <p className="loading-subtitle">Processing 7-day meteorological grids for Calauan, Laguna</p>
          </div>
        ) : error ? (
          <div className="dashboard-error-state">
            <AlertTriangle size={36} color="#ef4444" />
            <h3>Data Connection Error</h3>
            <p>{error}</p>
            <button className="retry-btn" onClick={fetchEcmwfData}>Retry Sync</button>
          </div>
        ) : (
          <>
            {/* Current Weather & Map Layout Grid */}
            <div className="current-weather-grid">
              {/* Left Column: Current Weather Overview */}
              {currentWeather && (
                <div className="current-weather-card">
                  <div className="card-top-bar">
                    <div className="location-pill">
                      <MapPin size={14} />
                      <span>Calauan, Laguna (Central Station)</span>
                    </div>
                    <div className="live-status-tag">
                      <span className="pulse-dot"></span> CURRENT WEATHER {currentTimeStr ? `• ${currentTimeStr}` : ''}
                    </div>
                  </div>

                  <div className="hero-weather-main">
                    <div className="temperature-group">
                      <span className="temp-value">{currentWeather.temp}°</span>
                      <span className="temp-unit">C</span>
                      <div className="feels-like-tag">
                        Feels like <strong className="text-white">{currentWeather.apparent}°C</strong>
                      </div>
                    </div>

                    <div className="condition-visual">
                      <currentWeather.details.icon
                        size={64}
                        color={currentWeather.details.color}
                        className="weather-hero-icon"
                      />
                      <span className="condition-label" style={{ color: currentWeather.details.color }}>
                        {currentWeather.details.label}
                      </span>
                    </div>
                  </div>

                  {/* Today's High/Low & Sunrise/Sunset Summary Row */}
                  <div className="day-summary-row">
                    <div className="summary-badge">
                      <Thermometer size={14} className="badge-icon" />
                      <span>Today: <strong className="text-white">{dailyList[0]?.tempMax}°C</strong> High • <strong className="text-muted">{dailyList[0]?.tempMin}°C</strong> Low</span>
                    </div>

                    <div className="sun-times-group">
                      <div className="sun-item" title="Sunrise Time">
                        <Sunrise size={14} color="#f59e0b" />
                        <span>{dailyList[0]?.sunrise || '05:45 AM'}</span>
                      </div>
                      <div className="sun-item" title="Sunset Time">
                        <Sunset size={14} color="#f97316" />
                        <span>{dailyList[0]?.sunset || '06:25 PM'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Key Metrics Dashboard Grid */}
                  <div className="metrics-grid">
                    <div className="metric-tile">
                      <Droplets className="metric-icon" size={18} />
                      <div className="metric-data">
                        <span className="metric-value">{currentWeather.humidity}%</span>
                        <span className="metric-label">Relative Humidity</span>
                      </div>
                    </div>

                    <div className="metric-tile">
                      <Wind className="metric-icon" size={18} />
                      <div className="metric-data">
                        <span className="metric-value">{currentWeather.windSpeed} km/h</span>
                        <span className="metric-label">Wind ({currentWeather.windDirStr})</span>
                      </div>
                    </div>

                    <div className="metric-tile">
                      <Gauge className="metric-icon" size={18} />
                      <div className="metric-data">
                        <span className="metric-value">{currentWeather.pressure} hPa</span>
                        <span className="metric-label">Barometric Pressure</span>
                      </div>
                    </div>

                    <div className="metric-tile">
                      <CloudRain className="metric-icon" size={18} />
                      <div className="metric-data">
                        <span className="metric-value">{currentWeather.precipProb}%</span>
                        <span className="metric-label">Precip Probability</span>
                      </div>
                    </div>

                    <div className="metric-tile">
                      <Sun className="metric-icon" size={18} />
                      <div className="metric-data">
                        <span className="metric-value">{currentWeather.uvIndex}</span>
                        <span className="metric-label">UV Index (Max)</span>
                      </div>
                    </div>

                    <div className="metric-tile">
                      <Cloud className="metric-icon" size={18} />
                      <div className="metric-data">
                        <span className="metric-value">{currentWeather.cloudCover}%</span>
                        <span className="metric-label">Cloud Cover</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Right Column: Calauan Municipal Map (ph_municipalities.json) */}
              <CalauanMap currentWeather={currentWeather} selectedDay={selectedDay} />
            </div>

            {/* Calauan Pineapple & Agricultural Advisory Banner */}
            <div className="agricultural-advisory-banner">
              <div className="advisory-icon-wrapper">
                <AlertTriangle className="advisory-icon" size={24} />
              </div>
              <div className="advisory-content">
                <h4 className="advisory-title">
                  Calauan Municipality Agricultural & Pineapple Plantation Bulletin
                </h4>
                <p className="advisory-text">
                  {selectedDay.precipSum > 10.0 ? (
                    <>⚠️ <strong>Heavy Rainfall Advisory:</strong> Expected rainfall of <strong>{selectedDay.precipSum} mm</strong> may cause localized field water accumulation in pineapple & rice farming sectors across Calauan barangays.</>
                  ) : selectedDay.tempMax > 33 ? (
                    <>☀️ <strong>High Heat Index Alert:</strong> Peak afternoon temperatures reaching <strong>{selectedDay.tempMax}°C</strong>. Farmers and agricultural personnel are advised to schedule field operations during early morning hours.</>
                  ) : (
                    <>✅ <strong>Optimal Operational Status:</strong> Favorable atmospheric conditions for pineapple harvesting, transport, and municipal outdoor activities in Calauan, Laguna.</>
                  )}
                </p>
              </div>
            </div>

            {/* 7-Day ECMWF IFS Forecast Cards Section */}
            <section className="forecast-section">
              <div className="section-header">
                <div>
                  <h2 className="section-title">7-Day ECMWF IFS Forecast</h2>
                  <p className="section-subtitle">Select any day below to view detailed hourly atmospheric trends & charts</p>
                </div>
                <div className="forecast-days-pill">7 DAYS OUTLOOK</div>
              </div>

              <div className="forecast-cards-grid">
                {dailyList.map((day, idx) => {
                  const isSelected = selectedDayIndex === idx;
                  const IconComp = day.details.icon;

                  return (
                    <div
                      key={day.date}
                      className={`forecast-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedDayIndex(idx)}
                    >
                      <div className="card-day-header">
                        <span className="day-name">{day.dayName}</span>
                        <span className="day-date">{day.fullDate}</span>
                      </div>

                      <div className="card-icon-container">
                        <IconComp size={40} color={day.details.color} />
                      </div>

                      <div className="card-condition-text" style={{ color: day.details.color }}>
                        {day.details.label}
                      </div>

                      <div className="card-temp-range">
                        <span className="temp-high">{day.tempMax}°</span>
                        <div className="temp-bar-bg">
                          <div
                            className="temp-bar-fill"
                            style={{
                              left: `${Math.max(0, ((day.tempMin - 20) / 20) * 100)}%`,
                              right: `${Math.max(0, 100 - ((day.tempMax - 20) / 20) * 100)}%`
                            }}
                          ></div>
                        </div>
                        <span className="temp-low">{day.tempMin}°</span>
                      </div>

                      <div className="card-meta">
                        <div className="meta-item">
                          <CloudRain size={12} />
                          <span>{day.precipProb}% ({day.precipSum}mm)</span>
                        </div>
                        <div className="meta-item">
                          <Wind size={12} />
                          <span>{day.windMax} km/h</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Interactive Visual Analytics Section (Recharts) */}
            <section className="analytics-section">
              <div className="analytics-header">
                <div>
                  <h3 className="analytics-title">
                    Hourly Atmospheric Trends — {selectedDay.dayName} ({selectedDay.fullDate})
                  </h3>
                  <p className="analytics-subtitle">High-resolution ECMWF IFS 0.25° model predictions</p>
                </div>

                <div className="chart-tab-group">
                  <button
                    className={`chart-tab ${chartMetric === 'temp' ? 'active' : ''}`}
                    onClick={() => setChartMetric('temp')}
                  >
                    <Thermometer size={14} /> Temperature (°C)
                  </button>
                  <button
                    className={`chart-tab ${chartMetric === 'rain' ? 'active' : ''}`}
                    onClick={() => setChartMetric('rain')}
                  >
                    <CloudRain size={14} /> Rain Probability & Volume
                  </button>
                  <button
                    className={`chart-tab ${chartMetric === 'wind' ? 'active' : ''}`}
                    onClick={() => setChartMetric('wind')}
                  >
                    <Wind size={14} /> Wind Speed & Pressure
                  </button>
                </div>
              </div>

              <div className="chart-canvas-wrapper">
                <ResponsiveContainer width="100%" height={320}>
                  {chartMetric === 'temp' ? (
                    <AreaChart data={hourlyChartData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="apparentGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} domain={['dataMin - 2', 'dataMax + 2']} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0d182a', borderColor: '#00d4ff', borderRadius: '8px', color: '#fff' }}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="temp" name="Air Temp (°C)" stroke="#00d4ff" strokeWidth={3} fillOpacity={1} fill="url(#tempGradient)" />
                      <Area type="monotone" dataKey="apparent" name="Feels Like (°C)" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" fillOpacity={1} fill="url(#apparentGradient)" />
                    </AreaChart>
                  ) : chartMetric === 'rain' ? (
                    <BarChart data={hourlyChartData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
                      <YAxis yAxisId="left" stroke="#38bdf8" fontSize={11} unit="%" domain={[0, 100]} />
                      <YAxis yAxisId="right" orientation="right" stroke="#0284c7" fontSize={11} unit="mm" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0d182a', borderColor: '#38bdf8', borderRadius: '8px', color: '#fff' }}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="precipProb" name="Precip Probability (%)" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="right" dataKey="precip" name="Rainfall Volume (mm)" fill="#0284c7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : (
                    <AreaChart data={hourlyChartData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="windGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#10b981" fontSize={11} unit=" km/h" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0d182a', borderColor: '#10b981', borderRadius: '8px', color: '#fff' }}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="windSpeed" name="Wind Speed (km/h)" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#windGradient)" />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            </section>

            {/* Scrollable Hourly Timeline Slider */}
            <section className="timeline-slider-section">
              <h4 className="slider-title">24-Hour Timeline Stream ({selectedDay.dayName})</h4>
              <div className="timeline-track-container">
                {hourlyChartData.map((hour, idx) => {
                  const details = getWeatherDetails(hour.weatherCode);
                  const IconComp = details.icon;

                  return (
                    <div key={hour.rawTime} className="timeline-hour-card">
                      <span className="hour-time">{hour.time}</span>
                      <IconComp size={24} color={details.color} className="hour-icon" />
                      <span className="hour-temp">{hour.temp}°C</span>
                      <div className="hour-rain">
                        <Droplets size={10} />
                        <span>{hour.precipProb}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default HomePage;
