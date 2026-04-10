import os

def clean_file(path):
    if not os.path.exists(path):
        return
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove trailing Arabic or Latin question marks followed by optional spaces and a quote
    import re
    cleaned = re.sub(r'[؟?]\s*"', '"', content)
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(cleaned)

clean_file('q702.html')
clean_file('questionsData.js')
print("Successfully cleaned files.")
