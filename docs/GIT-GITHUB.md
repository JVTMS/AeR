# Git + GitHub — Guia Completo do AeR

> **Repositório:** https://github.com/JVTMS/AeR  
> **Branch principal:** `main`  
> **Ambiente:** Windows 11 + PowerShell

---

## 1. Configuração Inicial (já feito)

O Git já está configurado no projeto. Caso precise reconfigrar:

```powershell
# Configurar identidade (global)
git config --global user.name "JVTMS"
git config --global user.email "loud.jorda.leleo@gmail.com"

# Verificar configuração
git config --list
```

---

## 2. Fluxo Diário

### Ver o que mudou

```powershell
# Status resumido (M = modificado, A = adicionado, D = removido, ? = novo)
git status --short

# Status detalhado
git status

# Ver o que mudou dentro dos arquivos
git diff

# Ver diff de um arquivo específico
git diff frontend/js/pages/dashboard.js
```

### Fazer commit

```powershell
# Adicionar todos os arquivos
git add -A

# Adicionar arquivo específico
git add frontend/js/pages/github.js

# Criar commit
git commit -m "feat: descrição do que foi feito"

# Exemplos de mensagens profissionais:
# feat: adiciona nova funcionalidade
# fix: corrige bug no monitor
# refactor: reorganiza estrutura do optimizer
# docs: atualiza documentação
# chore: atualiza dependências
```

### Enviar para o GitHub (Push)

```powershell
# Push normal (branch atual)
git push

# Primeiro push de uma nova branch
git push -u origin nome-da-branch
```

### Baixar alterações do GitHub (Pull)

```powershell
# Pull da branch atual
git pull

# Pull de branch específica
git pull origin main
```

---

## 3. Branches

```powershell
# Ver branch atual
git branch

# Ver todas as branches (local + remote)
git branch -a

# Criar nova branch
git checkout -b feature/nova-funcionalidade

# Trocar de branch
git checkout main
git checkout feature/nova-funcionalidade

# Atualizar branch com o que está na main
git merge main

# Deletar branch local (apenas após merge)
git branch -d feature/nova-funcionalidade
```

---

## 4. Histórico

```powershell
# Ver histórico compacto
git log --oneline

# Ver histórico com gráfico de branches
git log --oneline --graph --all

# Ver histórico detalhado (últimos 5 commits)
git log -5

# Ver quem alterou cada linha de um arquivo
git blame frontend/js/pages/dashboard.js

# Ver o que mudou em um commit específico
git show f8a4eef
```

---

## 5. Resolver Conflitos

Quando um pull ou merge resulta em conflito:

```powershell
# 1. Ver arquivos com conflito
git status

# 2. Abrir o arquivo com conflito — ele terá marcações como:
# <<<<<<< HEAD
# (seu código)
# =======
# (código do remote)
# >>>>>>> origin/main

# 3. Edite o arquivo, escolhendo o que manter, e remova as marcações

# 4. Marcar como resolvido
git add arquivo-com-conflito.js

# 5. Finalizar o merge
git commit -m "fix: resolve conflito em arquivo-com-conflito.js"
```

---

## 6. Recuperar Versões Anteriores

```powershell
# Ver hash dos commits
git log --oneline

# Ver como estava um arquivo em um commit anterior
git show f8a4eef:frontend/js/pages/dashboard.js

# Restaurar um arquivo para a versão do último commit (DESCARTA alterações locais)
git checkout -- frontend/js/pages/dashboard.js

# Criar uma branch a partir de um commit antigo
git checkout -b recuperacao f8a4eef
```

> ⚠️ **ATENÇÃO:** `git reset --hard` e `git clean -fd` são operações destrutivas.
> Nunca execute sem ter certeza. O painel GitHub do AeR pede confirmação antes dessas ações.

---

## 7. Proteger Secrets e Tokens

**NUNCA commit arquivos com:**
- Tokens de API
- Senhas
- Chaves privadas (`.pem`, `.key`, `.p12`)
- Arquivos `.env`

O `.gitignore` já bloqueia:
```
.env
.env.local
*.secrets.json
*.pem / *.key / *.p12 / *.pfx
```

**Se acidentalmente commitou um secret:**

```powershell
# 1. IMEDIATAMENTE revogue o token no GitHub/serviço
# 2. Remover o arquivo do tracking (sem deletar)
git rm --cached arquivo-com-secret.json

# 3. Adicionar ao .gitignore
echo "arquivo-com-secret.json" >> .gitignore

# 4. Commitar a remoção
git add -A
git commit -m "security: remove arquivo com credenciais"

# 5. Forçar reescrita do histórico (avançado — use com cuidado)
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch arquivo-com-secret.json" --prune-empty --tag-name-filter cat -- --all
git push origin main --force
```

---

## 8. Comandos de Emergência

```powershell
# Desfazer último commit (mantém as alterações nos arquivos)
git reset --soft HEAD~1

# Ver o que estava no último commit
git diff HEAD~1 HEAD

# Salvar trabalho temporariamente (sem commit)
git stash

# Recuperar trabalho salvo com stash
git stash pop

# Ver lista de stashes
git stash list
```

---

## 9. Painel Visual no App

Acesse a página **"GitHub"** na sidebar do AeR para:

- 🟢 Ver status de sincronização
- Ver arquivos modificados com indicadores M/A/D
- Fazer commit com mensagem
- Fazer Push e Pull com confirmação de segurança
- Ver histórico de commits
- Criar e trocar branches

---

## 10. Referência Rápida

| Ação | Comando |
|------|---------|
| Status | `git status --short` |
| Adicionar tudo | `git add -A` |
| Commitar | `git commit -m "mensagem"` |
| Push | `git push` |
| Pull | `git pull` |
| Nova branch | `git checkout -b nome` |
| Trocar branch | `git checkout nome` |
| Histórico | `git log --oneline` |
| Diff | `git diff` |
| Abrir GitHub | `start https://github.com/JVTMS/AeR` |
