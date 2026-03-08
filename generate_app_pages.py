import os
import re

base_dir = '/Users/burkinbila/Desktop/yelim-site'
app_dir = os.path.join(base_dir, 'app')

if not os.path.exists(app_dir):
    os.makedirs(app_dir)

legal_files = [
    'legal/privacy.html',
    'legal/support.html',
    'legal/terms.html',
    'legal/mentions-legales.html',
    'legal/affiliates-privacy.html',
    'legal/affiliates-terms.html'
]
root_files = [
    'paiement-progressif.html'
]

back_button_html = '<a href="javascript:history.back()" style="display:inline-block; margin-bottom: 20px; color: #007AFF; text-decoration: none; font-weight: 600; font-family: sans-serif;">&larr; Retour</a>\n'

def process_file(filepath):
    full_path = os.path.join(base_dir, filepath)
    if not os.path.exists(full_path):
        print(f"File not found: {full_path}")
        return
    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Remove main <nav>...</nav>
    # Note: re.sub with dotall to match across newlines for the first <nav> up to closing </nav>
    # The first nav is usually the site navigation.
    # We will use targeted replacement.
    content = re.sub(r'<nav[^>]*>.*? Retour au site\s*</a>\s*</nav>', '', content, flags=re.DOTALL | re.IGNORECASE)
    
    # Alternatively, specifically remove the top nav (first <nav> match)
    if '<nav>' in content:
        content = re.sub(r'<nav>.*?</nav>', '', content, count=1, flags=re.DOTALL)
        
    # Remove breadcrumb
    content = re.sub(r'<nav class="breadcrumb".*?</nav>', '', content, flags=re.DOTALL)
    
    # Remove tag-pill
    content = re.sub(r'<div class="tag-pill">.*?</div>', '', content, flags=re.DOTALL)
    
    # Remove footer
    content = re.sub(r'<footer class="legal-footer">.*?</footer>', '', content, flags=re.DOTALL)
    
    # Inject back button
    # If there is <main class="page">, insert it right after.
    if '<main class="page">' in content:
        content = content.replace('<main class="page">', f'<main class="page">\n        {back_button_html}')
    elif '<div class="container">' in content:
        content = content.replace('<div class="container">', f'<div class="container">\n        {back_button_html}')
    else:
        # Just put it inside <body>
        content = content.replace('<body>', f'<body>\n    {back_button_html}')

    # Output to app/
    filename = os.path.basename(filepath)
    out_path = os.path.join(app_dir, filename)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Processed: {filename} -> {out_path}")

for f in legal_files + root_files:
    process_file(f)

print("All files processed.")
