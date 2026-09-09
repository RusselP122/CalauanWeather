import base64
import csv
import glob
import io
import os
import sys

XOR_KEY = "CalauanWeather2026".encode('utf-8')

ESSENTIAL_COLS = [
    'init_time', 'track_id', 'sample', 'valid_time', 'lead_time',
    'lead_time_hours', 'lat', 'lon', 'minimum_sea_level_pressure_hpa',
    'maximum_sustained_wind_speed_knots'
]

def obfuscate_bytes(data: bytes) -> bytes:
    key_len = len(XOR_KEY)
    obfuscated = bytearray(len(data))
    for i in range(len(data)):
        obfuscated[i] = data[i] ^ XOR_KEY[i % key_len]
    return base64.b64encode(obfuscated)

def deobfuscate_bytes(b64_data: bytes) -> bytes:
    raw = bytearray(base64.b64decode(b64_data))
    key_len = len(XOR_KEY)
    for i in range(len(raw)):
        raw[i] ^= XOR_KEY[i % key_len]
    return bytes(raw)

def prune_csv_bytes(raw_bytes: bytes) -> bytes:
    """Strip unused wind radii columns and trim excess float decimals to save bandwidth."""
    try:
        text = raw_bytes.decode('utf-8', errors='ignore')
    except Exception:
        return raw_bytes

    lines = text.splitlines()
    header_idx = -1
    comment_lines = []
    for idx, line in enumerate(lines):
        if line.startswith('#'):
            comment_lines.append(line)
        elif ',' in line:
            header_idx = idx
            break

    if header_idx == -1:
        return raw_bytes

    reader = csv.reader(lines[header_idx:])
    try:
        header = [c.strip().lower() for c in next(reader)]
    except StopIteration:
        return raw_bytes

    header_map = {col: i for i, col in enumerate(header)}

    # Check if this CSV has cyclogenesis columns
    if 'minimum_sea_level_pressure_hpa' not in header_map or 'lat' not in header_map:
        return raw_bytes

    keep_indices = []
    keep_names = []
    for col in ESSENTIAL_COLS:
        if col in header_map:
            keep_indices.append(header_map[col])
            keep_names.append(col)

    # If already pruned (no extra columns), return original
    if len(header) <= len(keep_indices) + 1:
        return raw_bytes

    out = io.StringIO()
    for cl in comment_lines:
        out.write(cl + '\n')
    writer = csv.writer(out, lineterminator='\n')
    writer.writerow(keep_names)

    lat_i = header_map.get('lat', -1)
    lon_i = header_map.get('lon', -1)
    p_i = header_map.get('minimum_sea_level_pressure_hpa', -1)
    w_i = header_map.get('maximum_sustained_wind_speed_knots', -1)
    h_i = header_map.get('lead_time_hours', -1)

    for row in reader:
        if not row or len(row) != len(header):
            continue
        out_row = []
        for k in keep_indices:
            val = row[k].strip()
            if k in (lat_i, lon_i):
                try:
                    val = f"{float(val):.2f}"
                except ValueError:
                    pass
            elif k in (p_i, w_i):
                try:
                    val = f"{float(val):.1f}"
                except ValueError:
                    pass
            elif k == h_i:
                try:
                    val = f"{float(val):.0f}"
                except ValueError:
                    pass
            out_row.append(val)
        writer.writerow(out_row)

    return out.getvalue().encode('utf-8')

def prune_existing_enc_files():
    """Scan and prune already-saved .enc files in public/data."""
    enc_files = glob.glob('public/data/*.enc')
    print(f"Scanning {len(enc_files)} .enc files for pruning...")
    for filepath in enc_files:
        try:
            with open(filepath, 'rb') as f:
                b64_content = f.read()
            raw = deobfuscate_bytes(b64_content)
            pruned = prune_csv_bytes(raw)
            if len(pruned) < len(raw):
                new_enc = obfuscate_bytes(pruned)
                with open(filepath, 'wb') as f:
                    f.write(new_enc)
                saved_pct = 100 - (len(new_enc) / len(b64_content) * 100)
                print(f"Pruned {filepath}: {len(b64_content)/(1024*1024):.1f}MB -> {len(new_enc)/(1024*1024):.1f}MB ({saved_pct:.1f}% reduction)")
        except Exception as e:
            print(f"Skipping {filepath}: {e}")

def main():
    if "--prune-existing" in sys.argv:
        prune_existing_enc_files()

    print("Obfuscating CSV files in public/data/...")
    csv_files = glob.glob('public/data/*.csv')

    if not csv_files:
        print("No CSV files found to obfuscate.")
        return

    for filepath in csv_files:
        try:
            with open(filepath, 'rb') as f:
                data = f.read()

            # Prune cyclogenesis columns if applicable
            pruned_data = prune_csv_bytes(data)
            encrypted = obfuscate_bytes(pruned_data)

            new_filepath = filepath.replace('.csv', '.enc')
            with open(new_filepath, 'wb') as f:
                f.write(encrypted)

            # Remove original CSV so it doesn't get deployed/exposed
            os.remove(filepath)
            print(f"Successfully pruned & obfuscated {filepath} -> {new_filepath}")
        except Exception as e:
            print(f"Error obfuscating {filepath}: {e}")

if __name__ == "__main__":
    main()
