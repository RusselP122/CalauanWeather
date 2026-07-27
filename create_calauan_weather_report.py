#!/usr/bin/env python3
"""
Calauan Weather Report Infographic Generator — v3
---------------------------------------------------
Premium broadcast-quality single-day weather report.
- Accurate Calauan municipal boundary from OpenStreetMap Nominatim
- Matplotlib-drawn weather condition icons (no emoji)
- Today-only forecast with large period cards

Layout:
  ┌────────────────────────────────────────────────────┐
  │  HEADER — Logo • Title • Model Badge • Timestamp   │
  ├───────────────┬────────────────────────────────────┤
  │               │   TODAY • Monday, Jul 28, 2026     │
  │   CALAUAN     ├──────────┬──────────┬──────────────┤
  │   ACCURATE    │ MORNING  │AFTERNOON │   EVENING    │
  │   BOUNDARY    │  [icon]  │  [icon]  │   [icon]     │
  │   MAP         │  28.3°C  │  30.2°C  │   25.3°C     │
  │  (18 bgys)    │  data..  │  data..  │   data..     │
  ├───────────────┴──────────┴──────────┴──────────────┤
  │  DISCLAIMER — PAGASA / MDRRMO                      │
  └────────────────────────────────────────────────────┘
"""

import os
import sys
import math
import requests
import json
from datetime import datetime, timezone, timedelta
from PIL import Image

import numpy as np
import matplotlib
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.patheffects as pe
from matplotlib.gridspec import GridSpec
from matplotlib.offsetbox import OffsetImage, AnnotationBbox
from matplotlib.patches import Circle, FancyArrowPatch, Wedge, Polygon, Ellipse

# =============================================================================
# CONFIGURATION
# =============================================================================
CALAUAN_LAT = 14.1492
CALAUAN_LON = 121.3152
TIMEZONE_NAME = "Asia/Manila"

# Color Palette — Midnight Aurora
C = {
    "bg_deep":      "#040810",
    "bg_card":      "#0c1425",
    "bg_card_alt":  "#101d35",
    "border_glow":  "#00b4d8",
    "accent_cyan":  "#00e5ff",
    "accent_blue":  "#3b82f6",
    "accent_gold":  "#fbbf24",
    "accent_rose":  "#fb7185",
    "accent_green": "#34d399",
    "text_white":   "#f1f5f9",
    "text_dim":     "#64748b",
    "text_muted":   "#475569",
    "text_label":   "#94a3b8",
    "divider":      "#1e293b",
    "grid":         "#111d32",
    "red_warn":     "#ef4444",
    "map_fill":     "#060e1e",
}

# Exact barangay label positions (name, lat, lon) geocoded from OpenStreetMap Nominatim
BARANGAY_LABELS = [
    ("Hanggan",       14.2200, 121.2950),
    ("Bangyas",       14.1850, 121.3150),
    ("Dayap",         14.1800, 121.3350),
    ("Santo Tomas",   14.1680, 121.3380),
    ("San Isidro",    14.1620, 121.3100),
    ("Lamot 2",       14.1480, 121.3400),
    ("Masiit",        14.1500, 121.3000),
    ("Silangan",      14.1480, 121.3140),
    ("Kanluran",      14.1470, 121.3080),
    ("Lamot 1",       14.1350, 121.3300),
    ("Prinza",        14.1400, 121.3180),
    ("Mabacan",       14.1350, 121.2900),
    ("Balayhangin",   14.1220, 121.3150),
    ("Paliparan",     14.1200, 121.2780),
    ("Imok",          14.1150, 121.3050),
    ("Perez",         14.1050, 121.2500),
    ("Limao",         14.0900, 121.2300),
    ("Tubuan",        14.1100, 121.2750),
]

# WMO Weather Codes → (Readable, ShortLabel, IconType, AccentColor)
# IconType: "sun", "partly_cloudy", "cloudy", "fog", "drizzle", "rain", "heavy_rain", "thunderstorm"
WMO_CODES = {
    0:  ("Clear Sky",           "Clear",        "sun",           "#fbbf24"),
    1:  ("Mainly Clear",        "Mostly Sunny", "sun",           "#fcd34d"),
    2:  ("Partly Cloudy",       "Partly Cloudy","partly_cloudy", "#38bdf8"),
    3:  ("Overcast",            "Overcast",     "cloudy",        "#94a3b8"),
    45: ("Foggy",               "Fog",          "fog",           "#cbd5e1"),
    48: ("Rime Fog",            "Fog",          "fog",           "#cbd5e1"),
    51: ("Light Drizzle",       "Drizzle",      "drizzle",       "#38bdf8"),
    53: ("Moderate Drizzle",    "Drizzle",      "drizzle",       "#0284c7"),
    55: ("Dense Drizzle",       "Drizzle",      "rain",          "#0284c7"),
    61: ("Slight Rain",         "Light Rain",   "rain",          "#38bdf8"),
    63: ("Moderate Rain",       "Mod. Rain",    "rain",          "#2563eb"),
    65: ("Heavy Rain",          "Heavy Rain",   "heavy_rain",    "#1d4ed8"),
    80: ("Rain Showers",        "Showers",      "rain",          "#38bdf8"),
    81: ("Moderate Showers",    "Showers",      "rain",          "#2563eb"),
    82: ("Violent Showers",     "Heavy Rain",   "heavy_rain",    "#7c3aed"),
    95: ("Thunderstorm",        "T-Storm",      "thunderstorm",  "#dc2626"),
    96: ("T-Storm w/ Hail",     "Hailstorm",    "thunderstorm",  "#b91c1c"),
    99: ("Heavy Thunderstorm",  "Severe Storm", "thunderstorm",  "#991b1b"),
}


def wind_deg_to_compass(deg):
    dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    idx = int((deg + 22.5) // 45) % 8
    return dirs[idx]


def rain_severity_color(prob):
    if prob >= 80:   return "#3b82f6"
    elif prob >= 50: return "#0ea5e9"
    elif prob >= 30: return "#22d3ee"
    else:            return "#94a3b8"


def temp_color(temp):
    if temp >= 33:   return "#ef4444"
    elif temp >= 30: return "#f97316"
    elif temp >= 27: return "#fbbf24"
    elif temp >= 24: return "#34d399"
    else:            return "#38bdf8"


# =============================================================================
# WEATHER ICON DRAWING FUNCTIONS
# =============================================================================
def draw_weather_icon(ax, icon_type, cx, cy, size=0.04):
    """Draw a weather icon centered at (cx, cy) in axes fraction coordinates.
    All drawing uses ax.transAxes."""

    s = size  # base scale unit

    if icon_type == "sun":
        _draw_sun(ax, cx, cy, s)
    elif icon_type == "partly_cloudy":
        _draw_sun(ax, cx - s * 0.3, cy + s * 0.3, s * 0.7)
        _draw_cloud(ax, cx + s * 0.15, cy - s * 0.1, s * 0.85, color="#b0c4de")
    elif icon_type == "cloudy":
        _draw_cloud(ax, cx - s * 0.2, cy + s * 0.1, s * 0.7, color="#8899aa")
        _draw_cloud(ax, cx + s * 0.15, cy - s * 0.15, s * 0.9, color="#94a3b8")
    elif icon_type == "fog":
        _draw_fog(ax, cx, cy, s)
    elif icon_type == "drizzle":
        _draw_cloud(ax, cx, cy + s * 0.2, s * 0.85, color="#7b8fa3")
        _draw_rain_drops(ax, cx, cy - s * 0.3, s, count=3, heavy=False)
    elif icon_type == "rain":
        _draw_cloud(ax, cx, cy + s * 0.25, s * 0.9, color="#6b7f96")
        _draw_rain_drops(ax, cx, cy - s * 0.2, s, count=5, heavy=False)
    elif icon_type == "heavy_rain":
        _draw_cloud(ax, cx, cy + s * 0.25, s * 0.9, color="#4a5e73")
        _draw_rain_drops(ax, cx, cy - s * 0.15, s, count=7, heavy=True)
    elif icon_type == "thunderstorm":
        _draw_cloud(ax, cx, cy + s * 0.3, s * 0.95, color="#374151")
        _draw_lightning(ax, cx, cy - s * 0.1, s)
        _draw_rain_drops(ax, cx + s * 0.4, cy - s * 0.2, s * 0.5, count=3, heavy=True)


def _draw_sun(ax, cx, cy, s):
    """Draw a radiant sun."""
    # Outer glow
    glow = Circle((cx, cy), s * 0.55, transform=ax.transAxes,
                  facecolor="#fbbf24", edgecolor="none", alpha=0.08, zorder=10)
    ax.add_patch(glow)
    # Sun body
    sun = Circle((cx, cy), s * 0.38, transform=ax.transAxes,
                 facecolor="#fbbf24", edgecolor="#f59e0b", linewidth=0.5, alpha=0.95, zorder=11)
    ax.add_patch(sun)
    # Inner highlight
    highlight = Circle((cx - s * 0.08, cy + s * 0.08), s * 0.18, transform=ax.transAxes,
                        facecolor="#fde68a", edgecolor="none", alpha=0.5, zorder=12)
    ax.add_patch(highlight)
    # Rays
    num_rays = 8
    for i in range(num_rays):
        angle = (2 * math.pi / num_rays) * i
        x1 = cx + s * 0.50 * math.cos(angle)
        y1 = cy + s * 0.50 * math.sin(angle)
        x2 = cx + s * 0.75 * math.cos(angle)
        y2 = cy + s * 0.75 * math.sin(angle)
        ax.plot([x1, x2], [y1, y2], color="#fbbf24", linewidth=1.5,
                solid_capstyle="round", transform=ax.transAxes, zorder=10, alpha=0.75)


def _draw_cloud(ax, cx, cy, s, color="#94a3b8"):
    """Draw a fluffy cloud using overlapping ellipses."""
    cloud_parts = [
        (cx - s * 0.35, cy - s * 0.05, s * 0.40, s * 0.30),
        (cx - s * 0.10, cy + s * 0.10, s * 0.45, s * 0.35),
        (cx + s * 0.22, cy + s * 0.05, s * 0.38, s * 0.28),
        (cx + s * 0.40, cy - s * 0.08, s * 0.32, s * 0.25),
        (cx,            cy - s * 0.08, s * 0.65, s * 0.28),
    ]
    # Shadow
    for (ex, ey, ew, eh) in cloud_parts:
        shadow = Ellipse((ex + s * 0.02, ey - s * 0.03), ew, eh,
                         transform=ax.transAxes, facecolor="#000000",
                         edgecolor="none", alpha=0.08, zorder=10)
        ax.add_patch(shadow)
    # Cloud body
    for (ex, ey, ew, eh) in cloud_parts:
        ellip = Ellipse((ex, ey), ew, eh, transform=ax.transAxes,
                        facecolor=color, edgecolor="none", alpha=0.85, zorder=11)
        ax.add_patch(ellip)


def _draw_rain_drops(ax, cx, cy, s, count=5, heavy=False):
    """Draw falling rain drop lines."""
    width = s * 0.7
    lw = 1.8 if heavy else 1.2
    drop_color = "#38bdf8" if not heavy else "#2563eb"
    spacing = width / max(count - 1, 1)
    start_x = cx - width / 2
    for i in range(count):
        x = start_x + i * spacing
        # Stagger vertically
        offset_y = (i % 2) * s * 0.12
        y_top = cy + offset_y
        y_bot = y_top - s * 0.25
        ax.plot([x, x - s * 0.04], [y_top, y_bot], color=drop_color,
                linewidth=lw, solid_capstyle="round",
                transform=ax.transAxes, zorder=12, alpha=0.8)


def _draw_lightning(ax, cx, cy, s):
    """Draw a lightning bolt."""
    bolt_pts = [
        (cx - s * 0.05, cy + s * 0.35),
        (cx + s * 0.05, cy + s * 0.05),
        (cx - s * 0.02, cy + s * 0.05),
        (cx + s * 0.08, cy - s * 0.30),
        (cx - s * 0.03, cy - s * 0.02),
        (cx - s * 0.10, cy - s * 0.02),
    ]
    # Glow
    bolt_glow = Polygon(bolt_pts, closed=True, transform=ax.transAxes,
                        facecolor="#fbbf24", edgecolor="none", alpha=0.15, zorder=11)
    ax.add_patch(bolt_glow)
    # Bolt
    bolt = Polygon(bolt_pts, closed=True, transform=ax.transAxes,
                   facecolor="#fbbf24", edgecolor="#f59e0b", linewidth=0.6, alpha=0.95, zorder=12)
    ax.add_patch(bolt)


def _draw_fog(ax, cx, cy, s):
    """Draw horizontal fog lines."""
    lines_y = [cy + s * 0.25, cy + s * 0.05, cy - s * 0.15, cy - s * 0.35]
    widths =  [s * 0.6, s * 0.75, s * 0.65, s * 0.5]
    for ly, lw in zip(lines_y, widths):
        ax.plot([cx - lw / 2, cx + lw / 2], [ly, ly],
                color="#94a3b8", linewidth=2.5, solid_capstyle="round",
                transform=ax.transAxes, zorder=11, alpha=0.6)


# =============================================================================
# FETCH ACCURATE CALAUAN BOUNDARY FROM OSM
# =============================================================================
def fetch_calauan_boundary():
    """Fetch the actual municipal boundary polygon from OpenStreetMap Nominatim."""
    cache_file = os.path.join(os.getcwd(), "calauan_boundary.json")

    # Use cached file if exists and is recent (< 30 days)
    if os.path.exists(cache_file):
        try:
            age_days = (datetime.now().timestamp() - os.path.getmtime(cache_file)) / 86400
            if age_days < 30:
                with open(cache_file, "r") as f:
                    geo = json.load(f)
                if geo.get("type") in ("Polygon", "MultiPolygon"):
                    print(f"Using cached Calauan boundary ({cache_file})")
                    return geo
        except Exception:
            pass

    # Fetch from Nominatim
    try:
        url = (
            "https://nominatim.openstreetmap.org/search"
            "?q=Calauan+Laguna+Philippines"
            "&format=json&polygon_geojson=1&limit=1"
        )
        resp = requests.get(url, headers={"User-Agent": "CalauanWeatherApp/1.0"}, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if data:
            geo = data[0].get("geojson", {})
            if geo.get("type") in ("Polygon", "MultiPolygon"):
                # Cache it
                with open(cache_file, "w") as f:
                    json.dump(geo, f)
                print(f"Fetched accurate Calauan boundary ({len(data[0].get('geojson', {}).get('coordinates', [[]])[0])} pts)")
                return geo
    except Exception as e:
        print(f"Warning: Could not fetch boundary from Nominatim: {e}")

    return None


# =============================================================================
# FETCH WEATHER DATA (TODAY ONLY)
# =============================================================================
def fetch_weather_forecast():
    """Fetch ECMWF IFS 0.25 model data from Open-Meteo — today only."""
    url = (
        "https://api.open-meteo.com/v1/forecast?"
        f"latitude={CALAUAN_LAT}&longitude={CALAUAN_LON}"
        "&models=ecmwf_ifs025"
        "&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,"
        "precipitation,weather_code,wind_speed_10m,wind_direction_10m"
        "&forecast_days=1"
        f"&timezone={TIMEZONE_NAME.replace('/', '%2F')}"
    )
    print("Fetching ECMWF IFS high-resolution forecast for Calauan...")
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    hourly = data["hourly"]
    times = hourly["time"]
    temps = hourly["temperature_2m"]
    humidities = hourly["relative_humidity_2m"]
    precip_probs = hourly["precipitation_probability"]
    precips = hourly["precipitation"]
    codes = hourly["weather_code"]
    wind_speeds = hourly["wind_speed_10m"]
    wind_dirs = hourly["wind_direction_10m"]

    # Group into periods
    periods = {"morning": [], "afternoon": [], "evening": []}

    for i, t_str in enumerate(times):
        dt = datetime.fromisoformat(t_str)
        hr = dt.hour
        hour_obj = {
            "time": dt,
            "temp": temps[i],
            "humidity": humidities[i],
            "precip_prob": precip_probs[i] if precip_probs[i] is not None else 0,
            "precip": precips[i] if precips[i] is not None else 0.0,
            "code": codes[i],
            "wind_speed": wind_speeds[i],
            "wind_dir": wind_dirs[i]
        }

        if 6 <= hr < 12:
            periods["morning"].append(hour_obj)
        elif 12 <= hr < 18:
            periods["afternoon"].append(hour_obj)
        elif 18 <= hr <= 23 or 0 <= hr < 6:
            periods["evening"].append(hour_obj)

    # Process each period
    now_pht = datetime.now(timezone(timedelta(hours=8)))
    day_label = f"TODAY  \u2022  {now_pht.strftime('%A, %B %d, %Y').upper()}"

    period_summaries = {}
    for p_name in ["morning", "afternoon", "evening"]:
        hrs = periods[p_name]
        if not hrs:
            period_summaries[p_name] = None
            continue

        avg_temp = sum(h["temp"] for h in hrs) / len(hrs)
        max_temp = max(h["temp"] for h in hrs)
        min_temp = min(h["temp"] for h in hrs)
        avg_hum = sum(h["humidity"] for h in hrs) / len(hrs)
        max_prob = max(h["precip_prob"] for h in hrs)
        sum_precip = sum(h["precip"] for h in hrs)
        max_wind = max(h["wind_speed"] for h in hrs)
        avg_wind_dir = sum(h["wind_dir"] for h in hrs) / len(hrs)

        code_counts = {}
        for h in hrs:
            code_counts[h["code"]] = code_counts.get(h["code"], 0) + 1
        dom_code = max(code_counts.keys(), key=lambda c: (code_counts[c], c))

        readable, short_label, icon_type, color = WMO_CODES.get(
            dom_code, ("Fair", "Fair", "sun", "#38bdf8")
        )

        period_summaries[p_name] = {
            "temp_avg": round(avg_temp, 1),
            "temp_max": round(max_temp, 1),
            "temp_min": round(min_temp, 1),
            "humidity": round(avg_hum),
            "precip_prob": round(max_prob),
            "precip_mm": round(sum_precip, 1),
            "wind_speed": round(max_wind, 1),
            "wind_dir_compass": wind_deg_to_compass(avg_wind_dir),
            "condition": readable,
            "short_label": short_label,
            "icon_type": icon_type,
            "color": color,
        }

    return {"date_label": day_label, "periods": period_summaries}


# =============================================================================
# HELPER DRAWING FUNCTIONS
# =============================================================================
def draw_glass_panel(ax, x, y, w, h, facecolor="#0c1425", edgecolor="#1e3a5a",
                     alpha=0.85, linewidth=0.8, radius=0.02, zorder=1):
    panel = mpatches.FancyBboxPatch(
        (x, y), w, h,
        boxstyle=f"round,pad=0.005,rounding_size={radius}",
        facecolor=facecolor, edgecolor=edgecolor,
        linewidth=linewidth, alpha=alpha,
        transform=ax.transAxes, zorder=zorder
    )
    ax.add_patch(panel)
    return panel


def draw_accent_line(ax, x, y, length, color="#00e5ff", linewidth=2, zorder=5):
    ax.plot([x, x + length], [y, y], color=color, linewidth=linewidth,
            solid_capstyle="round", transform=ax.transAxes, zorder=zorder)


def draw_mini_bar(ax, x, y, value, max_val, width, height, color, zorder=5):
    bg = mpatches.FancyBboxPatch(
        (x, y), width, height,
        boxstyle="round,pad=0.001,rounding_size=0.004",
        facecolor="#1e293b", edgecolor="none", alpha=0.6,
        transform=ax.transAxes, zorder=zorder
    )
    ax.add_patch(bg)
    fill_w = max(width * min(value / max_val, 1.0), 0.003)
    fill = mpatches.FancyBboxPatch(
        (x, y), fill_w, height,
        boxstyle="round,pad=0.001,rounding_size=0.004",
        facecolor=color, edgecolor="none", alpha=0.9,
        transform=ax.transAxes, zorder=zorder + 1
    )
    ax.add_patch(fill)


# =============================================================================
# RENDER REPORT
# =============================================================================
def generate_report_infographic(today_data, boundary_geojson, output_path="calauan_weather_report.png"):
    plt.rcParams["font.sans-serif"] = ["Segoe UI", "DejaVu Sans", "Arial", "Helvetica"]
    plt.rcParams["font.family"] = "sans-serif"

    fig = plt.figure(figsize=(18, 10), dpi=300, facecolor=C["bg_deep"])

    gs = GridSpec(
        3, 2,
        height_ratios=[0.10, 0.82, 0.08],
        width_ratios=[0.32, 0.68],
        wspace=0.02, hspace=0.025
    )

    ax_header   = fig.add_subplot(gs[0, :])
    ax_map      = fig.add_subplot(gs[1, 0])
    ax_forecast = fig.add_subplot(gs[1, 1])
    ax_footer   = fig.add_subplot(gs[2, :])

    for ax in [ax_header, ax_forecast, ax_footer]:
        ax.set_facecolor("none")
        ax.axis("off")

    # =========================================================================
    # 1. HEADER
    # =========================================================================
    draw_glass_panel(ax_header, 0.005, 0.02, 0.99, 0.94,
                     facecolor="#0a1228", edgecolor="#00b4d8",
                     linewidth=1.0, radius=0.06, zorder=1)
    draw_accent_line(ax_header, 0.005, 0.02, 0.99,
                     color="#00b4d8", linewidth=1.0, zorder=2)

    # Logo
    logo_path = os.path.join(os.getcwd(), "public", "logo.png")
    logo_added = False
    if os.path.exists(logo_path):
        try:
            img = Image.open(logo_path)
            img.thumbnail((80, 80))
            imagebox = OffsetImage(img, zoom=0.55)
            ab = AnnotationBbox(imagebox, (0.035, 0.52), frameon=False,
                                xycoords="axes fraction")
            ax_header.add_artist(ab)
            logo_added = True
        except Exception as e:
            print(f"Note: Could not render logo: {e}")

    title_x = 0.07 if logo_added else 0.02

    ax_header.text(
        title_x, 0.62, "CALAUAN WEATHER REPORT",
        color="#ffffff", fontsize=22, fontweight="bold",
        va="center", transform=ax_header.transAxes, zorder=5,
        path_effects=[pe.withStroke(linewidth=0.5, foreground="#00b4d8")]
    )

    ax_header.text(
        title_x, 0.25,
        "Municipality of Calauan, Laguna   \u2022   ",
        color="#94a3b8", fontsize=10, fontweight="normal",
        va="center", transform=ax_header.transAxes, zorder=5
    )
    # ECMWF badge
    badge_x = title_x + 0.255
    badge = mpatches.FancyBboxPatch(
        (badge_x, 0.14), 0.135, 0.28,
        boxstyle="round,pad=0.005,rounding_size=0.04",
        facecolor="#00b4d8", edgecolor="none", alpha=0.15,
        transform=ax_header.transAxes, zorder=4
    )
    ax_header.add_patch(badge)
    ax_header.text(
        badge_x + 0.0675, 0.27, "ECMWF IFS 0.25\u00b0",
        color="#00e5ff", fontsize=8.5, fontweight="bold",
        ha="center", va="center", transform=ax_header.transAxes, zorder=5
    )

    now_pht = datetime.now(timezone(timedelta(hours=8)))
    timestamp_str = now_pht.strftime("ISSUED:  %a, %b %d, %Y  \u2022  %I:%M %p PHT")
    ax_header.text(
        0.98, 0.52, timestamp_str,
        color="#64748b", fontsize=9.5, fontweight="bold",
        ha="right", va="center", transform=ax_header.transAxes, zorder=5
    )

    # =========================================================================
    # 2. MAP — Accurate Boundary
    # =========================================================================
    ax_map.set_facecolor(C["map_fill"])
    ax_map.tick_params(colors="#475569", labelsize=6, length=3, width=0.5, pad=2)
    for spine in ax_map.spines.values():
        spine.set_color("#1e3a5a")
        spine.set_linewidth(0.8)

    # Map title — positioned inside top-left of map panel
    ax_map.text(
        0.04, 0.96,
        "CALAUAN, LAGUNA  \u2022  BARANGAY MAP",
        color="#00e5ff", fontsize=8.5, fontweight="bold",
        ha="left", va="top", transform=ax_map.transAxes, zorder=10,
        path_effects=[pe.withStroke(linewidth=0.5, foreground="#040810")]
    )

    # Draw accurate municipal boundary
    if boundary_geojson:
        if boundary_geojson["type"] == "Polygon":
            rings = [boundary_geojson["coordinates"][0]]
        elif boundary_geojson["type"] == "MultiPolygon":
            rings = [poly[0] for poly in boundary_geojson["coordinates"]]
        else:
            rings = []

        for ring in rings:
            lons = [pt[0] for pt in ring]
            lats = [pt[1] for pt in ring]

            # Filled polygon (subtle fill)
            ax_map.fill(lons, lats, color="#0e2a4a", alpha=0.55, zorder=2)

            # Outer glow border
            ax_map.plot(lons, lats, color="#00e5ff", linewidth=3.0,
                        alpha=0.08, zorder=3)
            ax_map.plot(lons, lats, color="#00e5ff", linewidth=1.8,
                        alpha=0.15, zorder=3)
        # Draw internal barangay sector boundary lines
        try:
            from shapely.geometry import Polygon as ShpPoly, MultiPolygon as ShpMultiPoly, Point as ShpPt, MultiPoint as ShpMultiPt
            from shapely.ops import voronoi_diagram

            if boundary_geojson["type"] == "Polygon":
                outer_shp = ShpPoly(boundary_geojson["coordinates"][0])
            elif boundary_geojson["type"] == "MultiPolygon":
                outer_shp = ShpMultiPoly([ShpPoly(p[0]) for p in boundary_geojson["coordinates"]])
            else:
                outer_shp = None

            if outer_shp:
                pts = [ShpPt(lon, lat) for _, lat, lon in BARANGAY_LABELS]
                vor_cells = voronoi_diagram(ShpMultiPt(pts), envelope=outer_shp.envelope.buffer(0.05))
                for cell in vor_cells.geoms:
                    clipped = cell.intersection(outer_shp)
                    if not clipped.is_empty:
                        geoms_to_draw = [clipped] if clipped.geom_type == 'Polygon' else (clipped.geoms if clipped.geom_type == 'MultiPolygon' else [])
                        for g in geoms_to_draw:
                            c_lons, c_lats = g.exterior.xy
                            ax_map.plot(c_lons, c_lats, color="#00e5ff", linestyle="--", linewidth=0.5, alpha=0.35, zorder=3)
        except Exception as e:
            print(f"Note: Sub-barangay sector borders: {e}")

        # Main outer municipal border
        for ring in rings:
            lons = [pt[0] for pt in ring]
            lats = [pt[1] for pt in ring]
            ax_map.plot(lons, lats, color="#00e5ff", linewidth=1.2, alpha=0.9, zorder=5)

        # Set bounds from boundary data
        all_lons = [pt[0] for ring in rings for pt in ring]
        all_lats = [pt[1] for ring in rings for pt in ring]
        pad_lon = (max(all_lons) - min(all_lons)) * 0.08
        pad_lat = (max(all_lats) - min(all_lats)) * 0.08
        ax_map.set_xlim(min(all_lons) - pad_lon, max(all_lons) + pad_lon)
        ax_map.set_ylim(min(all_lats) - pad_lat, max(all_lats) + pad_lat)
    else:
        # Fallback bounds
        ax_map.set_xlim(121.21, 121.38)
        ax_map.set_ylim(14.07, 14.20)

    # Barangay pinpoint markers and labels
    for name, lat, lon in BARANGAY_LABELS:
        # Pinpoint dot marker
        ax_map.scatter([lon], [lat], color="#00e5ff", s=10, zorder=7, edgecolors="#ffffff", linewidths=0.3)
        ax_map.scatter([lon], [lat], color="#00e5ff", s=35, zorder=6, alpha=0.25)
        # Label text positioned slightly above pinpoint
        ax_map.text(
            lon, lat + 0.0025, name,
            color="#e2e8f0", fontsize=5.2, fontweight="bold",
            ha="center", va="bottom", zorder=8,
            path_effects=[pe.withStroke(linewidth=2.0, foreground="#040810")]
        )

    ax_map.set_xlabel("Longitude (\u00b0E)", color="#475569", fontsize=6, labelpad=3)
    ax_map.set_ylabel("Latitude (\u00b0N)", color="#475569", fontsize=6, labelpad=3)
    ax_map.grid(True, linestyle=":", color="#162240", alpha=0.7, linewidth=0.4)

    # =========================================================================
    # 3. FORECAST — TODAY ONLY (3 large period cards)
    # =========================================================================
    periods_data = today_data["periods"]
    day_label = today_data["date_label"]

    # Full card background
    draw_glass_panel(
        ax_forecast, 0.005, 0.005, 0.99, 0.99,
        facecolor=C["bg_card"], edgecolor="#00b4d8",
        linewidth=0.8, alpha=0.85, radius=0.015, zorder=1
    )

    # Day header
    header_h = 0.055
    header_bar = mpatches.FancyBboxPatch(
        (0.005, 1.0 - header_h), 0.99, header_h,
        boxstyle="round,pad=0.003,rounding_size=0.012",
        facecolor="#00e5ff", edgecolor="none", alpha=0.08,
        transform=ax_forecast.transAxes, zorder=2
    )
    ax_forecast.add_patch(header_bar)

    ax_forecast.text(
        0.025, 1.0 - header_h * 0.5, day_label,
        color="#00e5ff", fontsize=13, fontweight="bold",
        va="center", transform=ax_forecast.transAxes, zorder=4,
        path_effects=[pe.withStroke(linewidth=0.3, foreground="#00e5ff")]
    )

    draw_accent_line(ax_forecast, 0.01, 1.0 - header_h - 0.005,
                     0.98, color="#00b4d8", linewidth=0.6, zorder=3)

    # 3 Period columns
    periods_list = [
        ("MORNING",   "06:00 \u2013 12:00", "#fbbf24", periods_data.get("morning")),
        ("AFTERNOON", "12:00 \u2013 18:00", "#f97316", periods_data.get("afternoon")),
        ("EVENING",   "18:00 \u2013 00:00", "#8b5cf6", periods_data.get("evening")),
    ]

    content_top = 1.0 - header_h - 0.025
    content_bottom = 0.02
    available_height = content_top - content_bottom

    for p_i, (p_title, p_time, dot_color, p_data) in enumerate(periods_list):
        col_x = 0.01 + p_i * 0.33
        col_center = col_x + 0.145

        # Column divider
        if p_i > 0:
            div_x = col_x - 0.01
            ax_forecast.plot(
                [div_x, div_x],
                [content_top + 0.005, content_bottom],
                color="#1e3a5a", linewidth=0.6,
                transform=ax_forecast.transAxes, zorder=3
            )

        # Period title with colored dot
        y_cursor = content_top

        ax_forecast.text(
            col_x, y_cursor,
            "\u25CF",
            color=dot_color, fontsize=9,
            va="top", transform=ax_forecast.transAxes, zorder=4
        )
        ax_forecast.text(
            col_x + 0.018, y_cursor,
            p_title,
            color="#e2e8f0", fontsize=10, fontweight="bold",
            va="top", transform=ax_forecast.transAxes, zorder=4
        )
        # Time range subtitle
        ax_forecast.text(
            col_x + 0.018, y_cursor - 0.032, p_time,
            color="#475569", fontsize=7.5,
            va="top", transform=ax_forecast.transAxes, zorder=4
        )

        if p_data is None:
            ax_forecast.text(
                col_center, y_cursor - 0.20, "\u2014 No Data \u2014",
                color="#334155", fontsize=9, fontstyle="italic",
                ha="center", va="top", transform=ax_forecast.transAxes, zorder=4
            )
            continue

        # Weather icon (large, centered in column)
        icon_y = y_cursor - 0.15
        draw_weather_icon(ax_forecast, p_data["icon_type"],
                          col_x + 0.14, icon_y, size=0.065)

        # Weather condition text below icon
        y_cursor = icon_y - 0.10
        ax_forecast.text(
            col_center, y_cursor, p_data["condition"],
            color=p_data["color"], fontsize=10, fontweight="bold",
            ha="center", va="top", transform=ax_forecast.transAxes, zorder=4,
            path_effects=[pe.withStroke(linewidth=0.3, foreground=p_data["color"])]
        )

        # Large temperature
        y_cursor -= 0.055
        t_color = temp_color(p_data["temp_avg"])
        ax_forecast.text(
            col_center, y_cursor, f"{p_data['temp_avg']}\u00b0C",
            color=t_color, fontsize=22, fontweight="bold",
            ha="center", va="top", transform=ax_forecast.transAxes, zorder=4
        )
        # Temp range
        y_cursor -= 0.065
        ax_forecast.text(
            col_center, y_cursor,
            f"{p_data['temp_min']}\u00b0  \u2013  {p_data['temp_max']}\u00b0",
            color="#64748b", fontsize=8.5,
            ha="center", va="top", transform=ax_forecast.transAxes, zorder=4
        )

        # Data rows below — use fixed positions relative to content area
        data_top = y_cursor - 0.050
        col_width_usable = 0.275      # stay well within column boundary
        val_right = col_x + col_width_usable
        row_h = 0.038                 # consistent row spacing

        # --- Rain Chance (label + %, bar below with mm) ---
        y_row = data_top
        r_color = rain_severity_color(p_data["precip_prob"])
        ax_forecast.text(
            col_x + 0.01, y_row,
            "Rain Chance", color="#94a3b8", fontsize=7,
            va="top", transform=ax_forecast.transAxes, zorder=4
        )
        ax_forecast.text(
            val_right, y_row,
            f"{p_data['precip_prob']}%", color=r_color, fontsize=8, fontweight="bold",
            ha="right", va="top", transform=ax_forecast.transAxes, zorder=4
        )
        y_row -= 0.026
        bar_width = col_width_usable - 0.06  # leave room for mm label
        draw_mini_bar(ax_forecast, col_x + 0.01, y_row,
                      p_data["precip_prob"], 100, bar_width, 0.012,
                      r_color, zorder=4)
        # Precip mm label right of bar
        ax_forecast.text(
            val_right, y_row + 0.004,
            f"{p_data['precip_mm']} mm", color="#38bdf8", fontsize=6.5,
            ha="right", va="center", transform=ax_forecast.transAxes, zorder=5
        )

        # --- Wind ---
        y_row -= row_h
        ax_forecast.text(
            col_x + 0.01, y_row,
            "Wind", color="#94a3b8", fontsize=7,
            va="top", transform=ax_forecast.transAxes, zorder=4
        )
        ax_forecast.text(
            val_right, y_row,
            f"{p_data['wind_speed']} km/h {p_data['wind_dir_compass']}",
            color="#e2e8f0", fontsize=8, fontweight="bold",
            ha="right", va="top", transform=ax_forecast.transAxes, zorder=4
        )

        # --- Humidity ---
        y_row -= row_h
        ax_forecast.text(
            col_x + 0.01, y_row,
            "Humidity", color="#94a3b8", fontsize=7,
            va="top", transform=ax_forecast.transAxes, zorder=4
        )
        ax_forecast.text(
            val_right, y_row,
            f"{p_data['humidity']}%", color="#e2e8f0", fontsize=8, fontweight="bold",
            ha="right", va="top", transform=ax_forecast.transAxes, zorder=4
        )

    # =========================================================================
    # 4. FOOTER
    # =========================================================================
    draw_glass_panel(
        ax_footer, 0.005, 0.08, 0.99, 0.84,
        facecolor="#0f0a0a", edgecolor="#ef4444",
        linewidth=0.6, alpha=0.9, radius=0.08, zorder=1
    )
    stripe_warn = mpatches.Rectangle(
        (0.005, 0.08), 0.003, 0.84,
        facecolor="#ef4444", edgecolor="none", alpha=0.9,
        transform=ax_footer.transAxes, zorder=2
    )
    ax_footer.add_patch(stripe_warn)

    ax_footer.text(
        0.015, 0.50, "\u25B2",
        color="#ef4444", fontsize=9,
        va="center", transform=ax_footer.transAxes, zorder=3
    )

    disclaimer_text = (
        "DISCLAIMER:  This weather report is generated for local reference and visualization. "
        "Please note, we are not affiliated with the local government unit (LGU). "
        "For official typhoon warnings, heavy rainfall advisories, and disaster evacuation decisions, "
        "always consult DOST-PAGASA and the Calauan Municipal Disaster Risk Reduction & Management Office (MDRRMO)."
    )
    ax_footer.text(
        0.035, 0.50, disclaimer_text,
        color="#fca5a5", fontsize=6.5, fontweight="normal",
        va="center", ha="left", wrap=True,
        transform=ax_footer.transAxes, zorder=3
    )

    # =========================================================================
    # SAVE
    # =========================================================================
    plt.subplots_adjust(top=0.97, bottom=0.03, left=0.025, right=0.975)
    plt.savefig(output_path, dpi=300, facecolor=fig.get_facecolor(), bbox_inches="tight")
    plt.close()
    print(f"Successfully generated: {output_path}")


def generate_facebook_caption(today_data, output_path="facebook_caption.txt"):
    """Generate a clean, engaging Facebook post description with emojis and tags."""
    day_label = today_data.get("date_label", "TODAY'S FORECAST").replace("TODAY  •  ", "").strip()
    periods = today_data.get("periods", {})

    emoji_map = {
        "sun": "☀️",
        "partly_cloudy": "⛅",
        "cloudy": "☁️",
        "fog": "🌫️",
        "drizzle": "🌦️",
        "rain": "🌧️",
        "heavy_rain": "⛈️",
        "thunderstorm": "⚡⛈️"
    }

    lines = [
        "🌤️ OFFICIAL CALAUAN WEATHER FORECAST 🌤️",
        f"📅 {day_label}",
        "📍 Municipality of Calauan, Laguna Province",
        "",
        "Here is your daily meteorological summary generated from ECMWF High-Resolution Spatial Models:",
        ""
    ]

    period_titles = [
        ("morning", "🌅 MORNING (06:00 – 12:00)"),
        ("afternoon", "☀️ AFTERNOON (12:00 – 18:00)"),
        ("evening", "🌙 EVENING (18:00 – 00:00)")
    ]

    for p_key, p_title in period_titles:
        p_data = periods.get(p_key)
        lines.append(p_title)
        if not p_data:
            lines.append("• No forecast data available.")
        else:
            cond = p_data['condition']
            icon_type = p_data.get('icon_type', 'sun')
            em = emoji_map.get(icon_type, "🌤️")
            lines.append(f"• Condition: {cond} {em}")
            lines.append(f"• Temperature: {p_data['temp_avg']}°C (Min {p_data['temp_min']}° – Max {p_data['temp_max']}°)")
            lines.append(f"• Rain Chance: {p_data['precip_prob']}% 💧 ({p_data['precip_mm']} mm)")
            lines.append(f"• Wind: {p_data['wind_speed']} km/h {p_data['wind_dir_compass']} 💨")
        lines.append("")

    lines.extend([
        "⚠️ REMINDER & DISCLAIMER:",
        "Please note, we are not affiliated with the local government unit (LGU). This weather infographic and forecast are generated for community reference and awareness. For official typhoon warnings, flood advisories, and disaster evacuation decisions, please always coordinate with DOST-PAGASA and the Calauan Municipal Disaster Risk Reduction & Management Office (MDRRMO).",
        "",
        "#CalauanLaguna #CalauanWeather #WeatherForecast #LagunaProvince #MDRRMOCalauan #PAGASA #WeatherUpdate #DailyForecast"
    ])

    caption_text = "\n".join(lines)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(caption_text)
    print(f"Successfully generated Facebook caption: {output_path}")
    return caption_text


# =============================================================================
# MAIN
# =============================================================================
if __name__ == "__main__":
    try:
        boundary = fetch_calauan_boundary()
        forecast = fetch_weather_forecast()
        output_file = "calauan_weather_report.png"
        generate_report_infographic(forecast, boundary, output_file)
        generate_facebook_caption(forecast, "facebook_caption.txt")

        public_assets_dir = os.path.join(os.getcwd(), "public", "assets")
        if os.path.exists(public_assets_dir):
            import shutil
            dest = os.path.join(public_assets_dir, "calauan_weather_report.png")
            shutil.copy(output_file, dest)
            print(f"Copied to public assets: {dest}")

    except Exception as err:
        print(f"Error generating report: {err}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
