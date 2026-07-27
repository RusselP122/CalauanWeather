import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './NewsNotification.css';

const Bell = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const X = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const CHANGELOG = [
  {
    id: 11,
    date: 'July 27, 2026',
    title: 'Calauan Weather V1.5 - Official CLUP Barangay Map & ECMWF IFS 0.25° Portal',
    description: 'Welcome to Calauan Weather V1.5! This major update brings a dedicated meteorological dashboard for Calauan, Laguna powered by live ECMWF IFS 0.25° data. Features include: (1) Official Municipal CLUP Boundary Vector Map covering all 18 official barangays & sectors (Limao, Perez, Mabacan, Paliparan, Balayhangin, Imok, Prinza, Masiit, Hanggan, Bangyas, San Isidro, Kanluran, Silangan, Lamot 1, Lamot 2, Dayap, Santo Tomas) with live rainfall and wind overlay badges; (2) Multi-touch Map Zoom (+/-), Reset (↺), and Drag-Panning; (3) 7-day forecast grid, 24h hourly timeline slider, and agricultural advisory; (4) Dynamic local PHST clock & mobile responsive UI overhaul.'
  },
  {
    id: 10,
    date: 'June 11, 2026',
    title: 'Run-to-Run Forecast Trends',
    description: 'Introducing Run-to-Run Forecast Trends! Track how tropical cyclone forecasts evolve across the last 4 model cycles. See genesis probability trends, peak wind intensity changes, and ensemble agreement. Available for both FNV3 Base (50-member) and Large (1000-member) ensembles with 5-day and 15-day horizons.'
  },
  {
    id: 9,
    date: 'May 27, 2026',
    title: 'Premium Ensemble Mean Interaction & Hover Card UI',
    description: 'A major interactive and visual upgrade has arrived! Click any ensemble mean track dot or segment to slide open a beautiful, ultra-compact details card displaying chronological storm track steps. On mobile devices, the card floats cleanly at the top of the screen. You can hover over forecast dots to see a gorgeous glassmorphic date/time and warning-colored wind speed popup, and click directly on any table row to instantly select and center on that dot!'
  },
  {
    id: 8,
    date: 'May 23, 2026',
    title: 'NOAA AI-GEFS Integration',
    description: 'The Artificial Intelligence Global Ensemble Forecast System (AI-GEFS) from NOAA is now fully integrated into the Interactive Ensemble Tracker! Explore the newest AI-driven weather tracking directly on the map.'
  },
  {
    id: 7,
    date: 'May 21, 2026',
    title: 'Tropical Cyclone Development Outlook',
    description: 'We will create a Tropical Cyclone Development Area Outlook in FNV3 and ECMWF to help identify potential genesis and monitoring zones for developing tropical disturbances. It will soon be deploy on the website.'
  },
  {
    id: 6,
    date: 'May 20, 2026',
    title: 'Ensemble Filter',
    description: 'Take control of large forecasts with the new Ensemble Filter! Now available on the FNV3 Large dataset, this powerful tool lets you filter through massive ensemble member tracks dynamically by Peak Intensity (from Super Typhoon down to Low Pressure Areas), PH Landfall Regions (Luzon, Visayas, Mindanao), and Trajectory behavior (Direct Landfall, Graze, or Recurve).'
  },
  {
    id: 5,
    date: 'May 19, 2026',
    title: 'Redesigned Track Markers',
    description: 'Forecast track markers across all models (FNV3, ECMWF IFS, AIFS) have been redesigned to a clean donut/ring style — transparent center with a vibrant pressure-colored border and a subtle shadow — both on the static forecast maps and the interactive Ensemble Tracker.'
  },
  {
    id: 4,
    date: 'May 18, 2026',
    title: 'ECMWF AIFS Integration',
    description: 'The Artificial Intelligence Forecasting System (AIFS) from ECMWF is now fully integrated into the Interactive Ensemble Tracker.'
  },
  {
    id: 1,
    date: 'May 17, 2026',
    title: 'Ensemble Mean',
    description: 'Ensemble Mean computation now strictly requires a minimum of 25 members for FNV3/ECMWF datasets for accurate mean track.'
  },
  {
    id: 2,
    date: 'May 15, 2026',
    title: 'ECMWF IFS Integration',
    description: 'The ECMWF IFS model is now fully integrated into the Interactive Ensemble Tracker.'
  },
  {
    id: 3,
    date: 'May 15, 2026',
    title: 'GIF Export',
    description: 'Exported GIFs from the Interactive Ensemble Tracker now automatically include the precise dataset name in the filename for better organization.'
  }
];

export default function NewsNotification() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    // Check if the user has seen the latest update
    const lastSeenId = localStorage.getItem('calauan_weather_last_seen_news');
    if (!lastSeenId || parseInt(lastSeenId, 10) < CHANGELOG[0].id) {
      setHasUnread(true);
    }
  }, []);

  const openNews = () => {
    setIsOpen(true);
    setHasUnread(false);
    setCurrentPage(1);
    localStorage.setItem('calauan_weather_last_seen_news', CHANGELOG[0].id.toString());
  };

  const totalPages = Math.ceil(CHANGELOG.length / itemsPerPage);
  const currentItems = CHANGELOG.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <>
      <button
        className={`news-bell-btn ${hasUnread ? 'has-unread' : ''}`}
        onClick={openNews}
        title="What's New"
      >
        <Bell size={20} />
        {hasUnread && <span className="unread-dot" />}
      </button>

      {isOpen && createPortal(
        <div className="news-overlay" onClick={() => setIsOpen(false)}>
          <div className="news-modal" onClick={e => e.stopPropagation()}>
            <div className="news-header">
              <h2>What's New in Calauan Weather V1.5</h2>
              <button className="news-close-btn" onClick={() => setIsOpen(false)}>
                <X size={24} />
              </button>
            </div>

            <div className="news-content">
              {currentItems.map(item => (
                <div key={item.id} className="news-item">
                  <div className="news-item-header">
                    <span className="news-date">{item.date}</span>
                    {item.id === CHANGELOG[0].id && <span className="news-badge-new">NEW</span>}
                  </div>
                  <h3 className="news-title">{item.title}</h3>
                  <p className="news-desc">{item.description}</p>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="news-pagination">
                <button
                  className="news-page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="news-page-info">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="news-page-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
