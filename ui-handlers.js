// ui-handlers.js
const UI = {
  elements: {},
  
  init() {
    this.elements = {
      repoUrlInput: document.getElementById('repoUrl'),
      githubPatInput: document.getElementById('githubPat'),
      patContainer: document.getElementById('patContainer'),
      branchSelect: document.getElementById('branchSelect'),
      commitInfo: document.getElementById('commitInfo'),
      fetchFilesBtn: document.getElementById('fetchFilesBtn'),
      selectAllBtn: document.getElementById('selectAllBtn'),
      deselectAllBtn: document.getElementById('deselectAllBtn'), // New
      fileListContainer: document.getElementById('fileListContainer'),
      userInstructions: document.getElementById('userInstructions'),
      outputMessage: document.getElementById('outputMessage'),
      copyBtn: document.getElementById('copyBtn'),
      statusMessages: document.getElementById('statusMessages'),
      authErrorContainer: document.getElementById('authErrorContainer'),
      authErrorMessage: document.getElementById('authErrorMessage'),
      multiModeToggle: document.getElementById('multiModeToggle'),
      multiModeConfig: document.getElementById('multiModeConfig'),
      generateMultiBtn: document.getElementById('generateMultiBtn'),
      advancedPathsToggle: document.getElementById('advancedPathsToggle'),
      advancedPathsConfig: document.getElementById('advancedPathsConfig'),
      multiMessagesOutput: document.getElementById('multiMessagesOutput')
    };
    
    if (GitHubAPI.token && this.elements.patContainer) {
      this.elements.patContainer.style.display = 'none';
    }
  },
  
  showLoading(msg) {
    this.elements.statusMessages.innerHTML = `<div class="message-area loading-message">${msg}</div>`;
  },
  
  showError(msg) {
    this.elements.statusMessages.innerHTML = `<div class="message-area error-message">${msg}</div>`;
  },
  
  clearStatus() {
    this.elements.statusMessages.innerHTML = '';
  },
  
  showAuthError(msg) {
    this.elements.authErrorMessage.textContent = msg;
    this.elements.authErrorContainer.style.display = 'block';
  },
  
  clearAuthError() {
    this.elements.authErrorContainer.style.display = 'none';
  },
  
  buildTree(items) {
    const root = { children: {} };
    items.filter(i => i.type === 'blob' || i.type === 'tree')
      .sort((a, b) => a.path.localeCompare(b.path))
      .forEach(i => {
        const parts = i.path.split('/');
        let cur = root.children, acc = [];
        parts.forEach((p, idx) => {
          acc.push(p);
          const path = acc.join('/');
          const isFile = idx === parts.length - 1 && i.type === 'blob';
          if (!cur[p]) {
            cur[p] = { name: p, type: isFile ? 'file' : 'dir', path, children: isFile ? null : {} };
          }
          if (cur[p].type === 'dir') cur = cur[p].children;
        });
      });
    return root;
  },
  
  isImageFile(name) {
    return /\.(png|jpe?g|gif|bmp|svg|webp|ico|tif|tiff)$/i.test(name);
  },
  
  renderTree(node, container) {
    if (!node.children) return;
    const ul = document.createElement('ul');
    ul.className = 'file-tree-root';
    Object.values(node.children).sort((a, b) => {
      if (a.type === 'dir' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'dir') return 1;
      return a.name.localeCompare(b.name);
    }).forEach(c => ul.appendChild(this.nodeToElement(c)));
    container.appendChild(ul);
  },
  
  nodeToElement(n) {
    const li = document.createElement('li');
    li.className = `file-tree-node node-type-${n.type}`;
    li.dataset.nodePath = n.path;
    const d = document.createElement('div');
    d.className = 'node-content';

    if (n.type === 'dir') {
      const t = document.createElement('span');
      t.className = 'dir-toggle';
      t.textContent = '▶';
      t.onclick = e => {
        e.stopPropagation();
        const sub = li.querySelector('ul');
        if (!sub) return;
        const show = sub.style.display !== 'block';
        sub.style.display = show ? 'block' : 'none';
        t.classList.toggle('open', show);
      };
      d.appendChild(t);
    }

    if (n.type === 'file' && this.isImageFile(n.name)) {
      const lbl = document.createElement('label');
      lbl.textContent = n.name;
      lbl.style.opacity = '0.6';
      d.appendChild(lbl);
    } else {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = n.path;
      cb.dataset.nodeType = n.type;
      cb.id = `cb-${n.path.replace(/[^A-Za-z0-9_.-]/g, '_')}`;
      const lbl = document.createElement('label');
      lbl.htmlFor = cb.id;
      lbl.textContent = n.name;
      if (n.type === 'dir') lbl.className = 'dir-label';
      d.appendChild(cb);
      d.appendChild(lbl);
      if (n.type === 'file') {
        const ld = document.createElement('span');
        ld.className = 'loading-indicator';
        ld.textContent = 'loading...';
        ld.style.display = 'none';
        d.appendChild(ld);
        cb.onchange = e => this.onFileChange(e);
      } else {
        cb.onchange = e => this.onDirChange(e);
      }
    }

    li.appendChild(d);

    if (n.type === 'dir' && n.children) {
      const sub = document.createElement('ul');
      sub.style.display = 'none';
      Object.values(n.children).sort((a, b) => {
        if (a.type === 'dir' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
      }).forEach(c => sub.appendChild(this.nodeToElement(c)));
      li.appendChild(sub);
    }
    return li;
  },
  
  async onFileChange(e) {
    const cb = e.target, path = cb.value, li = cb.closest('.file-tree-node');
    if (cb.checked && !GitHubAPI.fileCache[path]) {
      // Show local loader
      const loader = li.querySelector('.loading-indicator');
      if (loader) loader.style.display = 'inline';
      
      try {
        const { content, authError } = await GitHubAPI.fetchContent(path);
        GitHubAPI.fileCache[path] = content;
        if (authError) this.showAuthError(authError);
      } catch {
        cb.checked = false;
      } finally {
        if (loader) loader.style.display = 'none';
      }
    }
    this.renderOutput();
    this.updateParents(cb);
  },

  async onDirChange(e) {
    const dirCb = e.target, checked = dirCb.checked, li = dirCb.closest('.file-tree-node');
    const all = li.querySelectorAll('input[type="checkbox"]'), toFetch = [];
    all.forEach(cb => {
      cb.checked = checked;
      cb.indeterminate = false;
      if (checked && cb.dataset.nodeType === 'file' && !GitHubAPI.fileCache[cb.value]) {
        toFetch.push(cb.value);
      }
    });
    
    if (toFetch.length) {
      this.showLoading(`Fetching ${toFetch.length} files...`);
      await Promise.all(toFetch.map(async p => {
        try {
          const { content, authError } = await GitHubAPI.fetchContent(p);
          GitHubAPI.fileCache[p] = content;
          if (authError) this.showAuthError(authError);
        } catch { /* ignore */ }
      }));
      this.clearStatus();
    }
    this.renderOutput();
    this.updateParents(dirCb);
  },

  updateParents(cb) {
    let ul = cb.closest('ul');
    while (ul && !ul.classList.contains('file-tree-root')) {
      const pLi = ul.parentElement;
      const pCb = pLi.querySelector('> .node-content input[type="checkbox"]');
      const children = pLi.querySelectorAll('> ul input[type="checkbox"]');
      const total = children.length;
      const checked = [...children].filter(x => x.checked).length;
      if (checked === 0) { pCb.checked = false; pCb.indeterminate = false; }
      else if (checked === total) { pCb.checked = true; pCb.indeterminate = false; }
      else { pCb.checked = false; pCb.indeterminate = true; }
      ul = pLi.closest('ul');
    }
  },
  
  renderOutput() {
    let out = this.elements.userInstructions.value || '';
    this.elements.fileListContainer.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
      if (cb.dataset.nodeType === 'file' && GitHubAPI.fileCache[cb.value]) {
        out += `\n\n---\n\n${cb.value}\n\n---\n\n${GitHubAPI.fileCache[cb.value]}`;
      }
    });
    this.elements.outputMessage.value = out;
  },

  updatePromptHeader() {
    if (!GitHubAPI.currentRepo) return;
    const header = `This is code context for the ${GitHubAPI.currentRepo.owner}/${GitHubAPI.currentRepo.repo} repository (branch: ${GitHubAPI.currentRepo.branch}).`;
    const suffix = "RESPOND WITH COMPLETE FILES";
    const headerPrefix = "This is code context for the";

    let currentVal = this.elements.userInstructions.value;
    const cleanVal = currentVal.trim();

    if (cleanVal === suffix || cleanVal === "") {
      this.elements.userInstructions.value = `${header}\n\n${suffix}`;
    } else if (currentVal.startsWith(headerPrefix)) {
      const lines = currentVal.split('\n');
      lines[0] = header;
      this.elements.userInstructions.value = lines.join('\n');
    } else {
      this.elements.userInstructions.value = `${header}\n\n${currentVal}`;
    }
    this.renderOutput();
  },

  async updateCommitInfo() {
    if (!GitHubAPI.currentRepo) {
      this.elements.commitInfo.textContent = '';
      return;
    }
    try {
      const { message, authError } = await GitHubAPI.fetchLastCommit(
        GitHubAPI.currentRepo.owner,
        GitHubAPI.currentRepo.repo,
        GitHubAPI.currentRepo.branch
      );
      this.elements.commitInfo.textContent = `Latest commit: ${message}`;
      if (authError) this.showAuthError(authError);
    } catch {
      this.elements.commitInfo.textContent = '';
    }
  },
  
  async loadTree() {
    this.showLoading(`Fetching tree (${GitHubAPI.currentRepo.branch})...`);
    this.elements.fetchFilesBtn.disabled = true;
    this.elements.selectAllBtn.disabled = true;
    this.elements.deselectAllBtn.disabled = true;
    
    this.elements.fileListContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px;">Fetching file list...</p>';
    try {
      const { tree: data, authError } = await GitHubAPI.fetchTree(
        GitHubAPI.currentRepo.owner,
        GitHubAPI.currentRepo.repo,
        GitHubAPI.currentRepo.branch
      );
      
      if (authError) this.showAuthError(authError);
      
      this.elements.fileListContainer.innerHTML = '';
      if (data.truncated) {
        this.elements.fileListContainer.innerHTML = `<div class="message-area warning-message">File list truncated (repo is huge).</div>`;
      }
      if (!data.tree || !data.tree.length) {
        this.elements.fileListContainer.innerHTML += '<p>No files found.</p>';
      } else {
        const tree = this.buildTree(data.tree);
        this.renderTree(tree, this.elements.fileListContainer);
        
        // Enable both buttons now that we have files
        this.elements.selectAllBtn.disabled = false;
        this.elements.deselectAllBtn.disabled = false;
      }
    } catch (e) {
      this.showError(`Fetch error: ${e.message}`);
      this.elements.fileListContainer.innerHTML = '<p>Could not fetch files.</p>';
    } finally {
      this.clearStatus();
      this.elements.fetchFilesBtn.disabled = false;
      this.renderOutput();
    }
  }
};