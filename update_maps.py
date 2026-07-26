import re
import glob
import os

files = glob.glob("Forcast*.py")
for file in files:
    with open(file, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    # 1. Figure facecolor
    content = re.sub(r'fig\s*=\s*plt\.figure\(figsize=\(12,\s*12\)\)', 
                     r"fig = plt.figure(figsize=(12, 12), facecolor='#0f172a')", content)

    # 2. Land, ocean, coastlines
    content = re.sub(r"ax\.add_feature\(cfeature\.LAND, facecolor='lightgray'\)", 
                     r"ax.add_feature(cfeature.LAND, facecolor='#1e293b')", content)
    content = re.sub(r"ax\.add_feature\(cfeature\.COASTLINE, linewidth=1\.5\)", 
                     r"ax.add_feature(cfeature.COASTLINE, edgecolor='#475569', linewidth=1.5)", content)
    content = re.sub(r"ax\.add_feature\(cfeature\.BORDERS, linestyle=':', linewidth=1\)", 
                     r"ax.add_feature(cfeature.BORDERS, edgecolor='#475569', linestyle=':', linewidth=1)", content)
    content = re.sub(r"ax\.add_feature\(cfeature\.OCEAN, facecolor='aliceblue'\)", 
                     r"ax.add_feature(cfeature.OCEAN, facecolor='#0f172a')", content)

    # 3. Gridlines
    content = re.sub(r"gl\s*=\s*ax\.gridlines\(draw_labels=True, linewidth=0\.5, color='gray', alpha=0\.5, linestyle='--'\)", 
                     r"gl = ax.gridlines(draw_labels=True, linewidth=0.5, color='#334155', alpha=0.8, linestyle='--')", content)
    content = re.sub(r"gl\.xlabel_style\s*=\s*\{'size':\s*12,\s*'weight':\s*'bold'\}", 
                     r"gl.xlabel_style = {'size': 12, 'weight': 'bold', 'color': '#cbd5e1'}", content)
    content = re.sub(r"gl\.ylabel_style\s*=\s*\{'size':\s*12,\s*'weight':\s*'bold'\}", 
                     r"gl.ylabel_style = {'size': 12, 'weight': 'bold', 'color': '#cbd5e1'}", content)

    # 4. PAR boundary
    content = re.sub(r"par_patch\s*=\s*PathPatch\(par_path,\s*edgecolor='blue',\s*linestyle='--',", 
                     r"par_patch = PathPatch(par_path, edgecolor='#ef4444', linestyle='-',", content)

    # 5. Gray lines for segments
    content = re.sub(r"color='#404040',\s*\n\s*linewidth=2\.5,\s*\n\s*alpha=0\.7", 
                     r"color='#64748b',\n                linewidth=2.5,\n                alpha=0.5", content)

    # 6. Legend elements color
    content = re.sub(r"marker='o',\s*color='#404040',", 
                     r"marker='o', color='#64748b',", content)

    # 7. Legend styling
    # Match the legend definition
    content = re.sub(r"(legend\s*=\s*ax\.legend\([\s\S]*?fontsize=10)(\n\))", 
                     r"\1,\n    facecolor='#1e293b', edgecolor='#334155', labelcolor='#e2e8f0'\2", content)
    
    content = re.sub(r"legend\.get_frame\(\)\.set_facecolor\('white'\)", 
                     r"legend.get_frame().set_facecolor('#1e293b')", content)

    # 8. Legend text block bbox
    content = re.sub(r"bbox=dict\(facecolor='white',\s*alpha=0\.8,\s*edgecolor='black',", 
                     r"color='#e2e8f0',\n    bbox=dict(facecolor='#1e293b', alpha=0.9, edgecolor='#334155',", content)

    # 9. Processed By text
    content = re.sub(r"Processed By: Philippine Typhoon/Weather", 
                     r"Processed By: Calauan Weather", content)

    # 10. Title styling
    content = re.sub(r"(ax\.set_title\(.*?, fontsize=16, weight='bold')(\))", 
                     r"\1, color='#f8fafc', pad=20\2", content)

    # 11. Savefig facecolor
    content = re.sub(r"plt\.savefig\(output_file, dpi=300, bbox_inches='tight'\)", 
                     r"plt.savefig(output_file, dpi=300, bbox_inches='tight', facecolor=fig.get_facecolor(), edgecolor='none')", content)
                     
    # Also fix some issues in Forcast2 and 3 with 'A?' characters
    content = content.replace("intervals at 5A", "intervals at 5°")
    content = content.replace("920?\"945", "920–945")
    content = content.replace("945?\"970", "945–970")
    content = content.replace("970?\"990", "970–990")
    content = content.replace("990?\"1005", "990–1005")

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print(f"Updated {file}")
