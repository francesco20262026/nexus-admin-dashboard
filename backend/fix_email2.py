files = ['modules/quotes/router.py', 'modules/contracts/router.py']
for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
        
    content = content.replace('variables={', 'lang="it",\n            variables={')
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'Fixed {file}')
