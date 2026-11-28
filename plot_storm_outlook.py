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
from shapely.geometry import Point, Polygon, LineString, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree
from sklearn.cluster import KMeans
import urllib.request


def _normalize_outlook_df(df):
    """Standardizes track column names, numeric dtypes, and [-180, 180] longitudes."""
    if df is None or df.empty:
        return pd.DataFrame() if df is None else df

    df = df.copy()
    df.columns = df.columns.str.strip()

    rename_dict = {}
    for col in df.columns:
        col_lower = col.lower()
        if col_lower in ('latitude', 'lat_str') and 'lat' not in df.columns:
            rename_dict[col] = 'lat'
        elif col_lower in ('longitude', 'lon_str') and 'lon' not in df.columns:
            rename_dict[col] = 'lon'
        elif col_lower == 'tau' and 'lead_time_hours' not in df.columns:
            rename_dict[col] = 'lead_time_hours'
    if rename_dict:
        df = df.rename(columns=rename_dict)

    if 'lead_time_hours' not in df.columns and 'lead_time' in df.columns:
        try:
            df['lead_time_hours'] = pd.to_timedelta(df['lead_time']).dt.total_seconds() / 3600.0
        except (ValueError, TypeError):
            df['lead_time_hours'] = np.nan

    if 'maximum_sustained_wind_speed_knots' not in df.columns:
        for alt_wind in ('wind', 'vmax', 'max_wind'):
            if alt_wind in df.columns:
                df['maximum_sustained_wind_speed_knots'] = df[alt_wind]
                break

    for num_col in ('lat', 'lon', 'lead_time_hours', 'maximum_sustained_wind_speed_knots'):
        if num_col in df.columns:
            df[num_col] = pd.to_numeric(df[num_col], errors='coerce')

    if 'lon' in df.columns:
        df['lon'] = np.where(df['lon'] > 180.0, df['lon'] - 360.0, df['lon'])

    return df


def load_track_file(file_path):
    """Loads storm tracks from CSV, XOR-encrypted ENC/DAT, or raw ATCF."""
    if not os.path.exists(file_path):
        print(f"Error: File not found {file_path}")
        return pd.DataFrame()

    if file_path.endswith('.enc') or file_path.endswith('.dat'):
        encrypted_bytes = None
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
            return _normalize_outlook_df(df)
        except Exception as e:
            if encrypted_bytes is not None:
                try:
                    decrypted_bytes = bytearray([b ^ 0xAA for b in encrypted_bytes])
                    csv_text = decrypted_bytes.decode('utf-8')
                    df = pd.read_csv(io.StringIO(csv_text), comment='#')
                    return _normalize_outlook_df(df)
                except Exception as e2:
                    print(f"Failed to decrypt {file_path}: {e2}")
                    return pd.DataFrame()
            print(f"Failed to decrypt {file_path}: {e}")
            return pd.DataFrame()

    try:
        return _normalize_outlook_df(pd.read_csv(file_path, comment='#'))
    except Exception as e:
        print(f"Error reading CSV {file_path}: {e}")
        return pd.DataFrame()


def fetch_knack_active_storms():
    """Fetches active tropical cyclones from the Knack API with standard lat/lon fields."""
    try:
        from plot_ensemble_spaghetti import fetch_knack_active_storms as _spaghetti_fetch
        return _spaghetti_fetch()
    except Exception:
        url = "https://api.knackwx.com/atcf/v2"
        try:
            req = urllib.request.Request(
                url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
            storms = []
            for item in data:
                lat = item.get('latitude')
                lon = item.get('longitude')
                if lat is None or lon is None:
                    continue
                storms.append({
                    'atcf_id': item.get('atcf_id', ''),
                    'name': item.get('storm_name', 'INVEST'),
                    'lat': float(lat),
                    'lon': float(lon),
                    'init_time': item.get('analysis_time', ''),
                    'winds': float(item.get('winds', 0) or 0),
                    'pressure': float(item.get('pressure', 0) or 0)
                })
            return storms
        except Exception as e:
            print(f"Knack API fetch error: {e}")
            return []


def _haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in kilometers between two lat/lon points."""
    r_earth = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2
    )
    return r_earth * 2.0 * math.asin(min(1.0, math.sqrt(a)))


def _extract_storm_num(storm_id_str):
    """Extracts 2-digit ATCF cyclone number from strings like '96W', 'WP96', 'WP962026'."""
    s = str(storm_id_str).upper().strip()
    m = re.search(r'(?:WP|EP|AL|CP|IO|SH)(\d{2})(?:\d{4})?', s)
    if m:
        return int(m.group(1))
    m2 = re.search(r'(?:^|\D)(\d{1,2})W(?:\D|$)', s)
    if m2:
        return int(m2.group(1))
    return int(s) if s.isdigit() else None


def isolate_storm_tracks(df, target_storm_id="96W", knack_storms=None):
    """
    Isolates member tracks strictly for the target storm ID.
    Prevents cross-contamination from adjacent active storms.
    """
    df = _normalize_outlook_df(df)
    if df.empty:
        return df

    # Drop invalid coordinates and paired ensemble mean row (-1) when numeric samples exist
    df = df.dropna(subset=['lat', 'lon', 'lead_time_hours']).copy()
    if df.empty:
        return df
    if 'sample' in df.columns:
        sample_num = pd.to_numeric(df['sample'], errors='coerce')
        if sample_num.notna().any():
            df = df[sample_num != -1].copy()

    target_clean = str(target_storm_id).upper().replace('WP', '').replace('W', '').strip()
    target_num = _extract_storm_num(target_storm_id)
    if target_num is not None:
        target_clean = f"{target_num:02d}"

    # 1. Primary: Use canonical multi-storm partitioner if Knack storms are present
    if knack_storms:
        try:
            from plot_ensemble_spaghetti import assign_tracks_to_knack_storms
            df_assigned, ok = assign_tracks_to_knack_storms(df.sort_values('lead_time_hours'), knack_storms)
            if ok:
                matched_mask = df_assigned['storm_group'].astype(str).apply(
                    lambda sg: sg.startswith('knack_') and _extract_storm_num(sg.replace('knack_', '')) == target_num
                ) if target_num is not None else df_assigned['storm_group'].isin(
                    [f"knack_{target_clean}W", f"knack_WP{target_clean}", f"knack_{target_clean}"]
                )
                matched = df_assigned[matched_mask]
                if target_num is not None and not matched.empty:
                    def _same_or_generic_tid(tval):
                        ts = str(tval).upper().strip()
                        if ts.isdigit():
                            return True
                        tnum = _extract_storm_num(ts)
                        return tnum is None or tnum == target_num
                    matched = matched[matched['track_id'].apply(_same_or_generic_tid)]
                if not matched.empty:
                    n_tracks = len(matched.groupby(['track_id', 'sample']))
                    print(f"Cleanly partitioned {n_tracks} member tracks for {target_storm_id}")
                    member_dfs = []
                    for sid, s_df in matched.groupby('sample'):
                        s_sorted = s_df.sort_values('lead_time_hours').drop_duplicates(subset=['lead_time_hours'])
                        rep_tid = s_sorted['track_id'].iloc[0]
                        s_sorted['track_id'] = rep_tid
                        member_dfs.append(s_sorted)
                    return pd.concat(member_dfs, ignore_index=True) if member_dfs else matched.copy()
        except Exception as e:
            print(f"Knack partition notice: {e}")

    # Find active storm center from Knack storms if available
    target_ref_pos = None
    if knack_storms:
        for s in knack_storms:
            s_num = _extract_storm_num(s.get('atcf_id', ''))
            if (target_num is not None and s_num == target_num) or (
                str(s.get('atcf_id', '')).upper().replace('WP', '').replace('W', '').strip() == target_clean
            ):
                target_ref_pos = (s.get('lat'), s.get('lon'))
                break

    # 2. Secondary fallback: Strict ATCF ID or proximity to active storm coordinates
    matched_groups = []
    for (tid, sid), t_df in df.groupby(['track_id', 'sample']):
        t_df_sorted = t_df.sort_values('lead_time_hours')
        early = t_df_sorted[t_df_sorted['lead_time_hours'] <= 48.0].dropna(subset=['lat', 'lon'])
        if early.empty:
            continue

        tid_str = str(tid).upper().strip()
        tid_storm_num = _extract_storm_num(tid_str) if not tid_str.isdigit() else None

        # Direct track_id match
        if target_num is not None and (f"WP{target_num:02d}" in tid_str or f"{target_num:02d}W" in tid_str):
            matched_groups.append((tid, sid))
            continue

        # Never absorb tracks explicitly labeled as a different ATCF storm
        if tid_storm_num is not None and target_num is not None and tid_storm_num != target_num:
            continue

        f_lat = float(early.iloc[0]['lat'])
        f_lon = float(early.iloc[0]['lon'])

        # Proximity to Knack active storm position (within ~950 km / ~8.5 deg)
        if target_ref_pos and target_ref_pos[0] is not None and target_ref_pos[1] is not None:
            k_lat, k_lon = float(target_ref_pos[0]), float(target_ref_pos[1])
            if _haversine_km(f_lat, f_lon, k_lat, k_lon) <= 950.0:
                matched_groups.append((tid, sid))
                continue

        # Known historical nursery bounds fallback
        if target_num == 96:
            if f_lon >= 158.0 and 4.0 <= f_lat <= 14.0:
                matched_groups.append((tid, sid))
        elif target_num == 95:
            if 144.0 <= f_lon < 156.0 and 10.0 <= f_lat <= 22.0:
                matched_groups.append((tid, sid))
        elif target_num == 27:
            if f_lat >= 22.0:
                matched_groups.append((tid, sid))

    if not matched_groups:
        print(f"Warning: No member tracks isolated for {target_storm_id}")
        return pd.DataFrame()

    matched_set = set(matched_groups)
    idx_filter = [key in matched_set for key in zip(df['track_id'], df['sample'])]
    df_raw = df[idx_filter].copy()

    # Ensure strictly 1 continuous track per ensemble member (sample):
    # If a member has fragmented pieces (e.g. lead 0 invest stub and continued numeric ID),
    # combine them into one unified, continuous track for that sample.
    member_dfs = []
    for sid, s_df in df_raw.groupby('sample'):
        s_sorted = s_df.sort_values('lead_time_hours').drop_duplicates(subset=['lead_time_hours'])
        rep_tid = s_sorted['track_id'].iloc[0]
        s_sorted['track_id'] = rep_tid
        member_dfs.append(s_sorted)

    if member_dfs:
        df_isolated = pd.concat(member_dfs, ignore_index=True)
    else:
        df_isolated = df_raw

    n_members = df_isolated['sample'].nunique()
    print(f"Isolated {n_members} member tracks strictly for storm {target_storm_id}")
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


_PH_PROVINCE_REGION_MAP = {
    # Luzon Strait / Batanes
    'Batanes': ('LANDFALL · TAIWAN / LUZON STRAIT', 'TAIWAN_STRAIT'),
    # Northern Luzon
    'Cagayan': ('LANDFALL · CAGAYAN / ISABELA / N. LUZON', 'LUZON'),
    'Isabela': ('LANDFALL · CAGAYAN / ISABELA / N. LUZON', 'LUZON'),
    'Apayao': ('LANDFALL · CAGAYAN / ISABELA / N. LUZON', 'LUZON'),
    'Kalinga': ('LANDFALL · CAGAYAN / ISABELA / N. LUZON', 'LUZON'),
    'Abra': ('LANDFALL · CAGAYAN / ISABELA / N. LUZON', 'LUZON'),
    'Ilocos Norte': ('LANDFALL · CAGAYAN / ISABELA / N. LUZON', 'LUZON'),
    'Ilocos Sur': ('LANDFALL · CAGAYAN / ISABELA / N. LUZON', 'LUZON'),
    'Mountain Province': ('LANDFALL · CAGAYAN / ISABELA / N. LUZON', 'LUZON'),
    'Ifugao': ('LANDFALL · CAGAYAN / ISABELA / N. LUZON', 'LUZON'),
    'Quirino': ('LANDFALL · CAGAYAN / ISABELA / N. LUZON', 'LUZON'),
    'Nueva Vizcaya': ('LANDFALL · CAGAYAN / ISABELA / N. LUZON', 'LUZON'),
    'Benguet': ('LANDFALL · CAGAYAN / ISABELA / N. LUZON', 'LUZON'),
    'La Union': ('LANDFALL · CAGAYAN / ISABELA / N. LUZON', 'LUZON'),
    # Aurora / Quezon / Polillo
    'Aurora': ('LANDFALL · AURORA / QUEZON / POLILLO', 'LUZON'),
    'Quezon': ('LANDFALL · AURORA / QUEZON / POLILLO', 'LUZON'),
    # Central & Western Luzon
    'Pangasinan': ('LANDFALL · CENTRAL LUZON / W. LUZON', 'LUZON'),
    'Zambales': ('LANDFALL · CENTRAL LUZON / W. LUZON', 'LUZON'),
    'Bataan': ('LANDFALL · CENTRAL LUZON / W. LUZON', 'LUZON'),
    'Tarlac': ('LANDFALL · CENTRAL LUZON / W. LUZON', 'LUZON'),
    'Nueva Ecija': ('LANDFALL · CENTRAL LUZON / W. LUZON', 'LUZON'),
    'Pampanga': ('LANDFALL · CENTRAL LUZON / W. LUZON', 'LUZON'),
    'Bulacan': ('LANDFALL · CENTRAL LUZON / W. LUZON', 'LUZON'),
    'Metropolitan Manila': ('LANDFALL · CENTRAL LUZON / W. LUZON', 'LUZON'),
    'Rizal': ('LANDFALL · CENTRAL LUZON / W. LUZON', 'LUZON'),
    'Cavite': ('LANDFALL · CENTRAL LUZON / W. LUZON', 'LUZON'),
    'Laguna': ('LANDFALL · CENTRAL LUZON / W. LUZON', 'LUZON'),
    # Bicol Region / Catanduanes
    'Catanduanes': ('LANDFALL · BICOL REGION / CATANDUANES', 'LUZON'),
    'Camarines Norte': ('LANDFALL · BICOL REGION / CATANDUANES', 'LUZON'),
    'Camarines Sur': ('LANDFALL · BICOL REGION / CATANDUANES', 'LUZON'),
    'Albay': ('LANDFALL · BICOL REGION / CATANDUANES', 'LUZON'),
    'Sorsogon': ('LANDFALL · BICOL REGION / CATANDUANES', 'LUZON'),
    'Masbate': ('LANDFALL · BICOL REGION / CATANDUANES', 'LUZON'),
    # Southern Luzon / Mindoro / MIMAROPA
    'Batangas': ('LANDFALL · S. LUZON / MINDORO / MIMAROPA', 'LUZON'),
    'Occidental Mindoro': ('LANDFALL · S. LUZON / MINDORO / MIMAROPA', 'LUZON'),
    'Oriental Mindoro': ('LANDFALL · S. LUZON / MINDORO / MIMAROPA', 'LUZON'),
    'Marinduque': ('LANDFALL · S. LUZON / MINDORO / MIMAROPA', 'LUZON'),
    'Romblon': ('LANDFALL · S. LUZON / MINDORO / MIMAROPA', 'LUZON'),
    # Palawan
    'Palawan': ('PASSES PALAWAN · SULU SEA / SCS', 'PALAWAN'),
    # Eastern Visayas
    'Northern Samar': ('LANDFALL · EASTERN SAMAR / LEYTE', 'VISAYAS'),
    'Eastern Samar': ('LANDFALL · EASTERN SAMAR / LEYTE', 'VISAYAS'),
    'Samar': ('LANDFALL · EASTERN SAMAR / LEYTE', 'VISAYAS'),
    'Biliran': ('LANDFALL · EASTERN SAMAR / LEYTE', 'VISAYAS'),
    'Leyte': ('LANDFALL · EASTERN SAMAR / LEYTE', 'VISAYAS'),
    'Southern Leyte': ('LANDFALL · EASTERN SAMAR / LEYTE', 'VISAYAS'),
    # Central & Western Visayas
    'Cebu': ('LANDFALL · CENTRAL / WESTERN VISAYAS', 'VISAYAS'),
    'Bohol': ('LANDFALL · CENTRAL / WESTERN VISAYAS', 'VISAYAS'),
    'Siquijor': ('LANDFALL · CENTRAL / WESTERN VISAYAS', 'VISAYAS'),
    'Negros Oriental': ('LANDFALL · CENTRAL / WESTERN VISAYAS', 'VISAYAS'),
    'Negros Occidental': ('LANDFALL · CENTRAL / WESTERN VISAYAS', 'VISAYAS'),
    'Iloilo': ('LANDFALL · CENTRAL / WESTERN VISAYAS', 'VISAYAS'),
    'Guimaras': ('LANDFALL · CENTRAL / WESTERN VISAYAS', 'VISAYAS'),
    'Capiz': ('LANDFALL · CENTRAL / WESTERN VISAYAS', 'VISAYAS'),
    'Aklan': ('LANDFALL · CENTRAL / WESTERN VISAYAS', 'VISAYAS'),
    'Antique': ('LANDFALL · CENTRAL / WESTERN VISAYAS', 'VISAYAS'),
    # Caraga / Dinagat / Siargao / Surigao
    'Dinagat Islands': ('LANDFALL · DINAGAT / SIARGAO / SURIGAO', 'MINDANAO'),
    'Surigao del Norte': ('LANDFALL · DINAGAT / SIARGAO / SURIGAO', 'MINDANAO'),
    'Surigao del Sur': ('LANDFALL · DINAGAT / SIARGAO / SURIGAO', 'MINDANAO'),
    'Agusan del Norte': ('LANDFALL · DINAGAT / SIARGAO / SURIGAO', 'MINDANAO'),
    'Agusan del Sur': ('LANDFALL · DINAGAT / SIARGAO / SURIGAO', 'MINDANAO'),
    # Davao / Central / Western Mindanao & Sulu Archipelago
    'Davao Oriental': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Compostela Valley': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Davao del Norte': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Davao del Sur': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Bukidnon': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Misamis Oriental': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Misamis Occidental': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Camiguin': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Lanao del Norte': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Lanao del Sur': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'North Cotabato': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'South Cotabato': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Sarangani': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Sultan Kudarat': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Maguindanao': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Shariff Kabunsuan': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Zamboanga del Norte': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Zamboanga del Sur': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Zamboanga Sibugay': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Basilan': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Sulu': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
    'Tawi-Tawi': ('LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'),
}

_PH_REGION_CACHE = None


def _get_ph_region_index():
    """
    Loads and caches Shapely STRtree over buffered Philippine province polygons,
    Taiwan polygon, and the Luzon Strait corridor for accurate segment-based landfall checks.
    """
    global _PH_REGION_CACHE
    if _PH_REGION_CACHE is not None:
        return _PH_REGION_CACHE

    taiwan_poly = Polygon([
        (120.05, 21.95), (120.85, 21.90), (121.55, 22.75),
        (122.00, 25.05), (121.55, 25.30), (120.80, 24.80), (120.15, 23.60)
    ]).buffer(0.04)
    strait_corridor = Polygon([
        (120.20, 18.75), (122.20, 18.75), (122.20, 22.00), (120.20, 22.00)
    ])

    geojson_paths = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "data", "ph_provinces.json"),
        "public/data/ph_provinces.json"
    ]
    found_geojson = next((p for p in geojson_paths if os.path.exists(p)), None)
    if not found_geojson:
        _PH_REGION_CACHE = {
            'tree': None, 'geoms': [], 'names': [], 'cats': [],
            'taiwan': taiwan_poly, 'strait': strait_corridor
        }
        return _PH_REGION_CACHE

    try:
        with open(found_geojson, 'r', encoding='utf-8') as gf:
            gj = json.load(gf)
        geoms, names, cats = [], [], []
        for feat in gj.get('features', []):
            geom = feat.get('geometry')
            if not geom:
                continue
            props = feat.get('properties', {})
            prov_name = str(props.get('PROVINCE') or props.get('NAME_1') or '').strip()
            cat_info = _PH_PROVINCE_REGION_MAP.get(prov_name)
            if not cat_info:
                continue
            # Tiny ~4.4 km coastal buffer catches shoreline grazes & narrow islands without false offshore hits
            geoms.append(shape(geom).buffer(0.04))
            names.append(prov_name)
            cats.append(cat_info)

        tree = STRtree(geoms) if geoms else None
        _PH_REGION_CACHE = {
            'tree': tree, 'geoms': geoms, 'names': names, 'cats': cats,
            'taiwan': taiwan_poly, 'strait': strait_corridor
        }
    except Exception as e:
        print(f"Warning: Failed to build PH region STRtree: {e}")
        _PH_REGION_CACHE = {
            'tree': None, 'geoms': [], 'names': [], 'cats': [],
            'taiwan': taiwan_poly, 'strait': strait_corridor
        }

    return _PH_REGION_CACHE


def _unwrap_wnp_lons(lons):
    """Unwraps WNP longitudes continuously across the 180° antimeridian."""
    arr = np.asarray(lons, dtype=float)
    if len(arr) == 0:
        return arr
    # Only convert negative (-180..0) longitudes to 180..360 when track lies in WNP/Central Pacific
    if np.nanmax(arr) > 90.0 or np.nanmin(arr) < -100.0:
        arr = np.where((arr < 0.0) & (arr >= -180.0), arr + 360.0, arr)
    return arr


def _find_chronological_hits(lon_u, lats, leads):
    """
    Finds chronological landfall hits against PH province polygons and Taiwan,
    plus separate Luzon Strait water corridor crossings.
    Returns (land_hits, strait_hits), each sorted chronologically as (lead_h, cat_name, macro_group).
    """
    idx_data = _get_ph_region_index()
    tree = idx_data['tree']
    geoms = idx_data['geoms']
    names = idx_data['names']
    cats = idx_data['cats']
    taiwan_poly = idx_data['taiwan']
    strait_corridor = idx_data['strait']

    land_hits = []
    strait_hits = []

    for i in range(len(lon_u) - 1):
        x1, y1, h1 = float(lon_u[i]), float(lats[i]), float(leads[i])
        x2, y2, h2 = float(lon_u[i + 1]), float(lats[i + 1]), float(leads[i + 1])

        # Skip segments completely outside PH / Taiwan / Strait domain
        if max(x1, x2) < 116.5 or min(x1, x2) > 127.0 or max(y1, y2) < 4.4 or min(y1, y2) > 25.6:
            continue

        seg = LineString([(x1, y1), (x2, y2)])
        seg_len = seg.length
        p_start = Point(x1, y1)
        seg_land_hits = []

        if tree is not None:
            for idx in tree.query(seg, predicate='intersects'):
                inter = seg.intersection(geoms[idx])
                if inter.is_empty:
                    continue
                entry_dist = p_start.distance(inter)
                frac = (entry_dist / seg_len) if seg_len > 0 else 0.0
                hit_lead = h1 + frac * (h2 - h1)
                cat_name, macro = cats[idx]
                if names[idx] == 'Cagayan' and inter.centroid.y >= 18.75:
                    cat_name, macro = ('LANDFALL · TAIWAN / LUZON STRAIT', 'TAIWAN_STRAIT')
                seg_land_hits.append((hit_lead, entry_dist, cat_name, macro))
        else:
            # Coarse fallback only when ph_provinces.json is missing
            n_steps = max(2, int(math.ceil(seg_len / 0.25)))
            for s in np.linspace(0.0, 1.0, n_steps):
                px = x1 + s * (x2 - x1)
                py = y1 + s * (y2 - y1)
                hit_lead = h1 + s * (h2 - h1)
                if 18.8 <= py <= 25.5 and 119.8 <= px <= 122.4:
                    seg_land_hits.append((hit_lead, s * seg_len, 'LANDFALL · TAIWAN / LUZON STRAIT', 'TAIWAN_STRAIT'))
                elif 16.5 <= py < 18.8 and 120.4 <= px <= 122.4:
                    seg_land_hits.append((hit_lead, s * seg_len, 'LANDFALL · CAGAYAN / ISABELA / N. LUZON', 'LUZON'))
                elif 14.3 <= py < 16.5 and 121.3 <= px <= 122.4:
                    seg_land_hits.append((hit_lead, s * seg_len, 'LANDFALL · AURORA / QUEZON / POLILLO', 'LUZON'))
                elif 12.3 <= py < 14.3 and 122.5 <= px <= 124.5:
                    seg_land_hits.append((hit_lead, s * seg_len, 'LANDFALL · BICOL REGION / CATANDUANES', 'LUZON'))
                elif 14.3 <= py < 16.5 and 119.8 <= px < 121.3:
                    seg_land_hits.append((hit_lead, s * seg_len, 'LANDFALL · CENTRAL LUZON / W. LUZON', 'LUZON'))
                elif 12.2 <= py < 14.3 and 120.2 <= px < 122.5:
                    seg_land_hits.append((hit_lead, s * seg_len, 'LANDFALL · S. LUZON / MINDORO / MIMAROPA', 'LUZON'))
                elif 9.8 <= py < 12.5 and 124.0 <= px <= 125.9:
                    seg_land_hits.append((hit_lead, s * seg_len, 'LANDFALL · EASTERN SAMAR / LEYTE', 'VISAYAS'))
                elif 9.0 <= py < 12.0 and 121.9 <= px < 124.0:
                    seg_land_hits.append((hit_lead, s * seg_len, 'LANDFALL · CENTRAL / WESTERN VISAYAS', 'VISAYAS'))
                elif 8.5 <= py < 10.5 and 125.0 <= px <= 126.5:
                    seg_land_hits.append((hit_lead, s * seg_len, 'LANDFALL · DINAGAT / SIARGAO / SURIGAO', 'MINDANAO'))
                elif 5.2 <= py < 8.5 and 121.8 <= px <= 126.6:
                    seg_land_hits.append((hit_lead, s * seg_len, 'LANDFALL · DAVAO / CENTRAL MINDANAO', 'MINDANAO'))

        if seg.intersects(taiwan_poly):
            inter_tw = seg.intersection(taiwan_poly)
            if not inter_tw.is_empty:
                entry_dist = p_start.distance(inter_tw)
                frac = (entry_dist / seg_len) if seg_len > 0 else 0.0
                seg_land_hits.append((h1 + frac * (h2 - h1), entry_dist, 'LANDFALL · TAIWAN / LUZON STRAIT', 'TAIWAN_STRAIT'))

        seg_land_hits.sort(key=lambda item: (item[0], item[1]))
        for hl, _, cname, macro in seg_land_hits:
            land_hits.append((hl, cname, macro))

        if seg.intersects(strait_corridor):
            inter_st = seg.intersection(strait_corridor)
            if not inter_st.is_empty:
                entry_dist = p_start.distance(inter_st)
                frac = (entry_dist / seg_len) if seg_len > 0 else 0.0
                strait_hits.append((h1 + frac * (h2 - h1), 'LANDFALL · TAIWAN / LUZON STRAIT', 'TAIWAN_STRAIT'))

    return land_hits, strait_hits


def _is_hainan_or_guangdong(lat, lon):
    """Distinguishes Hainan/Guangdong/Hong Kong coast from Vietnam coast."""
    return (lat >= 18.5 and lon >= 108.5) or (lat >= 18.0 and lon >= 111.0)


def _track_hits_ph(t_df):
    """Returns True if track intersects any Philippine province polygon."""
    clean = t_df.dropna(subset=['lat', 'lon', 'lead_time_hours']).sort_values('lead_time_hours')
    if len(clean) < 2:
        return False
    lon_u = _unwrap_wnp_lons(clean['lon'].values)
    lats = clean['lat'].values.astype(float)
    leads = clean['lead_time_hours'].values.astype(float)
    land_hits, _ = _find_chronological_hits(lon_u, lats, leads)
    return any(macro in ('LUZON', 'VISAYAS', 'MINDANAO', 'PALAWAN') for _, _, macro in land_hits) or any(
        19.8 <= lat <= 21.0 and 121.6 <= lon <= 122.2
        for lon, lat in zip(lon_u, lats)
    )


def classify_ensemble_track(t_df):
    """
    Classifies an individual ensemble member track into a meteorologically meaningful,
    geographically precise scenario covering the Western North Pacific, PAR, and South China Sea:
      - Uses segment-based Shapely polygon intersections against Philippine provinces & Taiwan
        (eliminating false offshore landfalls, 6h/12h box-skipping, and unreachable SCS categories).
      - Unwraps longitudes across the 180° antimeridian and preserves chronological event order.
    """
    clean_df = t_df.dropna(subset=['lat', 'lon', 'lead_time_hours']).sort_values('lead_time_hours').reset_index(drop=True)
    if len(clean_df) < 2:
        return 'DISSIPATION · PHILIPPINE SEA'

    lon_u = _unwrap_wnp_lons(clean_df['lon'].values)
    lats = clean_df['lat'].values.astype(float)
    leads = clean_df['lead_time_hours'].values.astype(float)

    min_lon = float(np.min(lon_u))
    max_lat = float(np.max(lats))
    first_lat = float(lats[0])
    first_lon = float(lon_u[0])
    last_lat = float(lats[-1])
    last_lon = float(lon_u[-1])

    min_lon_pos = int(np.argmin(lon_u))
    lat_at_min_lon = float(lats[min_lon_pos])
    delta_lon_turn = last_lon - min_lon
    delta_lat_turn = last_lat - lat_at_min_lon

    land_hits, strait_hits = _find_chronological_hits(lon_u, lats, leads)

    # ─────────────────────────────────────────────────────────────
    # A. DIRECT LANDFALL & ARCHIPELAGO CROSSINGS (POLYGONS FIRST)
    # ─────────────────────────────────────────────────────────────
    if land_hits:
        first_hit_lead, first_cat, first_macro = land_hits[0]
        # Prefer first Philippine landmass hit if the track hit PH/Luzon/Visayas/Mindanao after Batanes/Taiwan
        ph_only_hits = [h for h in land_hits if h[2] in ('LUZON', 'VISAYAS', 'MINDANAO', 'PALAWAN')]
        if first_macro == 'TAIWAN_STRAIT' and ph_only_hits:
            # If a storm grazed Batanes/Babuyan briefly then hit Luzon, classify by Luzon landfall if close in time
            if ph_only_hits[0][0] - first_hit_lead <= 24.0:
                first_hit_lead, first_cat, first_macro = ph_only_hits[0]

        post_mask = leads >= first_hit_lead
        post_lons = lon_u[post_mask]
        post_lats = lats[post_mask]
        post_min_lon = float(np.min(post_lons)) if len(post_lons) else last_lon

        if first_macro == 'LUZON':
            post_scs_mask = post_lons <= 119.5
            if np.any(post_scs_mask) and post_min_lon <= 119.3:
                scs_end_lat = float(post_lats[post_scs_mask][-1])
                scs_end_lon = float(post_lons[post_scs_mask][-1])
                if _is_hainan_or_guangdong(scs_end_lat, scs_end_lon):
                    return 'CROSSES LUZON · HAINAN / GUANGDONG'
                if scs_end_lon <= 111.5:
                    return 'CROSSES LUZON · VIETNAM'
                return 'CROSSES LUZON · SOUTH CHINA SEA'
            return first_cat

        if first_macro == 'VISAYAS':
            if post_min_lon <= 121.0:
                return 'CROSSES VISAYAS · SULU SEA / SCS'
            return first_cat

        if first_macro == 'MINDANAO':
            if post_min_lon <= 122.0:
                return 'CROSSES MINDANAO · SULU SEA'
            return first_cat

        if first_macro == 'PALAWAN':
            return 'PASSES PALAWAN · SULU SEA / SCS'

        if first_macro == 'TAIWAN_STRAIT':
            return 'LANDFALL · TAIWAN / LUZON STRAIT'

    # Luzon Strait water passage (Bashi / Balintang Channel without touching PH/Taiwan land)
    if strait_hits:
        st_lead = strait_hits[0][0]
        post_mask = leads >= st_lead
        post_lons = lon_u[post_mask]
        post_lats = lats[post_mask]
        post_min_lon = float(np.min(post_lons)) if len(post_lons) else last_lon

        # Originated in SCS and recurved northeast through Luzon Strait
        if first_lon <= 119.5 and delta_lon_turn >= 1.5 and last_lat >= 19.0:
            return 'RECURVE · WPS / SCS'
        # Passed cleanly through Luzon Strait westward into China / Hainan / Vietnam
        if post_min_lon <= 116.5:
            if _is_hainan_or_guangdong(last_lat, last_lon):
                return 'WESTWARD · HAINAN / GUANGDONG'
            if last_lon <= 111.5:
                return 'WESTWARD · VIETNAM / S. CHINA SEA'
            return 'WESTWARD · HAINAN / GUANGDONG'
        return 'LANDFALL · TAIWAN / LUZON STRAIT'

    # ─────────────────────────────────────────────────────────────
    # B. OFFSHORE RECURVATURE (NO PH / TAIWAN LANDFALL)
    # ─────────────────────────────────────────────────────────────
    is_recurve = (
        (delta_lon_turn >= 1.5 and last_lat >= 20.0 and delta_lat_turn >= 2.0)
        or (last_lat >= 23.0 and (last_lat - first_lat) >= 5.0 and min_lon >= 120.5)
    )
    if min_lon >= 128.5 and is_recurve:
        return 'RECURVE · S. JAPAN / OPEN PACIFIC'

    if 120.5 <= min_lon < 128.5 and is_recurve:
        if min_lon >= 126.5 and last_lat >= 25.0:
            return 'RECURVE · S. JAPAN / OPEN PACIFIC'
        if lat_at_min_lon >= 18.5 or max_lat >= 24.0:
            return 'RECURVE · EAST OF TAIWAN / RYUKYU'
        return 'RECURVE · PHILIPPINE SEA'

    # ─────────────────────────────────────────────────────────────
    # C. SOUTH CHINA SEA / WEST PHILIPPINE SEA SCENARIOS
    # ─────────────────────────────────────────────────────────────
    if min_lon <= 120.5:
        # 1) Recurvature in South China Sea / West of Luzon
        if delta_lon_turn >= 1.5 and last_lat >= 19.0 and delta_lat_turn >= 2.0:
            return 'RECURVE · WPS / SCS'

        # 2) Passes West of Luzon offshore (tracks northward in WPS without hitting Luzon)
        if (
            116.0 <= min_lon <= 120.5
            and float(np.max(lon_u)) <= 121.0
            and 11.5 <= lat_at_min_lon <= 20.5
            and last_lat >= 18.5
            and (last_lat - first_lat) >= 3.0
            and delta_lon_turn < 1.5
        ):
            return 'PASSES WEST OF LUZON · W. PHILIPPINE SEA'

        # 3) Passes near Palawan / Sulu Sea offshore
        if 7.0 <= lat_at_min_lon <= 12.0 and 117.0 <= min_lon <= 122.0 and first_lon >= 118.0:
            return 'PASSES PALAWAN · SULU SEA / SCS'

        # 4) Westward toward Hainan Island / Guangdong / Hong Kong
        if _is_hainan_or_guangdong(last_lat, last_lon):
            return 'WESTWARD · HAINAN / GUANGDONG'

        # 5) Westward toward Vietnam
        if last_lon <= 111.5:
            return 'WESTWARD · VIETNAM / S. CHINA SEA'

        # 6) Central South China Sea / Spratlys
        return 'WESTWARD · S. CHINA SEA / SPRATLYS'

    # ─────────────────────────────────────────────────────────────
    # D. OFFSHORE APPROACH & DISSIPATION (EAST OF PHILIPPINES)
    # ─────────────────────────────────────────────────────────────
    if last_lat >= 23.0 and (last_lat - first_lat) >= 5.0:
        return 'RECURVE · S. JAPAN / OPEN PACIFIC'
    if min_lon <= 127.0:
        return 'OFFSHORE · EAST OF PHILIPPINES'
    return 'DISSIPATION · PHILIPPINE SEA'


_CORRIDOR_ROLLUP_MAP = {
    'LANDFALL · CAGAYAN / ISABELA / N. LUZON': 'LANDFALL / CROSSES LUZON',
    'LANDFALL · AURORA / QUEZON / POLILLO': 'LANDFALL / CROSSES LUZON',
    'LANDFALL · CENTRAL LUZON / W. LUZON': 'LANDFALL / CROSSES LUZON',
    'LANDFALL · BICOL REGION / CATANDUANES': 'LANDFALL / CROSSES LUZON',
    'LANDFALL · S. LUZON / MINDORO / MIMAROPA': 'LANDFALL / CROSSES LUZON',
    'CROSSES LUZON · SOUTH CHINA SEA': 'LANDFALL / CROSSES LUZON',
    'CROSSES LUZON · HAINAN / GUANGDONG': 'LANDFALL / CROSSES LUZON',
    'CROSSES LUZON · VIETNAM': 'LANDFALL / CROSSES LUZON',
    'LANDFALL · EASTERN SAMAR / LEYTE': 'LANDFALL / CROSSES VISAYAS',
    'LANDFALL · CENTRAL / WESTERN VISAYAS': 'LANDFALL / CROSSES VISAYAS',
    'CROSSES VISAYAS · SULU SEA / SCS': 'LANDFALL / CROSSES VISAYAS',
    'LANDFALL · DINAGAT / SIARGAO / SURIGAO': 'LANDFALL / CROSSES MINDANAO',
    'LANDFALL · DAVAO / CENTRAL MINDANAO': 'LANDFALL / CROSSES MINDANAO',
    'CROSSES MINDANAO · SULU SEA': 'LANDFALL / CROSSES MINDANAO',
    'WESTWARD · VIETNAM / S. CHINA SEA': 'WESTWARD · SOUTH CHINA SEA',
    'WESTWARD · HAINAN / GUANGDONG': 'WESTWARD · SOUTH CHINA SEA',
    'WESTWARD · S. CHINA SEA / SPRATLYS': 'WESTWARD · SOUTH CHINA SEA',
    'RECURVE · S. JAPAN / OPEN PACIFIC': 'RECURVE · OFFSHORE PACIFIC',
    'RECURVE · EAST OF TAIWAN / RYUKYU': 'RECURVE · OFFSHORE PACIFIC',
    'RECURVE · PHILIPPINE SEA': 'RECURVE · OFFSHORE PACIFIC',
}


def _consolidate_fragmented_tracks(grouped_tracks, total_tracked, min_pct=10.0):
    """
    Hierarchical rollup: preserves any scenario already >= min_pct with its exact regional label,
    while consolidating sub-threshold (< min_pct) sibling tracks in the same meteorological corridor
    when their combined share reaches >= min_pct (preventing normal spread across Luzon/Visayas
    sub-regions from being dropped by the 10% display cutoff).
    """
    consolidated = {}
    sub_buckets = {}

    for cat_name, c_tracks in grouped_tracks.items():
        pct = (len(c_tracks) / total_tracked) * 100.0
        if pct >= min_pct:
            consolidated[cat_name] = list(c_tracks)
        else:
            parent = _CORRIDOR_ROLLUP_MAP.get(cat_name, cat_name)
            sub_buckets.setdefault(parent, []).extend(c_tracks)

    for parent, tracks in sub_buckets.items():
        if parent in consolidated:
            consolidated[parent].extend(tracks)
        else:
            consolidated[parent] = tracks

    return consolidated


def _compute_scenario_mean_df(c_tracks, max_lead_hours):
    """Computes scenario mean trajectory (with unwrapped WNP longitudes) and median winds."""
    count = len(c_tracks)
    all_leads = sorted({
        float(h) for t in c_tracks for h in t['df']['lead_time_hours'] if h <= max_lead_hours
    })
    if not all_leads:
        return pd.DataFrame()

    min_surviving = min(count, max(2, int(round(count * 0.30))))
    if count == 1:
        min_surviving = 1

    # Precompute unwrapped longitudes & start/end leads per member
    prepared = []
    for t in c_tracks:
        tdf = t['df'].dropna(subset=['lat', 'lon', 'lead_time_hours']).sort_values('lead_time_hours')
        if len(tdf) < 2:
            continue
        t_leads = tdf['lead_time_hours'].values.astype(float)
        t_lats = tdf['lat'].values.astype(float)
        t_lons = _unwrap_wnp_lons(tdf['lon'].values)
        wind_col = (
            'maximum_sustained_wind_speed_knots'
            if 'maximum_sustained_wind_speed_knots' in tdf.columns
            else ('wind' if 'wind' in tdf.columns else None)
        )
        t_winds = tdf[wind_col].values.astype(float) if wind_col else None
        prepared.append({
            'min_lead': float(t_leads[0]),
            'max_lead': float(t_leads[-1]),
            'leads': t_leads,
            'lats': t_lats,
            'lons': t_lons,
            'winds': t_winds,
        })

    if not prepared:
        return pd.DataFrame()

    # Wait until enough members exist (handles staggered genesis), then stop when survivors drop
    started = False
    mean_pts = []
    for lead in all_leads:
        active_mems = [m for m in prepared if m['min_lead'] <= lead <= m['max_lead']]
        if len(active_mems) < min_surviving:
            if started:
                break
            continue
        started = True

        l_lats = [float(np.interp(lead, m['leads'], m['lats'])) for m in active_mems]
        l_lons = [float(np.interp(lead, m['leads'], m['lons'])) for m in active_mems]
        l_winds = []
        for m in active_mems:
            if m['winds'] is not None:
                valid_w = ~np.isnan(m['winds'])
                if np.any(valid_w):
                    l_winds.append(float(np.interp(lead, m['leads'][valid_w], m['winds'][valid_w])))

        if l_lats and l_lons:
            mean_pts.append({
                'lead': lead,
                'lat': float(np.mean(l_lats)),
                'lon': float(np.mean(l_lons)),
                'wind': float(np.nanmedian(l_winds)) if l_winds else np.nan
            })

    return pd.DataFrame(mean_pts)


def cluster_track_scenarios(df_storm, n_clusters=3, max_lead_hours=318):
    """
    Dynamically categorizes ensemble member tracks across all potential scenarios,
    consolidates fragmented sub-threshold corridors, and isolates up to the top 3 scenarios.
    """
    from collections import defaultdict

    track_list = []
    for (tid, sid), t_df in df_storm.groupby(['track_id', 'sample']):
        t_df = (
            t_df[t_df['lead_time_hours'] <= max_lead_hours]
            .dropna(subset=['lat', 'lon', 'lead_time_hours'])
            .sort_values('lead_time_hours')
            .reset_index(drop=True)
        )
        if len(t_df) < 2:
            continue

        cat = classify_ensemble_track(t_df)
        track_list.append({
            'tid': tid, 'sid': sid, 'df': t_df,
            'category': cat
        })

    if not track_list:
        return []

    total_tracked = len(track_list)
    raw_grouped = defaultdict(list)
    for t in track_list:
        raw_grouped[t['category']].append(t)

    grouped_tracks = _consolidate_fragmented_tracks(raw_grouped, total_tracked, min_pct=10.0)

    raw_clusters = []
    for cat_name, c_tracks in grouped_tracks.items():
        if not c_tracks:
            continue
        count = len(c_tracks)
        pct = (count / total_tracked) * 100.0

        mean_df = _compute_scenario_mean_df(c_tracks, max_lead_hours)

        all_peak_w = []
        for t in c_tracks:
            w_col = (
                'maximum_sustained_wind_speed_knots'
                if 'maximum_sustained_wind_speed_knots' in t['df'].columns
                else ('wind' if 'wind' in t['df'].columns else None)
            )
            if w_col and not t['df'][w_col].dropna().empty:
                all_peak_w.append(float(t['df'][w_col].max()))
        peak_median_kt = int(round(np.nanmedian(all_peak_w))) if all_peak_w else 95

        ph_landfall_count = sum(1 for t in c_tracks if _track_hits_ph(t['df']))
        ph_landfall_pct = int(round((ph_landfall_count / count) * 100))

        raw_clusters.append({
            'count': count,
            'pct': pct,
            'name': cat_name,
            'tracks': c_tracks,
            'mean_df': mean_df,
            'peak_median_kt': peak_median_kt,
            'ph_landfall_pct': ph_landfall_pct
        })

    # Filter out any scenario with lower than 10% probability (< 10.0%) as requested
    significant_clusters = [c for c in raw_clusters if c['pct'] >= 10.0]
    if not significant_clusters:
        significant_clusters = [max(raw_clusters, key=lambda c: c['count'])]

    # Sort descending by member count
    significant_clusters.sort(key=lambda c: c['count'], reverse=True)

    # Strictly limit up to top 3 scenarios as requested
    clusters = significant_clusters[:n_clusters]

    # Re-normalize percentages to 100% of the active scenarios
    total_valid = sum(c['count'] for c in clusters)
    if total_valid > 0:
        for c in clusters:
            c['pct'] = (c['count'] / total_valid) * 100.0

    # Ensure strictly only scenarios with >= 10% normalized probability are displayed
    clusters = [c for c in clusters if c['pct'] >= 10.0]

    # Assign letters A, B, C and distinctive color theme
    palette = [
        {'color': '#38bdf8', 'halo': '#0369a1'},  # Cyan (Scenario A - Primary)
        {'color': '#4ade80', 'halo': '#166534'},  # Emerald / Lime (Scenario B - Secondary)
        {'color': '#f97316', 'halo': '#c2410c'},  # Vibrant Orange (Scenario C - Tertiary)
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
    if not scenarios:
        print("Warning: No valid multi-point track scenarios to render.")
        return
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
            lons = _unwrap_wnp_lons(t_df['lon'].values)
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

                    # Avoid cluttered duplicate date labels when member tracks are bundled together early on
                    if h <= 144 and letter != 'A':
                        continue

                    # Distinct vertical offsets for post-divergence callouts
                    y_off = 0.45 if letter == 'A' else (-0.55 if letter == 'B' else -0.65)
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

    # List Scenarios (Clean, streamlined display)
    n_sc = len(scenarios)
    if n_sc == 1:
        y_start, y_gap = 0.45, 0.0
    elif n_sc == 2:
        y_start, y_gap = 0.52, 0.23
    else:
        y_start, y_gap = 0.58, 0.21

    for idx, sc in enumerate(scenarios):
        y_pos = y_start - idx * y_gap
        sc_col = sc['style']['color']
        letter = sc['letter']

        # Circular Letter Badge
        ax_hud.text(
            0.08, y_pos, f" {letter} ",
            fontsize=8.5, weight='black', color='#090d14', ha='center', va='center',
            bbox=dict(boxstyle='circle,pad=0.25', facecolor=sc_col, edgecolor='#ffffff', linewidth=1.0)
        )

        # Scenario Name with responsive font sizing
        if len(sc['name']) > 34:
            name_font_size = 7.0
        elif len(sc['name']) > 28:
            name_font_size = 7.6
        else:
            name_font_size = 8.2

        ax_hud.text(
            0.17, y_pos + 0.035, sc['name'],
            fontsize=name_font_size, weight='heavy', color='#f1f5f9', va='center'
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

    # Set Dynamic Map Extents (expand westward if tracks enter western South China Sea / Vietnam)
    all_lons = []
    for sc in scenarios:
        for t in sc['tracks']:
            all_lons.extend(_unwrap_wnp_lons(t['df']['lon'].dropna().values).tolist())
    min_lon_ext = 110.0
    if all_lons and min(all_lons) < 112.0:
        min_lon_ext = max(98.0, min(110.0, math.floor(min(all_lons) - 3.0)))
    ax_map.set_extent([min_lon_ext, 170.0, 4.0, 42.0], crs=ccrs.PlateCarree())
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

    is_invest = bool(re.search(r'(?:^|\D)9\d(?:\D|$)', args.storm.upper()))
    storm_name = f"INVEST {args.storm.upper()}" if is_invest else f"TC {args.storm.upper()}"
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
