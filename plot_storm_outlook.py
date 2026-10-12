"""
Plot Storm Track Scenarios & Unified Cone of Uncertainty Outlook
Calauan Weather - Broadcast Grade Ensemble Guidance
"""

import os
import sys
import io
import math
import re
import json
import base64
import argparse
from datetime import datetime, timezone, timedelta
from collections import Counter

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patheffects as path_effects
import matplotlib.patches as mpatches
from matplotlib.collections import LineCollection
import matplotlib.colors as mcolors
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from shapely.geometry import Point, Polygon, shape
from shapely.ops import unary_union
from sklearn.cluster import KMeans
import urllib.request


def load_track_file(file_path):
    """Loads storm tracks from CSV, XOR-encrypted ENC/DAT, or raw ATCF."""
    if not os.path.exists(file_path):
        print(f"Error: File not found {file_path}")
        return pd.DataFrame()

    if file_path.endswith('.enc') or file_path.endswith('.dat'):
        try:
            with open(file_path, 'rb') as f:
                b64_content = f.read().strip()
            encrypted_bytes = base64.b64decode(b64_content)
            key_bytes = "CalauanWeather2026".encode('utf-8')
            enc_arr = np.frombuffer(encrypted_bytes, dtype=np.uint8)
            key_arr = np.frombuffer(key_bytes, dtype=np.uint8)
            dec_arr = enc_arr ^ np.resize(key_arr, len(enc_arr))
            csv_text = dec_arr.tobytes().decode('utf-8')
            df = pd.read_csv(io.StringIO(csv_text), comment='#')
            return df
        except Exception as e:
            try:
                decrypted_bytes = bytearray([b ^ 0xAA for b in encrypted_bytes])
                csv_text = decrypted_bytes.decode('utf-8')
                df = pd.read_csv(io.StringIO(csv_text), comment='#')
                return df
            except Exception as e2:
                print(f"Failed to decrypt {file_path}: {e2}")
                return pd.DataFrame()

    try:
        return pd.read_csv(file_path, comment='#')
    except Exception as e:
        print(f"Error reading CSV {file_path}: {e}")
        return pd.DataFrame()


def fetch_knack_active_storms():
    """Fetches active tropical cyclones from the Knack API."""
    url = "https://api.knackwx.com/atcf/v2"
    try:
        req = urllib.request.Request(
            url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Knack API fetch error: {e}")
        return []


def isolate_storm_tracks(df, target_storm_id="96W", knack_storms=None):
    """
    Isolates member tracks strictly for the target storm ID.
    Prevents cross-contamination from adjacent active storms (e.g. 95W, 27W).
    """
    if df.empty:
        return df

    target_clean = str(target_storm_id).upper().replace('WP', '').replace('W', '').strip()
    target_num = int(target_clean) if target_clean.isdigit() else None

    # 1. Primary: Use canonical multi-storm partitioner if Knack storms are present
    try:
        from plot_ensemble_spaghetti import assign_tracks_to_knack_storms
        df_assigned, ok = assign_tracks_to_knack_storms(df, knack_storms)
        if ok:
            matched = df_assigned[df_assigned['storm_group'] == f"knack_{target_clean}W"]
            if not matched.empty:
                n_tracks = len(matched.groupby(['track_id', 'sample']))
                print(f"Cleanly partitioned {n_tracks} member tracks for knack_{target_clean}W")
                return matched.copy()
    except Exception as e:
        print(f"Knack partition notice: {e}")

    # 2. Secondary fallback: Strict ATCF ID and geographic boundaries
    matched_groups = []
    for (tid, sid), t_df in df.groupby(['track_id', 'sample']):
        t_df_sorted = t_df.sort_values('lead_time_hours')
        early = t_df_sorted[t_df_sorted['lead_time_hours'] <= 48.0].dropna(subset=['lat', 'lon'])
        if early.empty:
            continue

        tid_str = str(tid).upper()
        # Direct track_id match
        if target_num is not None and (f"WP{target_num:02d}" in tid_str or f"{target_num:02d}W" in tid_str):
            matched_groups.append((tid, sid))
            continue

        f_lat = early.iloc[0]['lat']
        f_lon = early.iloc[0]['lon']

        # Strict non-overlapping geographic genesis nursery bounds
        if target_num == 96:
            # 96W originates far east in Micronesia (lon >= 158E, lat <= 14N)
            # 95W was around 148-154E, so lon >= 158E completely excludes 95W
            if f_lon >= 158.0 and 4.0 <= f_lat <= 14.0:
                matched_groups.append((tid, sid))
        elif target_num == 95:
            # 95W originates in central/eastern Philippine Sea (lon 144-155E, lat 12-20N)
            if 144.0 <= f_lon < 156.0 and 10.0 <= f_lat <= 22.0:
                matched_groups.append((tid, sid))
        elif target_num == 27:
            # 27W (Koguma) originates further north (lat >= 22N)
            if f_lat >= 22.0:
                matched_groups.append((tid, sid))

    if not matched_groups:
        print(f"Warning: No member tracks isolated for {target_storm_id}")
        return pd.DataFrame()

    matched_set = set(matched_groups)
    idx_filter = [key in matched_set for key in zip(df['track_id'], df['sample'])]
    df_isolated = df[idx_filter].copy()
    print(f"Isolated {len(matched_groups)} member tracks strictly for storm {target_storm_id}")
    return df_isolated


def build_unified_cone(df_storm, max_lead_hours=318, confidence_percentile=67):
    """
    Builds a single unified Cone of Uncertainty (67% percentile ensemble envelope)
    along the overall ensemble consensus track up to Day 13 (+318h full run).
    """
    total_mems = df_storm['sample'].nunique()
    min_mems = max(5, int(round(total_mems * 0.15)))

    leads = sorted([h for h in df_storm['lead_time_hours'].dropna().unique() if h <= max_lead_hours])
    pts_by_lead = []

    last_r = 18.0
    for lead in leads:
        sub = df_storm[df_storm['lead_time_hours'] == lead].dropna(subset=['lat', 'lon'])
        if len(sub) < min_mems:
            continue
        c_lat = float(sub['lat'].mean())
        c_lon = float(sub['lon'].mean())

        dists = []
        for _, row in sub.iterrows():
            d_lat = (row['lat'] - c_lat) * 111.0
            d_lon = (row['lon'] - c_lon) * 111.0 * math.cos(math.radians(c_lat))
            dists.append(math.sqrt(d_lat**2 + d_lon**2))

        raw_r = float(np.percentile(dists, confidence_percentile))
        if lead == 0:
            r_km = 18.0
        else:
            # Smooth expansion: ~35 km per 12h
            max_growth = 35.0 * (12.0 / 12.0)
            r_km = max(last_r + 5.0, min(raw_r, last_r + max_growth))
        last_r = r_km
        pts_by_lead.append({'lead': lead, 'lat': c_lat, 'lon': c_lon, 'r_km': r_km, 'n': len(sub)})

    if len(pts_by_lead) < 2:
        return None, []

    circles = []
    for p in pts_by_lead:
        r_deg_lat = p['r_km'] / 111.0
        r_deg_lon = p['r_km'] / (111.0 * max(0.2, math.cos(math.radians(p['lat']))))
        circ_pts = []
        for ang in np.linspace(0, 2 * np.pi, 36):
            x = p['lon'] + r_deg_lon * math.cos(ang)
            y = p['lat'] + r_deg_lat * math.sin(ang)
            circ_pts.append((x, y))
        circles.append(Polygon(circ_pts))

    capsules = []
    for i in range(len(circles) - 1):
        c1, c2 = circles[i], circles[i+1]
        capsule = unary_union([c1, c2]).convex_hull
        capsules.append(capsule)

    try:
        cone_geom = unary_union(capsules)
        return cone_geom, pts_by_lead
    except Exception as e:
        print(f"Cone geometry union failed: {e}")
        return None, pts_by_lead


def cluster_track_scenarios(df_storm, n_clusters=3, max_lead_hours=318):
    """
    Clusters ensemble member tracks into distinct physical scenarios:
    1. Westward · Luzon Strait / Babuyan Islands (northern sea passage)
    2. Westward · Mainland Luzon Landfall (dense direct landfall over N./Central Luzon)
    3. Recurve · S. Japan / Open Pacific (recurving northward into open ocean)
    """
    track_list = []
    for (tid, sid), t_df in df_storm.groupby(['track_id', 'sample']):
        t_df = t_df[t_df['lead_time_hours'] <= max_lead_hours].sort_values('lead_time_hours')
        if len(t_df) < 2:
            continue

        # Check recurve vs westward
        is_recurve = (t_df['lat'].max() >= 26.0 and t_df.loc[t_df['lat'] >= 26.0, 'lon'].min() >= 135.0) or \
                     (t_df.iloc[-1]['lat'] >= 26.0 and t_df.iloc[-1]['lon'] >= 133.0)

        near_ph = t_df[(t_df['lon'] >= 118.0) & (t_df['lon'] <= 126.0)]
        if not near_ph.empty:
            ph_lat = float(near_ph['lat'].mean())
        else:
            ph_lat = float(t_df.iloc[-1]['lat'])

        track_list.append({
            'tid': tid, 'sid': sid, 'df': t_df,
            'is_recurve': is_recurve,
            'ph_lat': ph_lat
        })

    if not track_list:
        return []

    total_tracked = len(track_list)
    raw_groups = [
        {
            'name': 'WESTWARD · LUZON STRAIT / BABUYAN',
            'tracks': [t for t in track_list if not t['is_recurve'] and t['ph_lat'] >= 18.5]
        },
        {
            'name': 'WESTWARD · MAINLAND LUZON LANDFALL',
            'tracks': [t for t in track_list if not t['is_recurve'] and t['ph_lat'] < 18.5]
        },
        {
            'name': 'RECURVE · S. JAPAN',
            'tracks': [t for t in track_list if t['is_recurve']]
        }
    ]

    clusters = []
    for g in raw_groups:
        c_tracks = g['tracks']
        if not c_tracks:
            continue
        count = len(c_tracks)
        pct = (count / total_tracked) * 100.0

        # Mean track computation up to max_lead_hours (+318h full run)
        # End track when surviving members fall below 30% of the scenario
        all_leads = sorted([h for h in set(h for t in c_tracks for h in t['df']['lead_time_hours']) if h <= max_lead_hours])
        min_surviving = max(4, int(round(count * 0.30)))
        mean_pts = []
        for lead in all_leads:
            active_mems = [t for t in c_tracks if lead <= t['df']['lead_time_hours'].max()]
            if len(active_mems) < min_surviving:
                break
            l_lats = [float(np.interp(lead, t['df']['lead_time_hours'], t['df']['lat'])) for t in active_mems]
            l_lons = [float(np.interp(lead, t['df']['lead_time_hours'], t['df']['lon'])) for t in active_mems]
            l_winds = [float(np.interp(lead, t['df']['lead_time_hours'], t['df']['maximum_sustained_wind_speed_knots']))
                       for t in active_mems if 'maximum_sustained_wind_speed_knots' in t['df']]
            if l_lats and l_lons:
                mean_pts.append({
                    'lead': lead,
                    'lat': float(np.mean(l_lats)),
                    'lon': float(np.mean(l_lons)),
                    'wind': float(np.median(l_winds)) if l_winds else np.nan
                })

        mean_df = pd.DataFrame(mean_pts)

        all_peak_w = [t['df']['maximum_sustained_wind_speed_knots'].max()
                      for t in c_tracks if 'maximum_sustained_wind_speed_knots' in t['df']]
        peak_median_kt = int(round(np.nanmedian(all_peak_w))) if all_peak_w else 95

        # Landfall count in Philippines (lon 118-127, lat 5-21)
        ph_landfall_count = 0
        for t in c_tracks:
            in_ph = ((t['df']['lat'] >= 5.0) & (t['df']['lat'] <= 21.0) &
                     (t['df']['lon'] >= 118.0) & (t['df']['lon'] <= 126.5)).any()
            if in_ph:
                ph_landfall_count += 1
        ph_landfall_pct = int(round((ph_landfall_count / count) * 100))

        clusters.append({
            'count': count,
            'pct': pct,
            'name': g['name'],
            'tracks': c_tracks,
            'mean_df': mean_df,
            'peak_median_kt': peak_median_kt,
            'ph_landfall_pct': ph_landfall_pct
        })

    # Filter out negligible noise clusters (< 3% share)
    clusters = [c for c in clusters if c['pct'] >= 3.0]
    if not clusters:
        clusters = [track_list]

    # Sort descending by member percentage
    clusters.sort(key=lambda c: c['count'], reverse=True)

    # Re-normalize percentages to 100% of tracked scenarios
    total_valid = sum(c['count'] for c in clusters)
    for c in clusters:
        c['pct'] = (c['count'] / total_valid) * 100.0

    # Assign letters A, B, C and distinctive color theme
    palette = [
        {'color': '#38bdf8', 'halo': '#0369a1'},  # Cyan (A - Luzon Strait / Babuyan)
        {'color': '#4ade80', 'halo': '#166534'},  # Emerald / Lime (B - Direct Mainland Luzon Landfall)
        {'color': '#f97316', 'halo': '#c2410c'},  # Vibrant Orange (C - Recurve S. Japan / Pacific)
        {'color': '#e879f9', 'halo': '#86198f'},  # Fuchsia
    ]

    for idx, c in enumerate(clusters):
        c['letter'] = chr(65 + idx)
        c['style'] = palette[idx % len(palette)]

    return clusters


def render_storm_outlook(
    df_storm,
    model_name="GDM WNC Large",
    storm_title="INVEST 96W",
    init_dt=None,
    total_ensemble_members=1000,
    max_lead_hours=318,
    headline_title="TROPICAL CYCLONE OUTLOOK FORECAST",
    out_file="public/assets/WP96_outlook.png"
):
    """
    Renders the broadcast-grade Tropical Cyclone Outlook graphic with:
    - Headline: TROPICAL CYCLONE OUTLOOK FORECAST with dynamic date
    - Track Scenarios (A, B, C) with individual faint members and highlighted mean tracks
    - Sleek POSSIBLE SCENARIOS HUD Card floating inside the map canvas
    """
    if df_storm.empty:
        print("Error: Empty storm dataframe. Cannot render outlook.")
        return

    # Parse initialization date
    if init_dt is None:
        try:
            init_dt = pd.to_datetime(df_storm['init_time'].iloc[0])
        except Exception:
            init_dt = datetime.now(timezone.utc)

    init_pht = init_dt + timedelta(hours=8)
    init_ymd = init_dt.strftime('%d %b %Y').upper()
    init_cycle = f"{init_dt.hour:02d}Z"
    init_pht_str = init_pht.strftime('%I:%M %p PHT').lstrip('0')
    headline_date_str = f"{init_pht.strftime('%B %d, %Y').upper()} · {init_cycle} RUN ({init_pht_str})"

    # Cluster scenarios up to full run (max_lead_hours)
    scenarios = cluster_track_scenarios(df_storm, n_clusters=3, max_lead_hours=max_lead_hours)
    tracked_members = len(df_storm.groupby(['track_id', 'sample']))

    # Setup 16:9 widescreen canvas
    fig = plt.figure(figsize=(16, 9.5), dpi=150, facecolor='#090d16')

    # ─────────────────────────────────────────────────────────────
    # Top Header Banner
    # ─────────────────────────────────────────────────────────────
    ax_head = fig.add_axes([0.025, 0.905, 0.95, 0.082])
    ax_head.set_facecolor('none')
    ax_head.axis('off')

    # Left: Main Headline (Do not display "INVEST", display clean headline)
    if not storm_title or "INVEST" in storm_title.upper():
        title_display = headline_title.upper()
    else:
        title_display = f"{headline_title.upper()} · {storm_title.upper()}"

    ax_head.text(
        0.0, 0.55, title_display,
        fontsize=21.0, weight='black', color='#f8fafc', va='center'
    )

    # Right: Branding & Date Tag
    ax_head.text(
        1.0, 0.72, "PHILIPPINE TYPHOON/WEATHER",
        fontsize=15.0, weight='black', color='#f8fafc', ha='right', va='center'
    )
    ax_head.text(
        1.0, 0.25, f"INIT: {init_ymd} {init_cycle} ({init_pht_str})  ·  OUTLOOK DATE: {init_pht.strftime('%B %d, %Y').upper()}",
        fontsize=9.2, weight='bold', color='#38bdf8', ha='right', va='center'
    )

    # ─────────────────────────────────────────────────────────────
    # Main Map Canvas (Takes up full graphic body)
    # ─────────────────────────────────────────────────────────────
    ax_map = fig.add_axes([0.025, 0.035, 0.95, 0.855], projection=ccrs.PlateCarree())
    ax_map.set_facecolor('#090d16')

    # Geography Features
    try:
        land_feature = cfeature.NaturalEarthFeature('physical', 'land', '50m', facecolor='#161f30', edgecolor='none')
        coast_feature = cfeature.NaturalEarthFeature('physical', 'coastline', '50m', edgecolor='#334155', linewidth=0.6, facecolor='none')
        borders_feature = cfeature.NaturalEarthFeature('cultural', 'admin_0_boundary_lines_land', '50m', edgecolor='#1e293b', linewidth=0.5, linestyle='-', alpha=0.7, facecolor='none')
        ax_map.add_feature(land_feature, zorder=1)
        ax_map.add_feature(coast_feature, zorder=2)
        ax_map.add_feature(borders_feature, zorder=2)
    except Exception:
        ax_map.add_feature(cfeature.LAND, facecolor='#161f30', zorder=1)
        ax_map.add_feature(cfeature.COASTLINE, edgecolor='#334155', linewidth=0.6, zorder=2)
        ax_map.add_feature(cfeature.BORDERS, edgecolor='#1e293b', linewidth=0.5, zorder=2)

    # Philippine Province Overlay
    prov_geoms = []
    try:
        geojson_paths = [
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "data", "ph_provinces.json"),
            "public/data/ph_provinces.json"
        ]
        found_geojson = next((p for p in geojson_paths if os.path.exists(p)), None)
        if found_geojson:
            with open(found_geojson, 'r', encoding='utf-8') as gf:
                geojson_data = json.load(gf)
            prov_geoms = [shape(feature['geometry']) for feature in geojson_data['features']]
            ax_map.add_geometries(prov_geoms, crs=ccrs.PlateCarree(), facecolor='none', edgecolor='#1e293b', linewidth=0.45, alpha=0.6, zorder=3)
    except Exception as e:
        print(f"Warning: Province boundary overlay skipped: {e}")

    # PAR Boundary Overlay
    par_vertices = [
        (115.0, 5.0), (115.0, 15.0), (120.0, 21.0), (120.0, 25.0),
        (135.0, 25.0), (135.0, 5.0), (115.0, 5.0)
    ]
    ax_map.add_patch(mpatches.Polygon(
        par_vertices, facecolor='none', edgecolor='#f97316', linestyle='-', linewidth=1.8,
        alpha=0.75, transform=ccrs.PlateCarree(), zorder=4, label='PAR'
    ))
    ax_map.text(
        115.6, 5.8, "PAR", color='#f97316', fontsize=8.5, weight='bold',
        transform=ccrs.PlateCarree(), zorder=4.1
    )

    # Sea Text Labels
    ax_map.text(
        117.5, 13.5, "West Philippine\nSea", fontsize=7.5, color='#64748b', weight='bold',
        transform=ccrs.PlateCarree(), ha='center', va='center', style='italic', alpha=0.65, zorder=3
    )
    ax_map.text(
        131.0, 19.5, "Philippine\nSea", fontsize=9.0, color='#64748b', weight='bold',
        transform=ccrs.PlateCarree(), ha='center', va='center', style='italic', alpha=0.65, zorder=3
    )

    # Gridlines
    gl = ax_map.gridlines(draw_labels=True, linewidth=0.4, color='#1e293b', alpha=0.45, linestyle=':')
    gl.top_labels = False
    gl.right_labels = False
    gl.xlabel_style = {'size': 8.5, 'color': '#64748b', 'weight': 'bold'}
    gl.ylabel_style = {'size': 8.5, 'color': '#64748b', 'weight': 'bold'}

    # Cone of uncertainty removed as requested

    # ─────────────────────────────────────────────────────────────
    # Plot Scenarios: Faint Members + Highlighted Mean Tracks
    # ─────────────────────────────────────────────────────────────
    current_pos = None

    for sc in reversed(scenarios):
        sc_col = sc['style']['color']
        sc_halo = sc['style']['halo']
        letter = sc['letter']

        # 1. Faint individual member tracks
        for t in sc['tracks']:
            t_df = t['df'][t['df']['lead_time_hours'] <= max_lead_hours].sort_values('lead_time_hours')
            lons = t_df['lon'].values
            lats = t_df['lat'].values
            if len(lons) < 2:
                continue

            segments = []
            for i in range(len(lons) - 1):
                if np.isnan(lons[i]) or np.isnan(lons[i+1]) or np.isnan(lats[i]) or np.isnan(lats[i+1]):
                    continue
                if abs(lons[i+1] - lons[i]) > 180:
                    continue
                segments.append([[lons[i], lats[i]], [lons[i+1], lats[i+1]]])

            if segments:
                lc = LineCollection(
                    segments, colors=sc_col, linewidth=0.85, alpha=0.20,
                    transform=ccrs.PlateCarree(), zorder=5
                )
                ax_map.add_collection(lc)

        # 2. Scenario Mean Track
        m_df = sc['mean_df']
        if len(m_df) >= 2:
            m_lons = list(m_df['lon'].dropna().values)
            m_lats = list(m_df['lat'].dropna().values)

            if current_pos is None and len(m_lons) > 0:
                current_pos = (m_lons[0], m_lats[0])

            # Multi-layer stroke for standout visibility
            ax_map.plot(m_lons, m_lats, color='#090d14', linewidth=4.8, zorder=6.0, transform=ccrs.PlateCarree())
            ax_map.plot(m_lons, m_lats, color=sc_col, linewidth=3.0, zorder=6.1, transform=ccrs.PlateCarree())

            # 24-hour and 48-hour milestone nodes
            for idx, row in m_df.iterrows():
                h = int(row['lead'])
                if h > 0 and h % 48 == 0:
                    nx, ny = row['lon'], row['lat']
                    node_dt = init_dt + timedelta(hours=h)
                    dt_label = node_dt.strftime('%b %d').upper()

                    # Node marker
                    ax_map.plot(
                        nx, ny, marker='o', markerfacecolor='#ffffff',
                        markeredgecolor=sc_col, markersize=4.8, markeredgewidth=1.6,
                        zorder=7.0, transform=ccrs.PlateCarree()
                    )

                    # Text callout: alternate above/below based on scenario letter to avoid collisions
                    y_off = 0.42 if letter in ['A', 'C'] else -0.55
                    t_txt = ax_map.text(
                        nx + 0.35, ny + y_off, dt_label, color='#f8fafc',
                        fontsize=7.2, weight='bold', zorder=8.0, transform=ccrs.PlateCarree(),
                        va='center'
                    )
                    t_txt.set_path_effects([path_effects.withStroke(linewidth=2.5, foreground='#090d14')])

            # Terminus Badge with Letter, Percentage, and Lead Hour
            last_pt = m_df.iloc[-1]
            end_x, end_y = last_pt['lon'], last_pt['lat']
            end_h = int(last_pt['lead'])
            end_dt = init_dt + timedelta(hours=end_h)
            end_label = f"({letter}) {sc['pct']:.0f}% · +{end_h}h ({end_dt.strftime('%b %d').upper()})"

            # Final Node Marker
            ax_map.plot(
                end_x, end_y, marker='o', markerfacecolor=sc_col,
                markeredgecolor='#ffffff', markersize=6.0, markeredgewidth=1.8,
                zorder=8.5, transform=ccrs.PlateCarree()
            )

            # Smart placement of badge: if recurving northeast (end_x > 135), place to top-left of terminus
            if end_x > 135.0:
                t_end = ax_map.text(
                    end_x - 0.7, end_y + 0.4, end_label, color='#ffffff',
                    fontsize=8.5, weight='black', zorder=9.0, transform=ccrs.PlateCarree(),
                    ha='right', va='center',
                    bbox=dict(boxstyle='round,pad=0.28', facecolor=sc_halo, edgecolor='#f8fafc', linewidth=1.0, alpha=0.95)
                )
            else:
                t_end = ax_map.text(
                    end_x + 0.6, end_y, end_label, color='#ffffff',
                    fontsize=8.5, weight='black', zorder=9.0, transform=ccrs.PlateCarree(),
                    ha='left', va='center',
                    bbox=dict(boxstyle='round,pad=0.28', facecolor=sc_halo, edgecolor='#f8fafc', linewidth=1.0, alpha=0.95)
                )
            t_end.set_path_effects([path_effects.withStroke(linewidth=2.0, foreground='#090d14')])

    # ─────────────────────────────────────────────────────────────
    # High-Visibility Philippine Province Overlay (on top of tracks)
    # ─────────────────────────────────────────────────────────────
    if prov_geoms:
        # Subtle dark halo
        ax_map.add_geometries(
            prov_geoms, crs=ccrs.PlateCarree(), facecolor='none',
            edgecolor='#090d14', linewidth=1.3, alpha=0.75, zorder=6.4
        )
        # Muted Slate & Silver province lines (#94a3b8)
        ax_map.add_geometries(
            prov_geoms, crs=ccrs.PlateCarree(), facecolor='none',
            edgecolor='#94a3b8', linewidth=0.55, alpha=0.85, zorder=6.5
        )

    # Current storm center marker removed as requested

    # Synthetic / Advisory Disclaimer Badge at Top Left of Map
    ax_map.text(
        0.02, 0.955, "WEATHER MODELS OUTLOOK · NOT AN OFFICIAL FORECAST",
        transform=ax_map.transAxes, fontsize=8.2, weight='bold', color='#fbbf24',
        zorder=12,
        bbox=dict(boxstyle='square,pad=0.35', facecolor='#090d16', edgecolor='#f59e0b', linewidth=1.2, alpha=0.92)
    )

    # ─────────────────────────────────────────────────────────────
    # FLOATING "POSSIBLE SCENARIOS" HUD CARD (INSIDE THE MAP)
    # ─────────────────────────────────────────────────────────────
    hud_left = 0.625
    hud_bottom = 0.600
    hud_w = 0.355
    hud_h = 0.350

    ax_hud = ax_map.inset_axes([hud_left, hud_bottom, hud_w, hud_h])
    ax_hud.set_facecolor('#070b14')
    ax_hud.set_xlim(0.0, 1.0)
    ax_hud.set_ylim(0.0, 1.0)
    ax_hud.set_xticks([])
    ax_hud.set_yticks([])
    for spine in ax_hud.spines.values():
        spine.set_edgecolor('#334155')
        spine.set_linewidth(1.3)

    # Semi-transparent dark background
    ax_hud.patch.set_alpha(0.92)

    # Card Title - Placed strictly inside with generous top margin
    ax_hud.text(
        0.06, 0.86, "POSSIBLE SCENARIOS",
        fontsize=11.5, weight='black', color='#f8fafc', va='center'
    )

    # Top Divider
    ax_hud.plot([0.06, 0.94], [0.74, 0.74], color='#1e293b', linewidth=1.2)

    # List Scenarios A, B, C (Clean, streamlined display)
    y_start = 0.58
    y_gap = 0.21

    for idx, sc in enumerate(scenarios[:3]):
        y_pos = y_start - idx * y_gap
        sc_col = sc['style']['color']
        letter = sc['letter']

        # Circular Letter Badge
        ax_hud.text(
            0.08, y_pos, f" {letter} ",
            fontsize=8.5, weight='black', color='#090d14', ha='center', va='center',
            bbox=dict(boxstyle='circle,pad=0.25', facecolor=sc_col, edgecolor='#ffffff', linewidth=1.0)
        )

        # Scenario Name
        ax_hud.text(
            0.17, y_pos + 0.035, sc['name'],
            fontsize=8.0, weight='heavy', color='#f1f5f9', va='center'
        )

        # Percentage
        ax_hud.text(
            0.94, y_pos + 0.035, f"{sc['pct']:.0f}%",
            fontsize=12.5, weight='black', color=sc_col, ha='right', va='center'
        )

        # Horizontal Probability Bar
        bar_bg_y = y_pos - 0.040
        bar_h = 0.024
        # Background bar
        ax_hud.barh(bar_bg_y, 0.77, height=bar_h, left=0.17, color='#1e293b', align='center')
        # Fill bar
        bar_fill_len = 0.77 * (sc['pct'] / 100.0)
        ax_hud.barh(bar_bg_y, bar_fill_len, height=bar_h, left=0.17, color=sc_col, align='center')

    # Set Map Extents & Border Spines
    ax_map.set_extent([110.0, 170.0, 4.0, 42.0], crs=ccrs.PlateCarree())
    for spine in ax_map.spines.values():
        spine.set_edgecolor('#334155')
        spine.set_linewidth(1.3)

    # Save output graphic
    os.makedirs(os.path.dirname(os.path.abspath(out_file)), exist_ok=True)
    plt.savefig(out_file, dpi=150, facecolor='#090d16', edgecolor='none')
    plt.close()
    print(f"Broadcast-grade outlook saved to: {out_file}")


def main():
    parser = argparse.ArgumentParser(description="Generate Tropical Cyclone Track Scenarios & Unified Cone Outlook")
    parser.add_argument('--input', type=str, default='public/data/fnv3_large_latest.enc', help="Path to input tracks file")
    parser.add_argument('--storm', type=str, default='96W', help="Storm ID (e.g. 96W, WP96, 27W)")
    parser.add_argument('--model', type=str, default='GDM WNC Large', help="Model display name")
    parser.add_argument('--members', type=int, default=1000, help="Total ensemble member count")
    parser.add_argument('--max-lead', type=int, default=318, help="Maximum forecast lead time in hours (default 318)")
    parser.add_argument('--headline', type=str, default='TROPICAL CYCLONE OUTLOOK FORECAST', help="Headline title text")
    parser.add_argument('--output', type=str, default=None, help="Output image file path")
    args = parser.parse_args()

    print(f"Loading data from {args.input} ...")
    df = load_track_file(args.input)
    if df.empty:
        print(f"Failed to load tracks from {args.input}")
        sys.exit(1)

    knack_storms = fetch_knack_active_storms()
    df_storm = isolate_storm_tracks(df, target_storm_id=args.storm, knack_storms=knack_storms)

    if df_storm.empty:
        print(f"No tracks found for storm {args.storm}")
        sys.exit(1)

    storm_name = f"INVEST {args.storm.upper()}" if '9' in args.storm else f"TC {args.storm.upper()}"
    if knack_storms:
        for s in knack_storms:
            if args.storm.upper() in str(s.get('atcf_id', '')).upper():
                k_name = s.get('name')
                if k_name and k_name != 'None' and not k_name.upper().startswith('INVEST'):
                    storm_name = f"{k_name.upper()} ({args.storm.upper()})"
                break

    out_file = args.output
    if not out_file:
        try:
            init_dt = pd.to_datetime(df_storm['init_time'].iloc[0])
            ymd = init_dt.strftime('%Y%m%d')
            cy = f"{init_dt.hour:02d}Z"
        except Exception:
            ymd = datetime.now(timezone.utc).strftime('%Y%m%d')
            cy = "18Z"
        model_slug = args.model.lower().replace(' ', '_')
        out_file = os.path.join('public', 'assets', f"WP{args.storm.replace('W','').replace('WP','')}_{ymd}_{cy}_{model_slug}_outlook.png")

    render_storm_outlook(
        df_storm,
        model_name=args.model,
        storm_title=storm_name,
        total_ensemble_members=args.members,
        max_lead_hours=args.max_lead,
        headline_title=args.headline,
        out_file=out_file
    )


if __name__ == '__main__':
    main()
