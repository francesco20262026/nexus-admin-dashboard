"""
Fix: Move /windoc/contacts and /windoc/import routes BEFORE /{client_id} in clients/router.py
FastAPI matches routes in order - /windoc/contacts is being matched as /{client_id}=windoc
which then fails UUID validation.
"""
import re

with open('e:/App/crm/backend/modules/clients/router.py', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')

# Find the boundaries:
# 1) The "# -- Get ---" section that has @router.get("/{client_id}")
# 2) The "# -- Windoc Import ---" section that has /windoc/contacts and /windoc/import

def find_section_start(lines, marker):
    for i, line in enumerate(lines):
        if marker in line:
            # Walk back to get the preceding comment block
            j = i
            while j > 0 and (lines[j-1].strip().startswith('#') or lines[j-1].strip() == ''):
                j -= 1
            return j
    return None

def find_next_section(lines, start_idx, exclude_defs=None):
    """Find where the next major section starts (next @router.get/post/put/delete or class definition)"""
    for i in range(start_idx + 1, len(lines)):
        line = lines[i]
        if re.match(r'^@router\.(get|post|put|delete|patch)\(', line) or re.match(r'^class \w+\(BaseModel\)', line):
            # Walk back to grab preceding blank lines/comments
            j = i
            while j > 0 and (lines[j-1].strip().startswith('#') or lines[j-1].strip() == ''):
                j -= 1
            return j
    return len(lines)

# Find the client_id GET route start
client_id_get_line = None
for i, line in enumerate(lines):
    if '@router.get("/{client_id}")' in line or "@router.get('/{client_id}')" in line:
        # Walk back to comment block
        j = i
        while j > 0 and (lines[j-1].strip().startswith('#') or lines[j-1].strip() == ''):
            j -= 1
        client_id_get_line = j
        break

# Find the windoc contacts route start
windoc_start = None
for i, line in enumerate(lines):
    if '# -- Windoc Import' in line or '# ── Windoc Import' in line:
        windoc_start = i
        break

# Find the windoc section end (end of file or next major section after windoc)
windoc_end = len(lines)

print(f"client_id GET starts at line {client_id_get_line + 1 if client_id_get_line is not None else 'NOT FOUND'}")
print(f"windoc section starts at line {windoc_start + 1 if windoc_start is not None else 'NOT FOUND'}")
print(f"windoc section ends at line {windoc_end}")

if client_id_get_line is None or windoc_start is None:
    print("ERROR: Could not find required sections")
    exit(1)

if windoc_start < client_id_get_line:
    print("Routes are already in correct order - no reordering needed")
    exit(0)

# Extract sections
before_client_id = lines[:client_id_get_line]
client_id_onwards = lines[client_id_get_line:windoc_start]
windoc_section = lines[windoc_start:windoc_end]

# Reconstruct: before_client_id + windoc_section + client_id_onwards 
new_lines = before_client_id + ['\n'] + windoc_section + ['', ''] + client_id_onwards

new_content = '\n'.join(new_lines)

with open('e:/App/crm/backend/modules/clients/router.py', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("SUCCESS: Reordered routes - windoc routes now BEFORE /{client_id}")

# Verify
with open('e:/App/crm/backend/modules/clients/router.py', 'r', encoding='utf-8') as f:
    verify_lines = f.readlines()

windoc_pos = client_pos = None
for i, line in enumerate(verify_lines):
    if '/windoc/contacts' in line and windoc_pos is None:
        windoc_pos = i + 1
    if '/{client_id}' in line and 'router.get' in line and client_pos is None:
        client_pos = i + 1

print(f"After fix: windoc/contacts at line {windoc_pos}, /" + "{client_id} GET at line " + str(client_pos))
if windoc_pos and client_pos and windoc_pos < client_pos:
    print("VERIFIED: windoc routes are now BEFORE /{client_id}")
else:
    print("WARNING: May need manual check")
