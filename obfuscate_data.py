import base64
import glob
import os

def obfuscate_bytes(data: bytes, key: str = "CalauanWeather2026") -> bytes:
    key_bytes = key.encode('utf-8')
    obfuscated = bytearray(len(data))
    for i in range(len(data)):
        obfuscated[i] = data[i] ^ key_bytes[i % len(key_bytes)]
    return base64.b64encode(obfuscated)

def main():
    print("Obfuscating CSV files...")
    # Find all CSV files in public/data/
    csv_files = glob.glob('public/data/*.csv')
    
    if not csv_files:
        print("No CSV files found to obfuscate.")
        return

    for filepath in csv_files:
        try:
            with open(filepath, 'rb') as f:
                data = f.read()
            
            encrypted = obfuscate_bytes(data)
            
            new_filepath = filepath.replace('.csv', '.enc')
            with open(new_filepath, 'wb') as f:
                f.write(encrypted)
            
            # Remove original CSV so it doesn't get deployed/exposed
            os.remove(filepath)
            print(f"Successfully obfuscated {filepath} -> {new_filepath}")
        except Exception as e:
            print(f"Error obfuscating {filepath}: {e}")

if __name__ == "__main__":
    main()
