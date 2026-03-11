// workspace-manager.js

const WorkspaceManager = {
  workspaces: [],
  activeId: null,
  _switching: false,

  // --- Persistence ---

  _storageKey: 'codeContext_workspaces_v2',
  _activeKey: 'codeContext_activeId_v2',

  save() {
    const serializable = this.workspaces.map(ws => ({
      ...ws,
      // fileCache can be large; persist it per-workspace
      fileCache: ws.fileCache || {}
    }));
    try {
      localStorage.setItem(this._storageKey, JSON.stringify(serializable));
      localStorage.setItem(this._activeKey, this.activeId);
    } catch (e) {
      // localStorage quota exceeded (large fileCaches) — save without cache
      try {
        const slim = this.workspaces.map(ws => ({ ...ws, fileCache: {} }));
        localStorage.setItem(this._storageKey, JSON.stringify(slim));
        localStorage.setItem(this._activeKey, this.activeId);
      } catch {}
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(this._storageKey);
      const savedId = localStorage.getItem(this._activeKey);
      if (raw) {
        this.workspaces = JSON.parse(raw);
        // Restore non-serializable runtime state
        this.workspaces.forEach(ws => {
          if (!ws.fileCache) ws.fileCache = {};
          if (!ws.selectedPaths) ws.selectedPaths = new Set();
          else ws.selectedPaths = new Set(ws.selectedPaths);
          if (!ws.expandedDirs) ws.expandedDirs = new Set();
          else ws.expandedDirs = new Set(ws.expandedDirs);
        });
        if (savedId && this.workspaces.find(ws => ws.id === savedId)) {
          this.activeId = savedId;
        } else if (this.workspaces.length > 0) {
          this.activeId = this.workspaces[0].id;
        }
        return true;
      }
    } catch (e) {}
    return false;
  },

  // --- Workspace lifecycle ---

  _newId() {
    return 'ws_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  },

  _blankWorkspace(label) {
    return {
      id: this._newId(),
      label: label || 'New Tab',
      repoUrl: 'https://github.com/jblarson/neurofold',
      branch: null,
      branches: [],
      defaultBranch: null,
      commitMessage: '',
      owner: null,
      repo: null,
      treeData: null,           // raw GitHub tree JSON
      fileCache: {},            // path -> content
      selectedPaths: new Set(), // checked file paths
      expandedDirs: new Set(),  // expanded dir paths
      instructions: '',
      output: '',
      neurofoldToggle: false,
      multiMode: false,
      advancedPaths: false,
      multiConfig: {
        frontendPath: 'frontend',
        componentsPath: 'frontend/src/components',
        graphSubdirNames: ['graph', 'graph2d', 'graph_semantic', 'graph_geometric'],
        holdingResponse: 'We are building a decentralized collective intelligence'
      }
    };
  },

  create(label) {
    const ws = this._blankWorkspace(label);
    this.workspaces.push(ws);
    this.save();
    return ws;
  },

  getActive() {
    return this.workspaces.find(ws => ws.id === this.activeId) || null;
  },

  get(id) {
    return this.workspaces.find(ws => ws.id === id) || null;
  },

  remove(id) {
    const idx = this.workspaces.findIndex(ws => ws.id === id);
    if (idx === -1) return;
    this.workspaces.splice(idx, 1);
    if (this.activeId === id) {
      const next = this.workspaces[Math.max(0, idx - 1)];
      this.activeId = next ? next.id : null;
    }
    this.save();
  },

  updateLabel(id, label) {
    const ws = this.get(id);
    if (ws) { ws.label = label; this.save(); }
  },

  // --- State snapshot / restore ---

  snapshotActive() {
    const ws = this.getActive();
    if (!ws || this._switching) return;

    // DOM -> state
    const ui = UI.elements;

    ws.repoUrl = ui.repoUrlInput.value;
    ws.neurofoldToggle = document.getElementById('neurofoldSrcToggle')?.checked || false;
    ws.instructions = ui.userInstructions.value;
    ws.output = ui.outputMessage.value;
    ws.multiMode = ui.multiModeToggle?.checked || false;
    ws.advancedPaths = document.getElementById('advancedPathsToggle')?.checked || false;

    // Multi config fields
    const fp = document.getElementById('frontendPath');
    const cp = document.getElementById('componentsPath');
    const gs = document.getElementById('graphSubdirsInput');
    const hr = document.getElementById('holdingResponse');
    if (fp) ws.multiConfig.frontendPath = fp.value;
    if (cp) ws.multiConfig.componentsPath = cp.value;
    if (gs) ws.multiConfig.graphSubdirNames = gs.value.split(',').map(s => s.trim()).filter(Boolean);
    if (hr) ws.multiConfig.holdingResponse = hr.value;

    // Snapshot branch selector
    const branchEl = ui.branchSelect;
    if (branchEl && !branchEl.disabled) {
      ws.branch = branchEl.value;
      ws.branches = Array.from(branchEl.options).map(o => o.value);
    }

    // Snapshot commit message
    ws.commitMessage = ui.commitInfo?.textContent || '';

    // Snapshot checked paths and expanded dirs from DOM
    ws.selectedPaths = new Set();
    ui.fileListContainer.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
      if (cb.dataset.nodeType === 'file') ws.selectedPaths.add(cb.value);
    });

    ws.expandedDirs = new Set();
    ui.fileListContainer.querySelectorAll('.dir-toggle.open').forEach(toggle => {
      const li = toggle.closest('.file-tree-node');
      if (li) ws.expandedDirs.add(li.dataset.nodePath);
    });

    // fileCache is already kept on ws by reference via GitHubAPI.fileCache
    // (we sync it below in switchTo)
    ws.fileCache = { ...GitHubAPI.fileCache };
    ws.owner = GitHubAPI.currentRepo?.owner || null;
    ws.repo = GitHubAPI.currentRepo?.repo || null;

    this.save();
  },

  restoreInto(ws) {
    this._switching = true;
    const ui = UI.elements;

    // Restore URL + neurofold toggle
    ui.repoUrlInput.value = ws.repoUrl || '';
    const nfToggle = document.getElementById('neurofoldSrcToggle');
    if (nfToggle) nfToggle.checked = ws.neurofoldToggle || false;

    // Restore instructions / output
    ui.userInstructions.value = ws.instructions || '';
    ui.outputMessage.value = ws.output || '';

    // Restore multi-mode UI
    if (ui.multiModeToggle) {
      ui.multiModeToggle.checked = ws.multiMode || false;
      if (ui.multiModeConfig) {
        ui.multiModeConfig.style.display = ws.multiMode ? 'block' : 'none';
      }
    }

    const advToggle = document.getElementById('advancedPathsToggle');
    const advConfig = document.getElementById('advancedPathsConfig');
    if (advToggle) advToggle.checked = ws.advancedPaths || false;
    if (advConfig) advConfig.style.display = ws.advancedPaths ? 'block' : 'none';

    // Restore multi config fields
    const fp = document.getElementById('frontendPath');
    const cp = document.getElementById('componentsPath');
    const gs = document.getElementById('graphSubdirsInput');
    const hr = document.getElementById('holdingResponse');
    if (fp) fp.value = ws.multiConfig?.frontendPath || 'frontend';
    if (cp) cp.value = ws.multiConfig?.componentsPath || 'frontend/src/components';
    if (gs) gs.value = (ws.multiConfig?.graphSubdirNames || []).join(', ');
    if (hr) hr.value = ws.multiConfig?.holdingResponse || '';

    // Restore GitHub API state
    GitHubAPI.fileCache = ws.fileCache || {};
    if (ws.owner && ws.repo && ws.branch) {
      GitHubAPI.currentRepo = { owner: ws.owner, repo: ws.repo, branch: ws.branch };
    } else {
      GitHubAPI.currentRepo = null;
    }

    // Restore branch selector
    if (ws.branches && ws.branches.length > 0) {
      ui.branchSelect.innerHTML = ws.branches
        .map(b => `<option value="${b}"${b === ws.branch ? ' selected' : ''}>${b}</option>`)
        .join('');
      ui.branchSelect.disabled = false;
    } else {
      ui.branchSelect.innerHTML = '<option>Pending...</option>';
      ui.branchSelect.disabled = true;
    }

    // Restore commit info
    if (ui.commitInfo) ui.commitInfo.textContent = ws.commitMessage || '';

    // Restore file tree
    if (ws.treeData && ws.treeData.tree && ws.treeData.tree.length) {
      ui.fileListContainer.innerHTML = '';
      const tree = UI.buildTree(ws.treeData.tree);
      UI.renderTree(tree, ui.fileListContainer);

      // Re-apply checked state
      ui.fileListContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (cb.dataset.nodeType === 'file' && ws.selectedPaths.has(cb.value)) {
          cb.checked = true;
        }
      });

      // Re-apply expanded dirs
      ui.fileListContainer.querySelectorAll('.file-tree-node').forEach(li => {
        const path = li.dataset.nodePath;
        if (ws.expandedDirs.has(path)) {
          const sub = li.querySelector(':scope > ul');
          const toggle = li.querySelector(':scope > .node-content .dir-toggle');
          if (sub) sub.style.display = 'block';
          if (toggle) toggle.classList.add('open');
        }
      });

      // Recompute indeterminate states on dir checkboxes
      ui.fileListContainer.querySelectorAll('[data-node-type="dir"]').forEach(dirCb => {
        const dirLi = dirCb.closest('.file-tree-node');
        const children = dirLi.querySelectorAll('input[type="checkbox"][data-node-type="file"]');
        const total = children.length;
        const checked = [...children].filter(x => x.checked).length;
        if (checked === 0) { dirCb.checked = false; dirCb.indeterminate = false; }
        else if (checked === total) { dirCb.checked = true; dirCb.indeterminate = false; }
        else { dirCb.checked = false; dirCb.indeterminate = true; }
      });

      ui.selectAllBtn.disabled = false;
      ui.deselectAllBtn.disabled = false;
    } else {
      ui.fileListContainer.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-dim);">Enter URL and fetch to load file tree.</div>`;
      ui.selectAllBtn.disabled = true;
      ui.deselectAllBtn.disabled = true;
    }

    // Clear any stale status
    UI.clearStatus();
    UI.clearAuthError();

    this._switching = false;
  },

  switchTo(id) {
    if (id === this.activeId) return;
    this.snapshotActive();
    this.activeId = id;
    const ws = this.get(id);
    if (ws) this.restoreInto(ws);
    this.save();
    TabBar.render();
  },

  // Called when treeData is freshly loaded for the active workspace
  setTreeData(treeData) {
    const ws = this.getActive();
    if (ws) {
      ws.treeData = treeData;
      this.save();
    }
  }
};