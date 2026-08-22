import os

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    modified = False
    
    if '\x0clex' in content:
        content = content.replace('\x0clex', '`flex')
        modified = True
        
    if 'className={\\x0clex' in content:
        content = content.replace('className={\\x0clex', 'className={`flex')
        modified = True
        
    if 'className={\x0clex' in content:
        content = content.replace('className={\x0clex', 'className={`flex')
        modified = True

    if 'className={\\\x0clex' in content:
        content = content.replace('className={\\\x0clex', 'className={`flex')
        modified = True

    if '# sicario-red-team\\n\\nAutonomous Agentic' in content:
        content = content.replace('skillContext: # sicario-red-team\\n\\nAutonomous Agentic Red-Teaming Swarm Protocol.\\n\\n## Agent Capabilities\\n- Scan repositories for security issues\\n- Execute agent swarms for red-teaming\\n\\n\\\\\\ ash\\nchrona add sicario-red-team\\n\\\\\\`,', 'skillContext: `# sicario-red-team\\n\\nAutonomous Agentic Red-Teaming Swarm Protocol.\\n\\n## Agent Capabilities\\n- Scan repositories for security issues\\n- Execute agent swarms for red-teaming\\n\\n```bash\\nchrona add sicario-red-team\\n````,')
        modified = True

    if 'provenant-sdk' in content and '\\\\\\ ash' in content:
        content = content.replace('skillContext: # provenant-sdk\\n\\nZero-trust micropayments.\\n\\n\\\\\\ ash\\nchrona add provenant-sdk\\n\\\\\\`,', 'skillContext: `# provenant-sdk\\n\\nZero-trust micropayments.\\n\\n```bash\\nchrona add provenant-sdk\\n````,')
        modified = True

    if '\\} `}' in content:
        content = content.replace('\\} `}', '`} `}')
        modified = True
        
    if modified:
        print(f'Fixed {filepath}')
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

for root, _, files in os.walk(r'c:\chrona\chrona-landing\src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            fix_file(os.path.join(root, file))
