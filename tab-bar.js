// tab-bar.js

const TabBar = {
  _container: null,

  init() {
    this._container = document.getElementById('tabBarContainer');
    this.render();
  },

  render() {
    if (!this._container) return;
    this._container.innerHTML = '';

    const strip = document.createElement('div');
    strip.className = 'tab-strip';

    WorkspaceManager.workspaces.forEach(ws => {
      const tab = document.createElement('div');
      tab.className = 'tab-item' + (ws.id === WorkspaceManager.activeId ? ' tab-active' : '');
      tab.dataset.wsId = ws.id;

      // Label (double-click to rename)
      const label = document.createElement('span');
      label.className = 'tab-label';
      label.textContent = ws.label;
      label.title = ws.repoUrl || ws.label;

      label.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this._startRename(ws.id, label);
      });

      // Close button (only show if more than 1 tab)
      const close = document.createElement('button');
      close.className = 'tab-close';
      close.innerHTML = '&times;';
      close.title = 'Close tab';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        this._closeTab(ws.id);
      });

      tab.appendChild(label);
      if (WorkspaceManager.workspaces.length > 1) tab.appendChild(close);

      tab.addEventListener('click', () => {
        if (ws.id !== WorkspaceManager.activeId) {
          WorkspaceManager.switchTo(ws.id);
        }
      });

      strip.appendChild(tab);
    });

    // New tab button
    const addBtn = document.createElement('button');
    addBtn.className = 'tab-add';
    addBtn.innerHTML = '+';
    addBtn.title = 'New workspace tab';
    addBtn.addEventListener('click', () => {
      WorkspaceManager.snapshotActive();
      const ws = WorkspaceManager.create('New Tab');
      WorkspaceManager.activeId = ws.id;
      WorkspaceManager.restoreInto(ws);
      WorkspaceManager.save();
      this.render();
    });

    strip.appendChild(addBtn);
    this._container.appendChild(strip);
  },

  _startRename(id, labelEl) {
    const ws = WorkspaceManager.get(id);
    if (!ws) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = ws.label;
    input.className = 'tab-rename-input';

    const finish = () => {
      const val = input.value.trim();
      if (val) WorkspaceManager.updateLabel(id, val);
      this.render();
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = ws.label; input.blur(); }
    });

    labelEl.replaceWith(input);
    input.focus();
    input.select();
  },

  _closeTab(id) {
    if (WorkspaceManager.workspaces.length <= 1) return;
    WorkspaceManager.remove(id);
    const next = WorkspaceManager.getActive();
    if (next) WorkspaceManager.restoreInto(next);
    this.render();
  },

  // Update the active tab's label based on repo info
  updateActiveLabel(owner, repo) {
    const ws = WorkspaceManager.getActive();
    if (!ws) return;
    const label = repo ? `${owner}/${repo}` : 'New Tab';
    WorkspaceManager.updateLabel(ws.id, label);
    this.render();
  }
};