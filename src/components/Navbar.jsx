import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { CloudSun, Navigation, Activity, Menu, X } from 'lucide-react';
import './Navbar.css';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  return (
    <header className="site-navbar">
      <div className="navbar-container">
        {/* Brand Logo & Municipality Identity */}
        <NavLink to="/" className="navbar-brand" onClick={closeMenu}>
          <div className="brand-logo-wrapper">
            <img
              src="/logo.png"
              alt="Calauan Weather Seal"
              className="brand-logo-img"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <div className="brand-icon-fallback">
              <CloudSun className="brand-icon" />
            </div>
          </div>
          <div className="brand-text">
            <div className="brand-title">
              CALAUAN <span className="brand-accent">WEATHER</span>
            </div>
          </div>
        </NavLink>

        {/* Mobile Menu Button */}
        <button className="mobile-toggle-btn" onClick={toggleMenu} aria-label="Toggle navigation menu">
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* Navigation Links */}
        <nav className={`navbar-menu ${isOpen ? 'is-active' : ''}`}>
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMenu}
          >
            <CloudSun className="nav-icon" size={18} />
            <span>Calauan Dashboard</span>
          </NavLink>

          <NavLink
            to="/forecast"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMenu}
          >
            <Navigation className="nav-icon" size={18} />
            <span>Ensemble Track</span>
          </NavLink>

          <NavLink
            to="/spaghetti"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMenu}
          >
            <Activity className="nav-icon" size={18} />
            <span>Spaghetti Ensemble</span>
          </NavLink>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
